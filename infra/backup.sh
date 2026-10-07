#!/usr/bin/env bash
set -euo pipefail
root="${DIRIJO_GBP_ROOT:-/srv/dirijo-gbp}"
release_dir="$(readlink -f "$root/state/production/current")"
[ -n "$release_dir" ] && [ -f "$release_dir/compose.production.yaml" ]
release_id="$(basename "$release_dir")"
script_dir="$(cd "$(dirname "$0")" && pwd)"
exec docker run --rm --network bridge --user 1000:1000 --memory 512m --cpus 0.5 \
  -v "$root/data:/app/data:ro" -v "$root/backups:/backups" \
  -v "$root/state/production/secrets/r2-backup.json:/run/secrets/r2-backup.json:ro" \
  -v "$script_dir/backup.mjs:/app/infra/backup.mjs:ro" \
  "dirijo-gbp:$release_id" node infra/backup.mjs
