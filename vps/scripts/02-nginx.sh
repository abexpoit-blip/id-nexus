#!/usr/bin/env bash
# 02-nginx.sh — installs the two NexusX vhosts and obtains LetsEncrypt SSL.
# Requires DNS for buy.nexus-x.cloud + api.nexus-x.cloud to already point here.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run as root."
    exit 1
fi

log() { echo -e "\033[1;32m==>\033[0m $*"; }

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)/nginx"

log "Installing vhost configs from $SRC_DIR"
install -m 644 "$SRC_DIR/buy.nexus-x.cloud.conf" /etc/nginx/sites-available/buy.nexus-x.cloud
install -m 644 "$SRC_DIR/api.nexus-x.cloud.conf" /etc/nginx/sites-available/api.nexus-x.cloud

ln -sf /etc/nginx/sites-available/buy.nexus-x.cloud /etc/nginx/sites-enabled/buy.nexus-x.cloud
ln -sf /etc/nginx/sites-available/api.nexus-x.cloud /etc/nginx/sites-enabled/api.nexus-x.cloud

# Remove default site if it conflicts (only the default, never others)
if [[ -L /etc/nginx/sites-enabled/default ]]; then
    log "Removing default vhost"
    rm /etc/nginx/sites-enabled/default
fi

log "Testing nginx config"
nginx -t
systemctl reload nginx

# ---------- DNS sanity ----------
SERVER_IP=$(curl -fs https://api.ipify.org || true)
log "Server public IP: ${SERVER_IP:-unknown}"
for host in buy.nexus-x.cloud api.nexus-x.cloud; do
    resolved=$(getent hosts "$host" | awk '{print $1}' | head -1 || true)
    echo "  $host → ${resolved:-NOT RESOLVING}"
    if [[ -n "$SERVER_IP" && "$resolved" != "$SERVER_IP" ]]; then
        echo "  ⚠️  $host does not resolve to $SERVER_IP yet."
    fi
done

read -rp "Issue SSL certificates now via Certbot? [y/N] " ans
if [[ "$ans" =~ ^[Yy]$ ]]; then
    read -rp "Email for LetsEncrypt notifications: " email
    certbot --nginx \
        -d buy.nexus-x.cloud -d www.buy.nexus-x.cloud \
        -d api.nexus-x.cloud \
        --redirect --agree-tos --non-interactive -m "$email"
    log "SSL installed. Auto-renew is enabled by certbot.timer."
else
    log "Skipped SSL. Run later with:"
    echo "  certbot --nginx -d buy.nexus-x.cloud -d www.buy.nexus-x.cloud -d api.nexus-x.cloud --redirect"
fi

log "Nginx setup complete."