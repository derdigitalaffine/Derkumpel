#!/usr/bin/env bash
# Install the optional DerKumpel Web Push stack on Linux, without rotating keys.
# Run from any working directory through ./setup.sh push [options].
set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
REDMINE_SOURCE="$ROOT/integrations/redmine/plugins/derkumpel_push"
TARGET_SCRIPT="$ROOT/scripts/install-redmine-push-target.sh"
TEMP_ENV=''
REMOTE_TMP=''
REDMINE_SSH=''

say() { printf '[DerKumpel Push] %s\n' "$*"; }
die() { printf 'Fehler (Push-Setup): %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Befehl fehlt: $1"; }
usage() {
  cat <<'HELP'
Web Push auf Linux mit nur einem Befehl aktivieren:

  ./setup.sh push --redmine-path /opt/redmine [--redmine-service redmine]
  ./setup.sh push --redmine-compose-dir /opt/redmine-docker [--redmine-service redmine]
  ./setup.sh push --redmine-ssh admin@redmine-host --redmine-path /opt/redmine
  ./setup.sh push --redmine-ssh admin@redmine-host --redmine-compose-dir /opt/redmine
  ./setup.sh push --app-only

Optionen:
  --redmine-path DIR          Native Redmine-Installation mit systemd
  --redmine-compose-dir DIR   Docker-Compose-Projekt von Redmine
  --redmine-ssh USER@HOST     Redmine auf anderem Linux-Server via SSH
  --redmine-service NAME     systemd-Unit oder Docker-Compose-Service (Default: redmine)
  --redmine-plugin-dir DIR   Container-Plugin-Verzeichnis (Default: /usr/src/redmine/plugins/derkumpel_push)
  --subject URI              VAPID-Kontakt (mailto:it@example.org oder HTTPS-URL)
  --app-only                 Nur DerKumpel konfigurieren, keine Redmine-Installation
  -h, --help                 Hilfe

Ohne Redmine-Ziel wird eine eindeutige lokale native Installation erkannt.
Bei mehreren/keinen Treffern ist eine explizite Angabe nötig. Auf dem Remote-
Host ist passwortloses sudo erforderlich.

Bestehende Schlüssel, SESSION_SECRET und alle anderen .env-Werte bleiben erhalten.
HELP
}
MODE=''
REDMINE_PATH=''
REDMINE_SERVICE='redmine'
PLUGIN_DIR='/usr/src/redmine/plugins/derkumpel_push'
SUBJECT=''
APP_ONLY=false

while (($#)); do
  case "$1" in
    --redmine-path|--redmine-compose-dir|--redmine-ssh|--redmine-service|--redmine-plugin-dir|--subject)
      (($# >= 2)) || die "Wert fehlt für $1"
      case "$1" in
        --redmine-path)
          [[ -z $MODE ]] || die '--redmine-path und --redmine-compose-dir nicht kombinieren.'
          MODE=native; REDMINE_PATH=$2 ;;
        --redmine-compose-dir)
          [[ -z $MODE ]] || die '--redmine-path und --redmine-compose-dir nicht kombinieren.'
          MODE=compose; REDMINE_PATH=$2 ;;
        --redmine-ssh) REDMINE_SSH=$2 ;;
        --redmine-service) REDMINE_SERVICE=$2 ;;
        --redmine-plugin-dir) PLUGIN_DIR=$2 ;;
        --subject) SUBJECT=$2 ;;
      esac
      shift 2 ;;
    --app-only) APP_ONLY=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unbekannte Option: $1 (siehe --help)" ;;
  esac
done

