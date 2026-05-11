#!/usr/bin/env bash
# 01-bootstrap.sh — installs everything NexusX needs, idempotent.
# Safe on a shared VPS: only creates the deploy user, two web roots,
# and installs packages if missing. Other apps are NOT touched.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run this script as root (sudo -i)."
    exit 1
fi

log() { echo -e "\033[1;32m==>\033[0m $*"; }

log "apt update & base packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg lsb-release rsync ufw git

# ---------- Node 20 ----------
if ! command -v node >/dev/null || [[ "$(node -v)" != v20* ]]; then
    log "Installing Node.js 20"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    log "Node already present: $(node -v)"
fi

# ---------- PM2 ----------
if ! command -v pm2 >/dev/null; then
    log "Installing PM2"
    npm install -g pm2
fi

# ---------- Nginx ----------
if ! command -v nginx >/dev/null; then
    log "Installing Nginx"
    apt-get install -y nginx
fi

# ---------- Postgres 15+ ----------
if ! command -v psql >/dev/null; then
    log "Installing PostgreSQL"
    apt-get install -y postgresql postgresql-contrib
fi
systemctl enable --now postgresql

# ---------- Certbot ----------
if ! command -v certbot >/dev/null; then
    log "Installing Certbot"
    apt-get install -y certbot python3-certbot-nginx
fi

# ---------- deploy user ----------
if ! id -u deploy >/dev/null 2>&1; then
    log "Creating deploy user"
    adduser --disabled-password --gecos "" deploy
fi
# Limited sudo for nginx reload only
cat >/etc/sudoers.d/deploy-nginx <<'SUDO'
deploy ALL=(ALL) NOPASSWD: /usr/sbin/nginx, /bin/systemctl reload nginx, /bin/systemctl restart nginx
SUDO
chmod 440 /etc/sudoers.d/deploy-nginx

install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# ---------- web roots ----------
log "Creating web roots"
install -d -o deploy -g deploy /var/www/buy.nexus-x.cloud
install -d -o deploy -g deploy /var/www/api.nexus-x.cloud
install -d -o deploy -g deploy /var/www/api.nexus-x.cloud/uploads
install -d -o deploy -g deploy /var/www/api.nexus-x.cloud/logs

# placeholder index so nginx test passes before first deploy
if [[ ! -f /var/www/buy.nexus-x.cloud/index.html ]]; then
  echo "<h1>NexusX — pending first deploy</h1>" \
    > /var/www/buy.nexus-x.cloud/index.html
  chown deploy:deploy /var/www/buy.nexus-x.cloud/index.html
fi

# ---------- PM2 boot for deploy user ----------
log "Configuring PM2 startup for deploy user"
sudo -u deploy pm2 startup systemd -u deploy --hp /home/deploy >/tmp/pm2-startup.sh || true
# Run the produced command, if any
grep -E '^sudo ' /tmp/pm2-startup.sh | tail -1 | bash || true
sudo -u deploy pm2 save || true

# ---------- firewall ----------
log "Configuring UFW (allow OpenSSH + Nginx Full)"
ufw allow OpenSSH || true
ufw allow "Nginx Full" || true
yes | ufw enable || true

log "Bootstrap complete."
echo
echo "Next steps:"
echo "  1. Append your GitHub Actions PUBLIC key to /home/deploy/.ssh/authorized_keys"
echo "  2. Make sure DNS A records for buy.nexus-x.cloud and api.nexus-x.cloud"
echo "     point to this server, then run:  ./02-nginx.sh"
echo "  3. ./03-database.sh    # creates postgres role + nexusx db"
echo "  4. ./04-env.sh         # interactive .env builder"