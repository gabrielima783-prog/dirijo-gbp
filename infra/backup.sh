#!/usr/bin/env bash
set -euo pipefail
root="${DIRIJO_GBP_ROOT:-/srv/dirijo-gbp}"
release_dir="$(readlink -f "$root/state/production/current")"
[ -n "$release_dir" ] && [ -f "$release_dir/compose.production.yaml" ]
release_id="$(basename "$release_dir")"
script_dir="$(cd "$(dirname "$0")" && pwd)"
active_metadata="$root/state/production/domain-migration-active.json"
if [ -f "$active_metadata" ]; then
  active_id="$(python3 - "$active_metadata" "$release_id" <<'PY'
import json, re, sys
with open(sys.argv[1]) as handle:
    active = json.load(handle)
if active.get('new_release') != sys.argv[2] or not re.fullmatch(r'[a-f0-9]{64}', active.get('candidate_id', '')):
    raise SystemExit('Backup runtime and current release disagree')
print(active['candidate_id'])
PY
  )"
  image_id="$(docker inspect --format '{{.Image}}' "$active_id")"
else
  image_id="$(docker image inspect --format '{{.Id}}' "dirijo-gbp:$release_id")"
fi
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid backup image identity' >&2; exit 1; }
exec docker run --rm --network bridge --user 1000:1000 --memory 512m --cpus 0.5 \
  -v "$root/data:/app/data:ro" -v "$root/backups:/backups" \
  -v "$root/state/production/secrets/r2-backup.json:/run/secrets/r2-backup.json:ro" \
  -v "$script_dir/backup.mjs:/app/infra/backup.mjs:ro" \
  "$image_id" node infra/backup.mjs
