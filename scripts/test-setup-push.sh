#!/usr/bin/env bash
# No Docker daemon, root privileges or Redmine instance required.
set -Eeuo pipefail
temp=$(mktemp -d)
trap 'rm -rf -- "$temp"' EXIT
mkdir -p "$temp/scripts" "$temp/integrations/redmine/plugins/derkumpel_push" "$temp/mockbin"
cp scripts/setup-push.sh "$temp/scripts/setup-push.sh"
cp setup.sh "$temp/setup.sh"
printf '%s\n' "# mocked plugin" > "$temp/integrations/redmine/plugins/derkumpel_push/init.rb"

cat > "$temp/.env" <<'ENV'
NODE_ENV=production
PUBLIC_BASE_URL=https://rm.tromu.de
REDMINE_BASE_URL=https://redmine.example.invalid
SESSION_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
PUSH_ENABLED=false
PUSH_VAPID_PUBLIC_KEY=
PUSH_VAPID_PRIVATE_KEY=
PUSH_VAPID_SUBJECT=mailto:administrator@example.org
PUSH_EVENT_TOKEN=
ENV
cat > "$temp/mockbin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$TEST_DOCKER_LOG"
[[ $1 == compose ]] || exit 1
case "$2" in
  version|build|up|exec) exit 0 ;;
  run)
    # Looks like real base64url encoded VAPID keys; no secret values in logs.
    printf '%087d\n%043d\n' 0 0 ;;
  *) exit 1 ;;
esac
MOCK
chmod +x "$temp/mockbin/docker"
export TEST_DOCKER_LOG="$temp/docker.log"

# CLI documents all installation modes, including remote Redmine.
bash "$temp/setup.sh" push --help > "$temp/help.txt"
grep -Fq -- '--redmine-compose-dir' "$temp/help.txt"
grep -Fq -- '--redmine-ssh' "$temp/help.txt"

PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push --app-only > "$temp/install.log"
grep -qx 'PUSH_ENABLED=true' "$temp/.env"
grep -qx 'PUSH_VAPID_SUBJECT=https://rm.tromu.de' "$temp/.env"
grep -qx 'SESSION_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' "$temp/.env"
grep -Eq '^PUSH_VAPID_PUBLIC_KEY=[0-9]{87}$' "$temp/.env"
grep -Eq '^PUSH_VAPID_PRIVATE_KEY=[0-9]{43}$' "$temp/.env"
grep -Eq '^PUSH_EVENT_TOKEN=[a-f0-9]{64}$' "$temp/.env"
[[ $(stat -c '%a' "$temp/.env") == 600 ]] || { echo 'Insecure .env permissions' >&2; exit 1; }
cp "$temp/.env" "$temp/first.env"

# Reruns must preserve the exact same keys, token and all other settings.
PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push --app-only > "$temp/reinstall.log"
cmp "$temp/.env" "$temp/first.env"
[[ $(grep -c '^compose run ' "$temp/docker.log") == 1 ]] ||
  { echo 'Rerun unexpectedly rotated VAPID keys' >&2; exit 1; }

# Previously configured strong non-hex secrets remain valid and are never rotated.
sed -i 's/^PUSH_EVENT_TOKEN=.*/PUSH_EVENT_TOKEN=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AB/' "$temp/.env"
cp "$temp/.env" "$temp/existing-secret.env"
PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push --app-only > "$temp/existing-secret.log"
cmp "$temp/.env" "$temp/existing-secret.env"

# A malicious/invalid URL must fail before any change to the existing file.
sed -i 's#PUBLIC_BASE_URL=https://rm.tromu.de#PUBLIC_BASE_URL=http://rm.tromu.de#' "$temp/.env"
cp "$temp/.env" "$temp/bad.env"
if PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push --app-only > /dev/null 2>&1; then
  echo 'Accepted insecure public HTTP URL' >&2; exit 1
fi
cmp "$temp/.env" "$temp/bad.env"

