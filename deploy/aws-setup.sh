#!/usr/bin/env bash
#
# Focus Den — one-shot setup/update for an Ubuntu server (AWS Lightsail/EC2).
#
#   First deploy:   ./deploy/aws-setup.sh focus.example.com
#   Update later:   git pull && ./deploy/aws-setup.sh focus.example.com
#
# Idempotent: safe to re-run. Run from the repo root on the server.
# What it does: installs Docker + Caddy, generates a JWT secret once (kept in
# /etc/focus-den/env, chmod 600), builds and (re)starts the app container with
# a persistent volume, and points Caddy (automatic HTTPS) at it.

set -euo pipefail

DOMAIN="${1:?Usage: ./deploy/aws-setup.sh <your-domain>   e.g. focus.example.com}"

echo "==> Installing Docker + Caddy (skips if present)"
sudo apt-get update -qq
sudo apt-get install -y -qq docker.io caddy openssl
sudo systemctl enable --now docker

echo "==> Ensuring JWT secret exists (generated once, survives updates)"
sudo mkdir -p /etc/focus-den
if ! sudo test -f /etc/focus-den/env; then
  echo "JWT_SECRET=$(openssl rand -hex 32)" | sudo tee /etc/focus-den/env >/dev/null
  sudo chmod 600 /etc/focus-den/env
fi

echo "==> Building the app image"
sudo docker build -t focus-den .

echo "==> (Re)starting the container (data lives on the focus-den-data volume)"
sudo docker rm -f focus-den >/dev/null 2>&1 || true
sudo docker run -d --name focus-den --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  -v focus-den-data:/data \
  --env-file /etc/focus-den/env \
  focus-den

echo "==> Configuring Caddy for https://$DOMAIN"
printf '%s {\n    reverse_proxy localhost:8787\n}\n' "$DOMAIN" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl reload caddy

echo
echo "✓ Done. Once your domain's DNS A record points at this machine's static IP,"
echo "  the app is live at: https://$DOMAIN"
echo
echo "Useful commands:"
echo "  sudo docker logs -f focus-den            # watch the app"
echo "  curl -s localhost:8787/api/health        # health check"
echo "  sudo docker exec focus-den ./server/node_modules/.bin/tsx server/scripts/reset-password.ts <name> <newpass>"
