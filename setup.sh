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
MAP_STYLE_URL=https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json
MAP_DEFAULT_CENTER=7.77,49.50
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
  start) need docker; compose up -d app ;;
  stop) need docker; compose stop app ;;
  restart) need docker; compose restart app ;;
  status) need docker; compose ps ;;
  logs) need docker; compose logs -f --tail=200 app ;;
  update) need docker; compose build --pull app; compose up -d app ;;
  caddy) need docker; [ -f .env ] || { echo 'Zuerst install ausführen.' >&2; exit 2; }; compose --profile caddy up -d --build ;;
  help|-h|--help) usage ;;
  *) echo "Unbekannter Befehl: $command" >&2; usage; exit 2 ;;
esac
