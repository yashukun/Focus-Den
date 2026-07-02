#!/usr/bin/env bash
#
# Focus Den CD — deploy the newest commit on main that passed CI.
#
# Run by the systemd timer that enable-auto-deploy.sh installs (every 5 min).
# Reads /etc/focus-den/deploy.conf (DOMAIN, REPO, APP_DIR, GITHUB_TOKEN).
#
# Logic: ask GitHub for the latest *successful* CI run on main → if its commit
# differs from what's running here, check it out and re-run the setup script.
# A failing CI therefore blocks deployment automatically; nothing happens
# until a green commit lands.

set -euo pipefail

CONF="${FOCUS_DEN_DEPLOY_CONF:-/etc/focus-den/deploy.conf}"
# shellcheck disable=SC1090
source "$CONF" # DOMAIN, REPO, APP_DIR, GITHUB_TOKEN

api() {
  curl -fsS \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "$1"
}

# Fetch recent runs and pick the newest green one ourselves — the API's
# server-side status filter is flaky (occasionally returns empty).
target=$(
  api "https://api.github.com/repos/$REPO/actions/workflows/ci.yml/runs?branch=main&per_page=10" |
    python3 -c '
import json, sys
runs = json.load(sys.stdin)["workflow_runs"]
green = [r for r in runs if r["status"] == "completed" and r["conclusion"] == "success"]
print(green[0]["head_sha"] if green else "")
'
)

if [ -z "$target" ]; then
  echo "[focus-den cd] no successful CI run found — nothing to deploy"
  exit 0
fi

current=$(git -C "$APP_DIR" rev-parse HEAD)
if [ "$target" = "$current" ]; then
  exit 0 # already running the newest green commit
fi

echo "[focus-den cd] deploying $target (currently on $current)"
git -C "$APP_DIR" fetch -q origin main
git -C "$APP_DIR" -c advice.detachedHead=false checkout -q "$target"

if [ "${AUTO_UPDATE_DRY_RUN:-0}" = "1" ]; then
  echo "[focus-den cd] dry-run: would now run deploy/aws-setup.sh $DOMAIN"
  exit 0
fi

"$APP_DIR/deploy/aws-setup.sh" "$DOMAIN"
echo "[focus-den cd] deployed $target"
