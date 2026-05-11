import { Router } from "express";
import { q } from "../db";
import { authRequired, requireRole, AuthedReq } from "../auth";

const router = Router();
router.use(authRequired, requireRole("admin"));

router.get("/stock", async (_req, res) => {
  const rows = await q(
    `SELECT c.id AS category_id, c.name AS category_name, c.price_bdt, c.is_active,
       COUNT(*) FILTER (WHERE a.status='available')::int AS available,
       COUNT(*) FILTER (WHERE a.status='sold')::int AS sold,
       COUNT(*) FILTER (WHERE a.status='bad')::int AS bad,
       COUNT(a.id)::int AS total
     FROM categories c LEFT JOIN accounts a ON a.category_id = c.id
     GROUP BY c.id ORDER BY c.sort_order`
  );
  res.json({ stock: rows });
});

router.get("/topups", async (_req, res) => {
  const rows = await q(
    `SELECT t.*, u.email AS user_email FROM topup_requests t
     JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC LIMIT 200`
  );
  res.json({ topups: rows });
});

router.post("/topups/:id/approve", async (req: AuthedReq, res) => {
  const id = req.params.id;
  const [r] = await q(`SELECT * FROM topup_requests WHERE id=$1 FOR UPDATE`, [id]);
  if (!r) return res.status(404).json({ error: "not_found" });
  if (r.status !== "pending") return res.status(400).json({ error: "already_reviewed" });
  await q(`UPDATE profiles SET balance_bdt = balance_bdt + $1 WHERE id=$2`, [r.amount_bdt, r.user_id]);
  const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1`, [r.user_id]);
  await q(
    `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
     VALUES($1,'topup',$2,$3,$4,$5)`,
    [r.user_id, r.amount_bdt, p.balance_bdt, r.id, "Top-up approved"]
  );
  await q(
    `UPDATE topup_requests SET status='approved', reviewed_by=$2, reviewed_at=now(), approved_at=now() WHERE id=$1`,
    [id, req.user!.id]
  );
  res.json({ ok: true });
});

router.post("/topups/:id/reject", async (req: AuthedReq, res) => {
  await q(
    `UPDATE topup_requests SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=now()
     WHERE id=$1 AND status='pending'`,
    [req.params.id, req.body?.note || null, req.user!.id]
  );
  res.json({ ok: true });
});

// USERS
router.get("/users", async (_req, res) => {
  const rows = await q(
    `SELECT u.id, u.email, u.created_at, p.display_name, p.balance_bdt, p.is_banned,
       COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
     FROM users u LEFT JOIN profiles p ON p.id=u.id
     LEFT JOIN user_roles r ON r.user_id=u.id
     GROUP BY u.id, p.display_name, p.balance_bdt, p.is_banned ORDER BY u.created_at DESC LIMIT 500`
  );
  res.json({ users: rows });
});

router.post("/users/:id/ban", async (req: AuthedReq, res) => {
  await q(`UPDATE profiles SET is_banned=$2 WHERE id=$1`, [req.params.id, !!req.body?.banned]);
  res.json({ ok: true });
});

router.post("/users/:id/roles", async (req: AuthedReq, res) => {
  const { add, remove } = req.body || {};
  if (Array.isArray(add)) {
    for (const r of add)
      await q(`INSERT INTO user_roles(user_id, role) VALUES($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, r]);
  }
  if (Array.isArray(remove)) {
    for (const r of remove)
      await q(`DELETE FROM user_roles WHERE user_id=$1 AND role=$2`, [req.params.id, r]);
  }
  res.json({ ok: true });
});

router.post("/users/:id/balance", async (req: AuthedReq, res) => {
  const delta = Number(req.body?.delta_bdt);
  const note = req.body?.note || "Admin adjustment";
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "invalid_delta" });
  const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [req.params.id]);
  if (!p) return res.status(404).json({ error: "user_not_found" });
  const newBal = Number(p.balance_bdt) + delta;
  if (newBal < 0) return res.status(400).json({ error: "would_go_negative" });
  await q(`UPDATE profiles SET balance_bdt=$1 WHERE id=$2`, [newBal, req.params.id]);
  await q(
    `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, note)
     VALUES($1,'admin_adjustment',$2,$3,$4)`,
    [req.params.id, delta, newBal, note]
  );
  res.json({ ok: true, balance: newBal });
});

// CATEGORIES
router.get("/categories", async (_req, res) => {
  const rows = await q(`SELECT * FROM categories ORDER BY sort_order, name`);
  res.json({ categories: rows });
});

router.post("/categories", async (req, res) => {
  const { slug, name, kind, description, price_bdt, is_active, sort_order, brand_id, duration_days } = req.body || {};
  if (!slug || !name || price_bdt == null) return res.status(400).json({ error: "invalid_input" });
  const [r] = await q(
    `INSERT INTO categories(slug, name, kind, description, price_bdt, is_active, sort_order, brand_id, duration_days)
     VALUES($1,$2,COALESCE($3,'fb_account'),$4,$5,COALESCE($6,true),COALESCE($7,0),$8,$9) RETURNING *`,
    [slug, name, kind, description || null, price_bdt, is_active, sort_order, brand_id || null, duration_days || null]
  );
  res.json({ category: r });
});

