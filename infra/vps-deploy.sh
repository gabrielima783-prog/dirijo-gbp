#!/usr/bin/env bash
set -euo pipefail
operation="${1:-}"
: "${VPS_OPS_INSTALL_ROOT:?}" "${VPS_OPS_RELEASE_ID:?}" "${VPS_OPS_COMPOSE_PROJECT:?}"
export VPS_OPS_INSTALL_ROOT VPS_OPS_RELEASE_ID
root="$VPS_OPS_INSTALL_ROOT"
release_dir="$root/releases/$VPS_OPS_RELEASE_ID"
compose=(docker compose --project-name "$VPS_OPS_COMPOSE_PROJECT" --file "$release_dir/compose.production.yaml")
wait_health() {
  for attempt in $(seq 1 30); do
    if curl --fail --silent --max-time 5 http://127.0.0.1:3006/api/health >/dev/null; then return; fi
    sleep 2
  done
  return 1
}
case "$operation" in
  deploy)
    test -s "$root/state/production/secrets/tunnel-token"
    test -s "$root/state/production/secrets/r2-backup.json"
    for name in apify-token openai-api-key pagespeed-api-key; do test -f "$root/state/production/secrets/$name"; done
    test -d "$root/data" && test -d "$root/backups"
    "${compose[@]}" config --quiet
    # Preserve a consistent encrypted backup before upgrading an existing release.
    if [ -L "$root/state/production/current" ]; then "$release_dir/infra/backup.sh"; fi
    "${compose[@]}" build --pull app
    "${compose[@]}" up -d
    wait_health
    sudo install -m 644 "$release_dir/infra/dirijo-gbp-backup.service" /etc/systemd/system/dirijo-gbp-backup.service
    sudo install -m 644 "$release_dir/infra/dirijo-gbp-backup.timer" /etc/systemd/system/dirijo-gbp-backup.timer
    sudo systemctl daemon-reload
    sudo systemctl enable --now dirijo-gbp-backup.timer >/dev/null
    ;;
  verify|status)
    wait_health
    app_id="$("${compose[@]}" ps --status running --quiet app)"
    tunnel_id="$("${compose[@]}" ps --status running --quiet cloudflared)"
    test -n "$app_id" && test -n "$tunnel_id"
    test "$(docker inspect -f '{{ index .Config.Labels "com.gabriel.vps-release" }}' "$app_id")" = "$VPS_OPS_RELEASE_ID"
    sudo systemctl is-active --quiet dirijo-gbp-backup.timer
    if [ "$operation" = status ]; then "${compose[@]}" ps; fi
    ;;
  *) echo 'unsupported adapter operation' >&2; exit 64;;
esac
