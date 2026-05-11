#!/usr/bin/env bash
# deploy.sh — manual fallback: build locally and rsync to the VPS.
# Use this if you don't want to push to GitHub.
#
# Requires (on your laptop): node 20, bun OR npm, ssh, rsync.
# SSH key for the deploy user must be set up.
set -euo pipefail

VPS_HOST="${VPS_HOST:-161.97.100.218}"
VPS_USER="${VPS_USER:-deploy}"
VPS_PORT="${VPS_PORT:-22}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

log() { echo -e "\033[1;36m==>\033[0m $*"; }

# ---------- Frontend ----------
log "Building frontend"
if command -v bun >/dev/null; then
    bun install
    VITE_API_BASE="https://api.nexus-x.cloud" bun run build
else
    npm install
    VITE_API_BASE="https://api.nexus-x.cloud" npm run build
fi

log "Rsync frontend → /var/www/buy.nexus-x.cloud"
rsync -az --delete -e "ssh -p $VPS_PORT" \
    "$ROOT/dist/" "$VPS_USER@$VPS_HOST:/var/www/buy.nexus-x.cloud/"

# ---------- Backend ----------
if [[ -d "$ROOT/nexusx-api" ]]; then
    log "Building backend (nexusx-api)"
    pushd "$ROOT/nexusx-api" >/dev/null
    npm install
    npm run build

    log "Pruning to production deps"
    rm -rf node_modules
    npm install --omit=dev
    popd >/dev/null

    log "Rsync backend → /var/www/api.nexus-x.cloud (excluding .env, uploads, logs)"
    rsync -az --delete \
        --exclude '.env' --exclude 'uploads' --exclude 'logs' \
        -e "ssh -p $VPS_PORT" \
        "$ROOT/nexusx-api/dist"          "$VPS_USER@$VPS_HOST:/var/www/api.nexus-x.cloud/"
    rsync -az -e "ssh -p $VPS_PORT" \
        "$ROOT/nexusx-api/node_modules"  "$VPS_USER@$VPS_HOST:/var/www/api.nexus-x.cloud/"
    rsync -az -e "ssh -p $VPS_PORT" \
        "$ROOT/nexusx-api/package.json"  "$VPS_USER@$VPS_HOST:/var/www/api.nexus-x.cloud/"
    [[ -d "$ROOT/nexusx-api/sql" ]] && rsync -az -e "ssh -p $VPS_PORT" \
        "$ROOT/nexusx-api/sql"          "$VPS_USER@$VPS_HOST:/var/www/api.nexus-x.cloud/"

    log "Restarting PM2 + reloading Nginx"
    ssh -p "$VPS_PORT" "$VPS_USER@$VPS_HOST" 'bash -s' <<'REMOTE'
set -e
cd /var/www/api.nexus-x.cloud
if [[ ! -f .env ]]; then
    echo "::warning:: .env missing — backend will not start until you create it (run 04-env.sh)"
    exit 0
fi
pm2 reload nexusx-api --update-env 2>/dev/null \
    || pm2 start dist/server.js --name nexusx-api --update-env
pm2 save
sudo nginx -t && sudo systemctl reload nginx
echo "✓ Backend up at $(date -u)"
REMOTE
else
    log "No nexusx-api/ folder; skipping backend deploy."
fi

log "Deploy complete."
echo "Frontend: https://buy.nexus-x.cloud"
echo "API:      https://api.nexus-x.cloud"