need bash
need docker
need openssl
[[ -f $ENV_FILE && ! -L $ENV_FILE ]] || die "Keine reguläre .env gefunden. Zuerst ./setup.sh install ausführen."
[[ -d $REDMINE_SOURCE ]] || die 'Das Redmine-Plugin fehlt im Checkout.'
(cd "$ROOT" && docker compose version >/dev/null) || die 'Docker Compose v2 ist erforderlich.'
[[ $REDMINE_SERVICE =~ ^[A-Za-z0-9_.-]+$ ]] || die 'Ungültiger Redmine-Service-Name.'
[[ $PLUGIN_DIR == /* && $PLUGIN_DIR =~ ^[A-Za-z0-9_./-]+$ ]] || die 'Container-Plugin-Pfad muss absolut sein.'
if [[ -n $REDMINE_SSH ]]; then
  [[ $REDMINE_SSH =~ ^[A-Za-z_][A-Za-z0-9_.-]*@[A-Za-z0-9.-]+$ ]] ||
    die 'Ungültiger SSH-Host, erwartet USER@HOST ohne Shell-Metazeichen.'
  need ssh; need scp; need tar
fi
[[ $APP_ONLY != true || (-z $MODE && -z $REDMINE_SSH) ]] ||
  die '--app-only nicht mit einem Redmine-Ziel kombinieren.'

read_env() {
  # Never source/eval an existing .env (credentials and arbitrary values).
  awk -v key="$1" 'index($0, key "=") == 1 { value = substr($0, length(key) + 2) } END { print value }' "$ENV_FILE"
}
PUBLIC_URL=$(read_env PUBLIC_BASE_URL)
[[ $PUBLIC_URL =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]] ||
  die 'PUBLIC_BASE_URL muss eine HTTPS-URL ohne Pfad sein.'

if [[ $APP_ONLY != true ]]; then
  if [[ -z $MODE ]]; then
    [[ -z $REDMINE_SSH ]] || die 'Bei --redmine-ssh ist --redmine-path oder --redmine-compose-dir nötig.'
    candidates=()
    for candidate in /opt/redmine /srv/redmine /var/www/redmine /var/www/html/redmine /usr/share/redmine; do
      [[ -f "$candidate/config/environment.rb" && -f "$candidate/app/models/issue.rb" ]] &&
        candidates+=("$candidate")
    done
    ((${#candidates[@]} == 1)) ||
      die 'Keine eindeutige lokale Redmine-Installation erkannt. --redmine-path, --redmine-compose-dir, --redmine-ssh oder --app-only angeben.'
    MODE=native
    REDMINE_PATH=${candidates[0]}
    say "Redmine unter $REDMINE_PATH erkannt."
  fi
  [[ $REDMINE_PATH == /* && $REDMINE_PATH =~ ^[A-Za-z0-9_./-]+$ ]] ||
    die 'Redmine-Pfad muss absolut sein und darf keine Leerzeichen/Shell-Metazeichen enthalten.'
  if [[ -z $REDMINE_SSH && $EUID -ne 0 ]]; then
    need sudo
    say 'Für die Plugin-Installation sind einmalig sudo-Rechte nötig.'
    sudo -v || die 'sudo-Autorisierung fehlgeschlagen.'
  fi
  if [[ -n $REDMINE_SSH ]]; then
    ssh -o BatchMode=yes -T "$REDMINE_SSH" 'sudo -n true' ||
      die 'SSH oder passwortloses sudo auf dem Redmine-Host nicht verfügbar.'
  fi
fi

PUBLIC_KEY=$(read_env PUSH_VAPID_PUBLIC_KEY)
PRIVATE_KEY=$(read_env PUSH_VAPID_PRIVATE_KEY)
EVENT_TOKEN=$(read_env PUSH_EVENT_TOKEN)
CURRENT_SUBJECT=$(read_env PUSH_VAPID_SUBJECT)

if [[ -n $PUBLIC_KEY || -n $PRIVATE_KEY ]]; then
  [[ -n $PUBLIC_KEY && -n $PRIVATE_KEY ]] ||
    die 'Es existiert nur einer der beiden VAPID-Schlüssel. Keine automatische Rotation.'
  [[ $PUBLIC_KEY =~ ^[A-Za-z0-9_-]{70,120}$ && $PRIVATE_KEY =~ ^[A-Za-z0-9_-]{30,80}$ ]] ||
    die 'Vorhandene VAPID-Schlüssel sind ungültig. Kein automatisches Überschreiben.'
fi
if [[ -n $EVENT_TOKEN ]]; then
  [[ $EVENT_TOKEN =~ ^[0-9a-fA-F]{64}$ ]] ||
    die 'Vorhandenes PUSH_EVENT_TOKEN ist kein 64-stelliges Hex-Secret.'
fi
if [[ -z $SUBJECT ]]; then
  SUBJECT=$CURRENT_SUBJECT
  if [[ -z $SUBJECT || $SUBJECT == 'mailto:administrator@example.org' ]]; then
    SUBJECT=$PUBLIC_URL
  fi
fi
[[ $SUBJECT =~ ^mailto:[^[:space:]@]+@[^[:space:]@]+$ || $SUBJECT =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]] ||
  die 'VAPID-Subject muss eine mailto:-Adresse oder HTTPS-URL sein.'

cleanup() {
  [[ -z $TEMP_ENV ]] || rm -f -- "$TEMP_ENV"
  if [[ -n $REMOTE_TMP && -n $REDMINE_SSH ]]; then
    ssh -o BatchMode=yes -T "$REDMINE_SSH" "rm -rf -- '$REMOTE_TMP'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Generate using the existing app image; no host Node installation required.
say 'Prüfe/baue das aktuelle DerKumpel-Image ...'
(cd "$ROOT" && docker compose build app)
if [[ -z $PUBLIC_KEY ]]; then
  say 'Erzeuge einmalig VAPID-Schlüssel.'
  key_output=$(cd "$ROOT" && docker compose run --rm -T --no-deps --entrypoint node app \
    -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey);console.log(k.privateKey)") ||
    die 'VAPID-Schlüssel konnten im App-Container nicht erstellt werden.'
  PUBLIC_KEY=$(printf '%s\n' "$key_output" | sed -n '1p')
  PRIVATE_KEY=$(printf '%s\n' "$key_output" | sed -n '2p')
  [[ $PUBLIC_KEY =~ ^[A-Za-z0-9_-]{70,120}$ && $PRIVATE_KEY =~ ^[A-Za-z0-9_-]{30,80}$ ]] ||
    die 'Ungültiges VAPID-Schlüsselpaar zurückgegeben.'
fi
if [[ -z $EVENT_TOKEN ]]; then
  EVENT_TOKEN=$(openssl rand -hex 32) || die 'Zufälliges Event-Token konnte nicht erstellt werden.'
fi

# Atomically replace only Push keys; do not print or leak private values.
TEMP_ENV=$(mktemp "$ROOT/.env.push.tmp.XXXXXXXX")
awk '!/^PUSH_(ENABLED|VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT|EVENT_TOKEN|STORE_FILE)=/' "$ENV_FILE" > "$TEMP_ENV"
printf '\nPUSH_ENABLED=true\nPUSH_VAPID_PUBLIC_KEY=%s\nPUSH_VAPID_PRIVATE_KEY=%s\nPUSH_VAPID_SUBJECT=%s\nPUSH_EVENT_TOKEN=%s\nPUSH_STORE_FILE=/app/push-data/subscriptions.json\n' \
  "$PUBLIC_KEY" "$PRIVATE_KEY" "$SUBJECT" "$EVENT_TOKEN" >> "$TEMP_ENV"
chmod 600 "$TEMP_ENV"
mv -f "$TEMP_ENV" "$ENV_FILE"
TEMP_ENV=''
say 'Push-Konfiguration in .env aktualisiert; Schlüssel bleiben bei Wiederholung gleich.'

say 'Starte DerKumpel mit aktiviertem Push neu ...'
(cd "$ROOT" && docker compose up -d --no-deps --force-recreate app) ||
  die 'DerKumpel konnte nicht neugestartet werden. .env bleibt für einen erneuten Versuch erhalten.'

ready=false
for attempt in {1..20}; do
  if (cd "$ROOT" && docker compose exec -T app node -e \
    "fetch('http://127.0.0.1:8080/api/push/config').then(r=>r.json()).then(x=>{if(!x.enabled||!x.publicKey)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1); then
    ready=true; break
  fi
  sleep 2
done
[[ $ready == true ]] || die 'Push-Endpunkt im Container nicht bereit. Bitte docker compose logs app prüfen.'
say 'Push-API im App-Container erfolgreich geprüft.'

if [[ $APP_ONLY == true ]]; then
  say 'Nur DerKumpel aktiviert. Redmine-Plugin ist noch NICHT installiert.'
  say 'Anleitung für den Redmine-Server: docs/PUSH_NOTIFICATIONS.md'
  exit 0
fi

target_args=(--mode "$MODE" --redmine-path "$REDMINE_PATH" --service "$REDMINE_SERVICE"
  --plugin-dir "$PLUGIN_DIR")
say 'Installiere/aktualisiere die Redmine-Push-Bridge ...'
if [[ -n $REDMINE_SSH ]]; then
  REMOTE_TMP=$(ssh -o BatchMode=yes -T "$REDMINE_SSH" 'mktemp -d /tmp/derkumpel-push.XXXXXXXX') ||
    die 'Kein temporäres Verzeichnis auf dem Redmine-Host.'
  [[ $REMOTE_TMP =~ ^/tmp/derkumpel-push\.[A-Za-z0-9]+$ ]] ||
    die 'Unerwarteter temporärer SSH-Pfad.'
  tar -C "$ROOT/integrations/redmine/plugins" -czf - derkumpel_push |
    ssh -o BatchMode=yes -T "$REDMINE_SSH" "tar -xzf - -C '$REMOTE_TMP'" ||
    die 'Plugin konnte nicht zum Redmine-Host übertragen werden.'
  scp -q "$TARGET_SCRIPT" "$REDMINE_SSH:$REMOTE_TMP/installer.sh" ||
    die 'Remote-Installationsskript konnte nicht übertragen werden.'
  printf '%s\n%s\n' "$PUBLIC_URL" "$EVENT_TOKEN" |
    ssh -o BatchMode=yes -T "$REDMINE_SSH" \
      "sudo -n bash '$REMOTE_TMP/installer.sh' --mode '$MODE' --redmine-path '$REDMINE_PATH' --service '$REDMINE_SERVICE' --plugin-dir '$PLUGIN_DIR' --source '$REMOTE_TMP/derkumpel_push'" ||
    die 'Remote Redmine-Installation fehlgeschlagen. App-Konfiguration bleibt erhalten.'
else
  if [[ $EUID -eq 0 ]]; then
    printf '%s\n%s\n' "$PUBLIC_URL" "$EVENT_TOKEN" |
      bash "$TARGET_SCRIPT" "${target_args[@]}" --source "$REDMINE_SOURCE" ||
      die 'Lokale Redmine-Installation fehlgeschlagen. App-Konfiguration bleibt erhalten.'
  else
    printf '%s\n%s\n' "$PUBLIC_URL" "$EVENT_TOKEN" |
      sudo -n bash "$TARGET_SCRIPT" "${target_args[@]}" --source "$REDMINE_SOURCE" ||
      die 'Lokale Redmine-Installation fehlgeschlagen. App-Konfiguration bleibt erhalten.'
  fi
fi

say 'Fertig: App + Redmine-Plugin konfiguriert, Schlüssel gesichert, Prozesse neugestartet.'
say 'Auf dem Telefon: DerKumpel → Mehr → Push-Benachrichtigungen → Push aktivieren.'
say 'Sicherheitstest mit zwei Redmine-Konten empfohlen (docs/PUSH_NOTIFICATIONS.md).'
