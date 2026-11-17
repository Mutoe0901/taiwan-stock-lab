#!/usr/bin/env bash
# Run INSIDE an InstaBox. Never changes plan, idle settings or runtime limits.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export STOCKLAB_DATA_DIR=${STOCKLAB_DATA_DIR:-/data/stocklab/research-data}
compose=(docker compose --project-name stocklab-research --project-directory "$root/research_service" -f "$root/research_service/compose.yaml" -f "$root/research_service/compose.instabox.yaml")
case ${1:-help} in
  start)
    command -v docker >/dev/null || { echo '需要 InstaBox agent-browser 的 Docker。' >&2; exit 1; }
    docker compose version >/dev/null
    # Validate overlay support (Compose >=2.24.4) before any changes.
    "${compose[@]}" config --quiet
    mkdir -p -- "$STOCKLAB_DATA_DIR"
    # Container uses uid 10001. Do not recursively change existing data ownership.
    if [[ $(stat -c %u "$STOCKLAB_DATA_DIR") != 10001 ]]; then
      sudo chown 10001:10001 "$STOCKLAB_DATA_DIR"
    fi
    "${compose[@]}" up --build --detach --wait --wait-timeout 180
    python3 "$root/scripts/check-research.py" http://127.0.0.1:8000
    ;;
  check) python3 "$root/scripts/check-research.py" "${2:-http://127.0.0.1:8000}" ;;
  status) "${compose[@]}" ps ;;
  logs) "${compose[@]}" logs --tail 100 research ;;
  stop) "${compose[@]}" stop ;;
  *) echo '用法：bash scripts/instabox-research.sh {start|check [HTTPS網址]|status|logs|stop}'; exit 2 ;;
esac