# Never run remote commands formed from untrusted SSH host arguments.
sed -i 's#PUBLIC_BASE_URL=http://rm.tromu.de#PUBLIC_BASE_URL=https://rm.tromu.de#' "$temp/.env"
if PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push \
  --redmine-ssh 'admin@host;echo-DANGER' --redmine-path /opt/redmine > /dev/null 2>&1; then
  echo 'Accepted shell metacharacters in SSH host' >&2; exit 1
fi

# Pluginless backend polling: no Redmine SSH or plugin installation.
cat > "$temp/mockbin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -eu
output=''
previous=''
for arg in "$@"; do
  if [[ $previous == -o ]]; then output=$arg; break; fi
  previous=$arg
done
[[ -n $output ]] || exit 1
printf '{"users":[{"id":1}]}\n' > "$output"
MOCK_CURL
chmod +x "$temp/mockbin/curl"
printf '%040d\n' 0 > "$temp/redmine-admin.key"
chmod 600 "$temp/redmine-admin.key"
PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push \
  --push-mode polling --redmine-api-key-file "$temp/redmine-admin.key" \
  --push-poll-interval 45 > "$temp/polling.log"
grep -qx 'PUSH_MODE=polling' "$temp/.env"
grep -qx 'PUSH_POLL_INTERVAL_SECONDS=45' "$temp/.env"
grep -Eq '^PUSH_POLL_API_KEY=[0-9]{40}
grep -Fq 'Pluginfreies Polling aktiviert' "$temp/polling.log"
cp "$temp/.env" "$temp/polling.env"
PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push --push-mode polling > "$temp/polling-repeat.log"
cmp "$temp/.env" "$temp/polling.env"
[[ $(grep -c '^compose run ' "$temp/docker.log") == 1 ]] ||
  { echo 'Polling mode unexpectedly rotated VAPID keys' >&2; exit 1; }

# Switching back to plugin mode clears the high-privilege admin API key.
PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push --push-mode plugin --app-only > "$temp/plugin-repeat.log"
grep -qx 'PUSH_MODE=plugin' "$temp/.env"
grep -qx 'PUSH_POLL_API_KEY=' "$temp/.env"
grep -qx 'SESSION_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' "$temp/.env"

# Never accept weak API key files, symlinks, or world-readable secrets.
cp "$temp/.env" "$temp/before-bad-key.env"
chmod 644 "$temp/redmine-admin.key"
if PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push \
  --push-mode polling --redmine-api-key-file "$temp/redmine-admin.key" >/dev/null 2>&1; then
  echo 'Accepted world-readable API key' >&2; exit 1
fi
cmp "$temp/.env" "$temp/before-bad-key.env"

echo 'Push Linux installer: idempotence, polling/plugin switching, secret preservation and rejection checks OK'
 "$temp/.env"
grep -Fq 'Pluginfreies Polling aktiviert' "$temp/polling.log"
cp "$temp/.env" "$temp/polling.env"
PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push --push-mode polling > "$temp/polling-repeat.log"
cmp "$temp/.env" "$temp/polling.env"
[[ $(grep -c '^compose run ' "$temp/docker.log") == 1 ]] ||
  { echo 'Polling mode unexpectedly rotated VAPID keys' >&2; exit 1; }

# Switching back to plugin mode clears the high-privilege admin API key.
PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push --push-mode plugin --app-only > "$temp/plugin-repeat.log"
grep -qx 'PUSH_MODE=plugin' "$temp/.env"
grep -qx 'PUSH_POLL_API_KEY=' "$temp/.env"
grep -qx 'SESSION_SECRET=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' "$temp/.env"

# Never accept weak API key files, symlinks, or world-readable secrets.
cp "$temp/.env" "$temp/before-bad-key.env"
chmod 644 "$temp/redmine-admin.key"
if PATH="$temp/mockbin:$PATH" bash "$temp/setup.sh" push \
  --push-mode polling --redmine-api-key-file "$temp/redmine-admin.key" >/dev/null 2>&1; then
  echo 'Accepted world-readable API key' >&2; exit 1
fi
cmp "$temp/.env" "$temp/before-bad-key.env"

echo 'Push Linux installer: idempotence, polling/plugin switching, secret preservation and rejection checks OK'