router.patch("/categories/:id", async (req, res) => {
  const f = req.body || {};
  const [r] = await q(
    `UPDATE categories SET
       name=COALESCE($2,name), description=COALESCE($3,description),
       price_bdt=COALESCE($4,price_bdt), is_active=COALESCE($5,is_active),
       sort_order=COALESCE($6,sort_order), brand_id=COALESCE($7,brand_id),
       duration_days=COALESCE($8,duration_days), updated_at=now()
     WHERE id=$1 RETURNING *`,
    [req.params.id, f.name, f.description, f.price_bdt, f.is_active, f.sort_order, f.brand_id, f.duration_days]
  );
  res.json({ category: r });
});

router.delete("/categories/:id", async (req, res) => {
  await q(`DELETE FROM categories WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// SELLER APPLICATIONS
router.get("/seller-applications", async (_req, res) => {
  const rows = await q(
    `SELECT a.*, u.email AS user_email FROM seller_applications a
     JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200`
  );
  res.json({ applications: rows });
});

router.post("/seller-applications/:id/approve", async (req: AuthedReq, res) => {
  const [a] = await q(`SELECT * FROM seller_applications WHERE id=$1`, [req.params.id]);
  if (!a) return res.status(404).json({ error: "not_found" });
  await q(`INSERT INTO user_roles(user_id, role) VALUES($1,'seller') ON CONFLICT DO NOTHING`, [a.user_id]);
  await q(
    `UPDATE seller_applications SET status='approved', reviewed_by=$2, reviewed_at=now() WHERE id=$1`,
    [a.id, req.user!.id]
  );
  res.json({ ok: true });
});

router.post("/seller-applications/:id/reject", async (req: AuthedReq, res) => {
  await q(
    `UPDATE seller_applications SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1`,
    [req.params.id, req.body?.note || null, req.user!.id]
  );
  res.json({ ok: true });
});

// SELLER LIMITS
router.get("/seller-limits", async (_req, res) => {
  const rows = await q(
    `SELECT l.*, u.email FROM seller_daily_limits l JOIN users u ON u.id=l.seller_id ORDER BY u.email`
  );
  res.json({ limits: rows });
});

router.post("/seller-limits/:seller_id", async (req: AuthedReq, res) => {
  const { daily_limit, note } = req.body || {};
  if (!Number.isFinite(Number(daily_limit))) return res.status(400).json({ error: "invalid_input" });
  const [r] = await q(
    `INSERT INTO seller_daily_limits(seller_id, daily_limit, note, updated_by)
     VALUES($1,$2,$3,$4)
     ON CONFLICT(seller_id) DO UPDATE SET daily_limit=EXCLUDED.daily_limit, note=EXCLUDED.note,
       updated_by=EXCLUDED.updated_by, updated_at=now() RETURNING *`,
    [req.params.seller_id, Number(daily_limit), note || null, req.user!.id]
  );
  res.json({ limit: r });
});

// PAYMENT ACCOUNTS (admin-managed numbers shown to buyers)
router.get("/payment-accounts", async (_req, res) => {
  const rows = await q(`SELECT * FROM payment_accounts ORDER BY sort_order, method`);
  res.json({ accounts: rows });
});

router.post("/payment-accounts", async (req, res) => {
  const { method, label, account_number, account_type, instructions, is_active, sort_order } = req.body || {};
  if (!method || !label || !account_number) return res.status(400).json({ error: "invalid_input" });
  const [r] = await q(
    `INSERT INTO payment_accounts(method, label, account_number, account_type, instructions, is_active, sort_order)
     VALUES($1,$2,$3,$4,$5,COALESCE($6,true),COALESCE($7,0)) RETURNING *`,
    [method, label, account_number, account_type || null, instructions || null, is_active, sort_order]
  );
  res.json({ account: r });
});

router.delete("/payment-accounts/:id", async (req, res) => {
  await q(`DELETE FROM payment_accounts WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// AUDIT LOGS
router.get("/audit-logs", async (_req, res) => {
  const rows = await q(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200`);
  res.json({ logs: rows });
});

// APP SETTINGS
router.get("/settings", async (_req, res) => {
  const rows = await q(`SELECT * FROM app_settings ORDER BY key`);
  res.json({ settings: rows });
});

router.put("/settings/:key", async (req: AuthedReq, res) => {
  const [r] = await q(
    `INSERT INTO app_settings(key, value, updated_by) VALUES($1,$2,$3)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()
     RETURNING *`,
    [req.params.key, req.body?.value || {}, req.user!.id]
  );
  res.json({ setting: r });
});

// OVERVIEW (dashboard counts)
router.get("/overview", async (_req, res) => {
  const [u] = await q(`SELECT COUNT(*)::int AS c FROM users`);
  const [o] = await q(`SELECT COUNT(*)::int AS c, COALESCE(SUM(total_bdt),0)::numeric AS total FROM orders WHERE status='completed'`);
  const [a] = await q(`SELECT COUNT(*)::int AS c FROM accounts WHERE status='available'`);
  const [t] = await q(`SELECT COUNT(*)::int AS c FROM topup_requests WHERE status='pending'`);
  const [w] = await q(`SELECT COUNT(*)::int AS c FROM withdraw_requests WHERE status='pending'`);
  const [r] = await q(`SELECT COUNT(*)::int AS c FROM replacement_requests WHERE status='pending'`);
  res.json({
    users: u.c, orders: o.c, revenue: Number(o.total),
    available_stock: a.c, pending_topups: t.c, pending_withdraws: w.c, pending_replacements: r.c,
  });
});

export default router;