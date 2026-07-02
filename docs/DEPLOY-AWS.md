# Deploying Focus Den on AWS — the practical guide

Goal: one small always-on Ubuntu machine serving `https://focus.yourdomain.com`
for you + a trusted circle. Cost: ~$5–7/month. Time: ~20 minutes.

```
 browsers ──HTTPS──▶ Caddy (443) ──▶ app container (127.0.0.1:8787)
                                        └─▶ /data volume → focus-den.db
```

## 1. Create the machine (Lightsail)

1. AWS Console → **Lightsail → Create instance**
2. Region: nearest you · Platform: **Linux** · Blueprint: **Ubuntu 24.04 LTS**
3. Plan: **$5 (1 GB RAM)** — plenty (512 MB works too)
4. Create, then on the instance's **Networking** tab:
   - Attach a **static IP** (free while attached)
   - Firewall: keep `SSH 22`, `HTTP 80`; **add `HTTPS 443`**. Nothing else —
     the app port 8787 is never exposed; only Caddy talks to it.

## 2. Set up the app (browser terminal — no SSH keys needed)

Click **"Connect using browser"** on the instance, then:

```bash
git clone https://github.com/yashukun/Focus-Den.git && cd Focus-Den
./deploy/aws-setup.sh focus.yourdomain.com
```

(Private repo → the clone prompts for your GitHub username + a fine-grained
personal access token with read access to this repo, not your real password.)

The script is idempotent and does everything: Docker + Caddy install, one-time
`JWT_SECRET` generation into `/etc/focus-den/env` (chmod 600 — never in shell
history or the repo), image build, container start with `--restart
unless-stopped` and the `focus-den-data` volume, Caddy config with automatic
HTTPS.

## 3. Point your domain

At your DNS provider: **A record** for `focus` → the Lightsail **static IP**.
Once it propagates (minutes–hours), Caddy fetches the certificate
automatically and the app is live.

## 4. Backups — do both, they cover different disasters

1. **Lightsail snapshots** (whole-machine): instance page → Snapshots →
   **enable automatic daily snapshots**. Covers "the machine died / I broke it".
2. **Litestream → S3** (continuous DB replication): covers "I need the data
   from 10 minutes ago". Create a small S3 bucket + an IAM user whose policy
   allows only `s3:GetObject/PutObject/DeleteObject/ListBucket` on that bucket,
   copy `server/litestream.yml.example` to `litestream.yml` on the server
   (never commit it), fill in the bucket + keys, and run Litestream alongside
   the app (its docs cover a systemd unit).

## 5. Updating the app

Manually, any time:

```bash
cd Focus-Den && git pull && ./deploy/aws-setup.sh focus.yourdomain.com
```

User data is untouched — it lives on the `focus-den-data` volume, not in the
image. Rollback = `git checkout <old-commit>` + re-run the script.

### Auto-deploy (CD) — optional

To make pushes deploy themselves: every 5 minutes the server asks GitHub for
the newest commit on `main` **whose CI passed** and redeploys if it's new.
Failing CI blocks deployment automatically; nothing to remember.

1. GitHub → Settings → Developer settings → **Fine-grained tokens**: create a
   token scoped to *only* this repository, read-only **Contents** +
   **Actions** permissions.
2. On the server:
   ```bash
   ./deploy/enable-auto-deploy.sh focus.yourdomain.com <that-token>
   ```

Watch it: `journalctl -u focus-den-deploy.service -f` · Disable:
`sudo systemctl disable --now focus-den-deploy.timer`. A deploy restarts the
app (a seconds-long sync blip for anyone mid-shift), so ship deliberately.
Rollback under CD = revert the commit on `main`; the server follows.

## 6. Day-2 operations

| Task | Command (on the server) |
|---|---|
| Watch logs | `sudo docker logs -f focus-den` |
| Health check | `curl -s localhost:8787/api/health` |
| Reset a forgotten password | `sudo docker exec focus-den ./server/node_modules/.bin/tsx server/scripts/reset-password.ts <name> <newpass>` (also signs out their old sessions) |
| Restart the app | `sudo docker restart focus-den` |
| Inspect the DB | `sudo docker exec focus-den node -e "..."` or snapshot the volume |

User-level restores need no admin at all: Settings → **Server backups** in the
app restores any of the last 30 synced states.

## 7. Security checklist (what's already handled vs. yours to keep)

Already built in: HTTPS redirect, security headers, per-IP rate-limited auth,
password hashing (scrypt), token revocation, non-root container, localhost-only
app port, deep input validation, production refuses a dev `JWT_SECRET`.

Your side of the contract:
- **Never expose 8787** in the Lightsail firewall — Caddy is the only door.
- Optionally pin CORS: add `CORS_ORIGIN=https://focus.yourdomain.com` to
  `/etc/focus-den/env` and restart the container.
- Keep Ubuntu patched: `sudo apt-get update && sudo apt-get upgrade -y`
  occasionally (or enable unattended-upgrades).
- If you ever rotate `JWT_SECRET`, everyone just signs in again — data is safe.

## EC2 instead of Lightsail?

Identical steps — Ubuntu AMI on a `t4g.micro`, an Elastic IP instead of the
static IP, a security group allowing 22/80/443 instead of the Lightsail
firewall, and EBS snapshots instead of Lightsail snapshots. Lightsail is the
same hardware with fewer knobs and a fixed bill; prefer it until you need EC2's
knobs.
