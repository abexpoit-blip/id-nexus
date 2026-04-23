# NexusX API

Self-hosted Express + PostgreSQL backend for buy.nexus-x.cloud.
Replaces Supabase. Runs on Contabo VPS via PM2 + Nginx.

## Quick start (VPS)

```bash
cd /var/www/nexusx-frontend/nexusx-api
cp .env.example .env
nano .env   # fill DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
npm install
npm run build
npm run migrate
pm2 start dist/server.js --name nexusx-api --update-env
pm2 save
```

Health check: `curl http://127.0.0.1:8080/health`