#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
DerKumpel Setup

  ./setup.sh install --base-url https://derkumpel.example.org [--redmine-url https://redmine.vgo-o.de] [--bind 127.0.0.1] [--port 8080]
  ./setup.sh start
  ./setup.sh stop
  ./setup.sh restart
  ./setup.sh status
  ./setup.sh logs
  ./setup.sh update
  ./setup.sh caddy
  ./setup.sh push-enable --contact mailto:admin@example.org

`install` writes .env with a random session key and starts the app behind the
expected external reverse proxy. `caddy` starts the optional Caddy profile.
EOF
}

need() { command -v "$1" >/dev/null 2>&1 || { echo "Fehlt: $1" >&2; exit 1; }; }
compose() { docker compose "$@"; }

command=${1:-help}
[ $# -gt 0 ] && shift || true

case "$command" in
  install)
    need docker
    need openssl
    docker compose version >/dev/null
    base_url=''
    redmine_url='https://redmine.vgo-o.de'
    bind='127.0.0.1'
    port='8080'
    force='false'
    while [ $# -gt 0 ]; do
      case "$1" in
        --base-url) base_url=${2:?}; shift 2 ;;
        --redmine-url) redmine_url=${2:?}; shift 2 ;;
        --bind) bind=${2:?}; shift 2 ;;
        --port) port=${2:?}; shift 2 ;;
        --force) force='true'; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unbekannte Option: $1" >&2; usage; exit 2 ;;
      esac
    done
    [ -n "$base_url" ] || { echo "--base-url ist erforderlich" >&2; exit 2; }
    if [ -f .env ] && [ "$force" != 'true' ]; then
      echo '.env existiert bereits. Nutze --force nur, wenn du sie bewusst ersetzen willst.' >&2
      exit 2
    fi
    session_secret=$(openssl rand -base64 32 | tr -d '\n')
    app_host=$(printf '%s' "$base_url" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##')
    umask 077
    cat > .env <<EOF
NODE_ENV=production
REDMINE_BASE_URL=$redmine_url
PUBLIC_BASE_URL=$base_url
BIND_ADDRESS=$bind
APP_PORT=$port
SESSION_SECRET=$session_secret
SESSION_MAX_AGE_DAYS=30
REDMINE_TIMEOUT_MS=15000
MAX_UPLOAD_MB=25
MAP_DEFAULT_CENTER=7.7546,49.4944
MAP_OFFLINE_BOUNDS=
MAP_OFFLINE_RADIUS_KM=12
POLL_INTERVAL_MS=120000
APP_HOST=$app_host
EOF
    chmod 600 .env
    compose up -d --build app
    echo "DerKumpel läuft intern auf $bind:$port"
    echo "Öffentliche URL: $base_url"
    echo "Für integriertes Caddy: ./setup.sh caddy"
    ;;
  push-enable)
    need docker
    need openssl
    [ -f .env ] || { echo 'Zuerst ./setup.sh install ausführen.' >&2; exit 2; }
    contact=''
    while [ $# -gt 0 ]; do
      case "$1" in
        --contact) contact=${2:?}; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
      esac
    done
    case "$contact" in
      mailto:*@*|https://*) ;;
      *) echo '--contact benötigt mailto:adresse@domain oder https://kontakt-url' >&2; exit 2 ;;
    esac
    if grep -q '^PUSH_ENABLED=true' .env; then
      echo 'Push ist bereits aktiviert. Bestehende VAPID-Schlüssel nicht rotieren; Änderungen in .env vornehmen.' >&2
      exit 2
    fi
    compose build app
    # Generate VAPID keys inside the already-built application image; no host Node installation needed.
    keys=$(compose run --rm --no-deps --entrypoint node app --input-type=module -e \
      'import webpush from "web-push"; const k=webpush.generateVAPIDKeys(); console.log(k.publicKey); console.log(k.privateKey)')
    public=$(printf '%s\n' "$keys" | sed -n '1p')
    private=$(printf '%s\n' "$keys" | sed -n '2p')
    [ -n "$public" ] && [ -n "$private" ] || { echo 'VAPID-Schlüsselerzeugung fehlgeschlagen' >&2; exit 1; }
    secret=$(openssl rand -base64 32 | tr -d '\n')
    umask 077
    tmp_env=$(mktemp .env.push.XXXXXX)
    grep -v '^PUSH_' .env > "$tmp_env"
    mv "$tmp_env" .env
    cat >> .env <<EOF

# Optional: Web Push (secure device subscriptions and per-user polling)
PUSH_ENABLED=true
PUSH_VAPID_PUBLIC_KEY=$public
PUSH_VAPID_PRIVATE_KEY=$private
PUSH_ENCRYPTION_SECRET=$secret
PUSH_CONTACT=$contact
PUSH_DB_PATH=/data/push.sqlite
PUSH_POLL_INTERVAL_MS=120000
EOF
    chmod 600 .env
    compose up -d --force-recreate app
    echo 'DerKumpel Web Push ist aktiviert. Geräteeinrichtung erfolgt in der App unter Mehr -> Einstellungen.'
    ;;
  start) need docker; compose up -d app ;;
  stop) need docker; compose stop ;;
  restart) need docker; compose restart app ;;
  status) need docker; compose ps ;;
  logs) need docker; compose logs -f --tail=200 app ;;
  update) need docker; compose build --pull app; compose up -d app ;;
  caddy) need docker; [ -f .env ] || { echo 'Zuerst install ausführen.' >&2; exit 2; }; compose --profile caddy up -d --build ;;
  help|-h|--help) usage ;;
  *) echo "Unbekannter Befehl: $command" >&2; usage; exit 2 ;;
esac
