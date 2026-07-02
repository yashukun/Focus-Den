#!/usr/bin/env bash
#
# Enable CD on the server: every 5 minutes, deploy the newest CI-green commit.
#
#   ./deploy/enable-auto-deploy.sh focus.example.com <github-token>
#
# The token should be a fine-grained personal access token scoped to ONLY this
# repository with read-only permissions: Contents (to pull) and Actions (to see
# CI results). Stored root-only in /etc/focus-den/deploy.conf.
#
# Disable anytime:  sudo systemctl disable --now focus-den-deploy.timer
# Watch it work:    journalctl -u focus-den-deploy.service -f

set -euo pipefail

DOMAIN="${1:?Usage: ./deploy/enable-auto-deploy.sh <domain> <github-read-token>}"
TOKEN="${2:?Missing token: fine-grained PAT with read-only Contents + Actions on this repo}"
REPO="yashukun/Focus-Den"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Writing /etc/focus-den/deploy.conf (root-only)"
sudo mkdir -p /etc/focus-den
sudo tee /etc/focus-den/deploy.conf >/dev/null <<EOF
DOMAIN=$DOMAIN
REPO=$REPO
APP_DIR=$APP_DIR
GITHUB_TOKEN=$TOKEN
EOF
sudo chmod 600 /etc/focus-den/deploy.conf

echo "==> Letting git pull without prompts (token-authenticated remote)"
git -C "$APP_DIR" remote set-url origin "https://${TOKEN}@github.com/${REPO}.git"

echo "==> Installing the systemd service + 5-minute timer"
sudo tee /etc/systemd/system/focus-den-deploy.service >/dev/null <<EOF
[Unit]
Description=Focus Den auto-deploy (newest CI-green commit)
After=network-online.target

[Service]
Type=oneshot
ExecStart=$APP_DIR/deploy/auto-update.sh
EOF

sudo tee /etc/systemd/system/focus-den-deploy.timer >/dev/null <<EOF
[Unit]
Description=Focus Den auto-deploy check every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now focus-den-deploy.timer

echo
echo "✓ CD enabled. Every 5 minutes the server deploys the newest commit on"
echo "  main whose CI passed. Failing CI blocks deployment automatically."
echo "  Watch:   journalctl -u focus-den-deploy.service -f"
echo "  Disable: sudo systemctl disable --now focus-den-deploy.timer"
