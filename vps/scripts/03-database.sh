#!/usr/bin/env bash
# 03-database.sh — creates a local Postgres role + database for NexusX,
# then applies schema/functions from /var/www/api.nexus-x.cloud/sql/.
# Idempotent: safe to re-run.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run as root."
    exit 1
fi

log() { echo -e "\033[1;32m==>\033[0m $*"; }

DB_NAME="${DB_NAME:-nexusx}"
DB_USER="${DB_USER:-nexusx}"

if [[ -z "${DB_PASSWORD:-}" ]]; then
    read -rsp "Choose a Postgres password for user '$DB_USER': " DB_PASSWORD
    echo
    if [[ -z "$DB_PASSWORD" ]]; then
        echo "Password cannot be empty."
        exit 1
    fi
fi

log "Ensuring role $DB_USER exists"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
    && sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" \
    || sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

log "Ensuring database $DB_NAME exists"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
    || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

SQL_DIR=/var/www/api.nexus-x.cloud/sql
if [[ -d "$SQL_DIR" ]]; then
    log "Applying schema from $SQL_DIR"
    export PGPASSWORD="$DB_PASSWORD"
    for f in "$SQL_DIR"/*.sql; do
        [[ -f "$f" ]] || continue
        echo "  → $f"
        psql "postgresql://$DB_USER:$DB_PASSWORD@localhost/$DB_NAME" -v ON_ERROR_STOP=1 -f "$f"
    done
    unset PGPASSWORD
else
    log "No SQL dir at $SQL_DIR yet. After your first deploy, re-run this script."
fi

echo
log "Done."
echo "DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo "(use this in /var/www/api.nexus-x.cloud/.env — see 04-env.sh)"