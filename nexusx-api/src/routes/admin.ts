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

// Smoke-test helper: read telegram delivery row for a given order
router.get("/orders/:id/delivery", async (req, res) => {
  const rows = await q(
    `SELECT id, order_id, buyer_id, status, attempt_count, last_error, sent_at, created_at, updated_at
     FROM telegram_deliveries WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [req.params.id]
  );
  res.json({ delivery: rows[0] || null });
});

export default router;