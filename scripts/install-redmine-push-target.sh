#!/usr/bin/env bash
# Runs on the Redmine Linux host as root (locally or through an SSH stream).
# Two lines on stdin: public DerKumpel URL; shared webhook token. Never echo token.
set -Eeuo pipefail
umask 077

die() { printf 'Fehler (Redmine): %s\n' "$*" >&2; exit 1; }
info() { printf '[Redmine Push] %s\n' "$*"; }

mode=''
redmine_path=''
service='redmine'
plugin_dir='/usr/src/redmine/plugins/derkumpel_push'
source_dir=''

while (($#)); do
  case "$1" in
    --mode|--redmine-path|--service|--plugin-dir|--source)
      (($# >= 2)) || die "Wert fehlt für $1"
      case "$1" in
        --mode) mode=$2 ;;
        --redmine-path) redmine_path=$2 ;;
        --service) service=$2 ;;
        --plugin-dir) plugin_dir=$2 ;;
        --source) source_dir=$2 ;;
      esac
      shift 2 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die 'Root-Rechte erforderlich (sudo).'
[[ $mode == native || $mode == compose ]] || die 'Erwartet --mode native|compose'
[[ -d $source_dir && -f $source_dir/init.rb ]] || die "Plugin-Quellverzeichnis fehlt: $source_dir"
[[ $service =~ ^[A-Za-z0-9_.-]+$ ]] || die 'Ungültiger Service-Name.'
[[ $redmine_path == /* && $redmine_path != *$'\n'* ]] || die 'Redmine-Pfad muss absolut sein.'
[[ $plugin_dir == /* && $plugin_dir =~ ^[A-Za-z0-9_./-]+$ ]] || die 'Container-Plugin-Pfad ungültig.'
IFS= read -r push_url || die 'DerKumpel-URL fehlt auf stdin.'
IFS= read -r event_token || die 'Event-Token fehlt auf stdin.'
[[ $push_url =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]] || die 'Nur eine HTTPS-URL ohne Pfad ist zulässig.'
[[ $event_token =~ ^[A-Fa-f0-9]{64}$ ]] || die 'Event-Token muss aus 64 Hex-Zeichen bestehen.'

# Preflight before changing any Redmine files.
if [[ $mode == native ]]; then
  [[ -f $redmine_path/config/environment.rb && -f $redmine_path/app/models/issue.rb ]] ||
    die "Kein erkennbares Redmine unter: $redmine_path"
  command -v systemctl >/dev/null || die 'systemctl fehlt.'
  systemctl cat "$service" >/dev/null 2>&1 ||
    die "systemd-Service '$service' nicht gefunden (verwende --redmine-service)."
else
  [[ -d $redmine_path ]] || die "Docker-Compose-Verzeichnis fehlt: $redmine_path"
  command -v docker >/dev/null || die 'Docker fehlt.'
  (cd "$redmine_path" && docker compose version >/dev/null) || die 'Docker Compose v2 fehlt.'
  (cd "$redmine_path" && docker compose config --services | grep -Fxq "$service") ||
    die "Docker Compose enthält keinen Service '$service'."
  override="$redmine_path/compose.override.yaml"
  if [[ -e $override ]] && ! grep -Fq '# Managed by DerKumpel Push installer' "$override"; then
    die "Bestehendes $override wird nicht überschrieben. Bitte vorhandene Compose-Overrides zunächst zusammenführen."
  fi
  for other in "$redmine_path/compose.override.yml" "$redmine_path/docker-compose.override.yml" "$redmine_path/docker-compose.override.yaml"; do
    [[ ! -e $other ]] || die "Bestehendes $other muss vor der automatischen Integration geprüft werden."
  done
fi

# Root-owned files, never world-readable token; app/process still receives it via
# EnvironmentFile or Compose env_file, never via checked-in source.
install -d -m 0700 /etc/derkumpel
token_file=/etc/derkumpel/redmine-push.env
temp_file=$(mktemp /etc/derkumpel/redmine-push.env.XXXXXXXX)
trap 'rm -f -- "$temp_file"' EXIT
printf 'DERKUMPEL_PUSH_URL=%s\nDERKUMPEL_PUSH_EVENT_TOKEN=%s\n' "$push_url" "$event_token" > "$temp_file"
chmod 600 "$temp_file"
mv -f "$temp_file" "$token_file"
trap - EXIT

if [[ $mode == native ]]; then
  dest="$redmine_path/plugins/derkumpel_push"
  install -d -m 0755 "$dest"
  cp -a "$source_dir/." "$dest/"
  install -d -m 0755 "/etc/systemd/system/$service.d"
  printf '[Service]\nEnvironmentFile=%s\n' "$token_file" \
    > "/etc/systemd/system/$service.d/derkumpel-push.conf"
  chmod 644 "/etc/systemd/system/$service.d/derkumpel-push.conf"
  systemctl daemon-reload
  systemctl restart "$service"
  systemctl is-active --quiet "$service" || die "Service '$service' wurde nicht aktiv."
  info "Plugin installiert in $dest; systemd-Service '$service' neugestartet."
else
  # Use a persistent host directory, *not* docker cp into the ephemeral image.
  plugin_host='/var/lib/derkumpel/redmine-push-plugin'
  install -d -m 0755 "$plugin_host"
  cp -a "$source_dir/." "$plugin_host/"

  # Default Docker Compose auto-loads compose.override.yaml on future restarts.
  # The override is intentionally self-contained and survives Redmine rebuilds.
  temp_override=$(mktemp "$redmine_path/.derkumpel-compose.XXXXXXXX")
  trap 'rm -f -- "$temp_override"' EXIT
  cat > "$temp_override" <<EOF
# Managed by DerKumpel Push installer. Do not put secrets in this file.
services:
  $service:
    env_file:
      - $token_file
    volumes:
      - $plugin_host:$plugin_dir:ro
EOF
  chmod 644 "$temp_override"
  mv -f "$temp_override" "$override"
  trap - EXIT

  (cd "$redmine_path" && docker compose config --quiet) ||
    die 'Redmine Compose-Konfiguration konnte nicht validiert werden.'
  (cd "$redmine_path" && docker compose up -d --no-deps --force-recreate "$service") ||
    die 'Redmine Compose konnte den Redmine-Service nicht neu erstellen.'
  info "Plugin eingebunden über $override; Docker-Service '$service' neugestartet."
fi

info 'Redmine Push-Bridge installiert. Jetzt mit zwei Redmine-Konten und einem Gerät testen.'
