# Self-Hosting Plan — Contabo VPS (Full Rewrite, No Lovable Cloud)

## 🎯 Final Goal
- Frontend: https://buy.nexus-x.cloud → Contabo VPS (Nginx serving React build)
- Backend API: https://api.buy.nexus-x.cloud → Node.js/Express + PostgreSQL on same VPS
- Workflow: Lovable edits → GitHub push → VPS auto pull & rebuild
- Lovable Cloud / Supabase: NOT USED

## Phases

### Phase 1 — VPS Initial Setup
- SSH login to Contabo VPS
- Install: Node.js 20, PostgreSQL 16, Nginx, PM2, Certbot, ufw
- Create `deploy` user, firewall rules (22, 80, 443)
- Add VPS SSH key to GitHub

### Phase 2 — Database (PostgreSQL on VPS)
- Create `nexusx` database + `nexusx_app` user
- Port Supabase schema → plain Postgres:
  - Enums: app_role, account_status, order_status, category_kind, ledger_kind, notification_kind, replacement_status, replacement_item_outcome
  - Tables: users (auth), profiles, user_roles, categories, accounts, orders, order_items, balance_ledger, replacement_requests, replacement_items, notifications
  - Functions: place_order, submit_replacement_request, seller_upload_accounts, admin_resolve_replacement_item, has_role, get_public_stock_counts
- RLS dropped → app-level permission checks in backend

### Phase 3 — Backend API (new repo: nexusx-api)
Stack: Node.js + Express + TypeScript + pg/Prisma + Zod
- Auth: bcrypt + JWT (access + refresh), httpOnly cookies
- Routes: /auth, /categories, /orders, /accounts, /replacements, /notifications, /admin/*
- Telegram bot: express webhook + node-telegram-bot-api
- Realtime: Socket.io
- Middleware: auth, role-check, rate-limit, CORS
- .env: DATABASE_URL, JWT_SECRET, TELEGRAM_BOT_TOKEN, FRONTEND_URL

### Phase 4 — Frontend Refactor (this Lovable repo)
- Replace src/integrations/supabase/client.ts with src/lib/api.ts (axios + JWT)
- Rewrite useAuth.tsx → JWT-based
- Touch every page: Auth, Browse, Dashboard, OrderDetail, SellerDashboard, Replacements, Admin, NotificationsBell
- Replace supabase.from/rpc calls with api.get/post
- Replace realtime subscriptions with Socket.io

### Phase 5 — DNS + SSL
- Hostinger DNS:
  - A buy → <VPS_IP>
  - A api.buy → <VPS_IP>
- Nginx reverse proxy for both subdomains
- Certbot Let's Encrypt SSL + auto-renewal cron

### Phase 6 — GitHub Auto-Deploy
- .github/workflows/deploy.yml (frontend)
  - On push to main: SSH into VPS → git pull → npm ci → npm run build → copy dist/ to Nginx root
- Secrets: VPS_HOST, VPS_USER, VPS_SSH_KEY
- Separate workflow in backend repo

### Phase 7 — Testing & Hardening
- End-to-end: signup → login → browse → order → replacement → admin resolve
- Telegram bot flow test
- ssllabs.com grade check
- Daily pg_dump backup cron

## Recommended order
Phase 1 → 5 → 6 (domain live with current backend fast) → then 2 → 3 → 4 (backend migration, risk-isolated)

## Honest warnings
- 3–5 days minimum work, tested per phase
- Frontend rewrite may break existing UI — iterative bug-fix needed
- Backend repo lives OUTSIDE Lovable; Lovable AI cannot edit it (manual maintenance)
- Current auth users & data will be lost (user confirmed empty)
