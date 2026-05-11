# NexusX VPS deployment kit

Everything needed to host **NexusX** on your Contabo VPS.
No Lovable. No Supabase. Only your VPS.

- VPS:       `161.97.100.218`
- Frontend:  `https://buy.nexus-x.cloud`
- API:       `https://api.nexus-x.cloud`
- DB:        local Postgres on the VPS
- Process:   PM2 (`nexusx-api`, port `8080`)
- Reverse proxy + static: Nginx
- CI/CD:     GitHub Actions → rsync → VPS (`.github/workflows/deploy-vps.yml`)

## Folder layout

```
vps/
├── README.md                 ← this file
├── nginx/
│   ├── buy.nexus-x.cloud.conf
│   └── api.nexus-x.cloud.conf
├── scripts/
│   ├── 01-bootstrap.sh       ← installs node/pm2/nginx/postgres + deploy user
│   ├── 02-nginx.sh           ← installs vhosts + Certbot SSL
│   ├── 03-database.sh        ← creates postgres user/db + applies schema
│   ├── 04-env.sh             ← interactive .env builder for nexusx-api
│   └── deploy.sh             ← manual deploy fallback (rsync from local)
└── systemd/
    └── README.md             ← (PM2 handles process; systemd notes inside)
```

## Quick start (run in this order)

```bash
# On your laptop: copy the vps/ folder to the server
scp -r vps root@161.97.100.218:/root/

ssh root@161.97.100.218
cd /root/vps/scripts
chmod +x *.sh

./01-bootstrap.sh        # node 20, pm2, nginx, postgres, deploy user, web roots
./02-nginx.sh            # vhosts + LetsEncrypt SSL  (DNS must already point here)
./03-database.sh         # creates postgres role + db
./04-env.sh              # interactive: build /var/www/api.nexus-x.cloud/.env
```

Then on **your laptop**, generate an SSH key for GitHub Actions:

```bash
ssh-keygen -t ed25519 -f ~/nexusx_deploy -N "" -C github-actions
ssh-copy-id -i ~/nexusx_deploy.pub deploy@161.97.100.218
cat ~/nexusx_deploy        # paste this into GitHub secret VPS_SSH_KEY
```

Add these GitHub secrets at
`https://github.com/abexpoit-blip/id-nexus/settings/secrets/actions`:

| Secret          | Value                          |
|-----------------|--------------------------------|
| `VPS_HOST`      | `161.97.100.218`               |
| `VPS_USER`      | `deploy`                       |
| `VPS_SSH_KEY`   | private key (full file)        |
| `VITE_API_BASE` | `https://api.nexus-x.cloud`    |

Push any commit to `main` and watch
`https://github.com/abexpoit-blip/id-nexus/actions`. ✅

## DNS (do this BEFORE running 02-nginx.sh)

At your domain registrar, add two A records:

| Host                | Type | Value             |
|---------------------|------|-------------------|
| `buy.nexus-x.cloud` | A    | `161.97.100.218`  |
| `api.nexus-x.cloud` | A    | `161.97.100.218`  |

Wait until `dig +short buy.nexus-x.cloud` returns `161.97.100.218`, then continue.

## Manual deploy from your laptop (no GitHub)

```bash
cd vps/scripts
./deploy.sh             # builds locally, rsyncs to VPS, restarts PM2
```

## Safety notes for shared VPS

- All paths are scoped: `/var/www/buy.nexus-x.cloud` and `/var/www/api.nexus-x.cloud`.
- `deploy` user has limited sudo (only `nginx -t` and `nginx reload`).
- PM2 process name is `nexusx-api` (port `8080`). Other apps untouched.
- Postgres role/db is named `nexusx`. Other DBs untouched.
- `rsync --exclude .env` — your secrets are never overwritten by deploys.