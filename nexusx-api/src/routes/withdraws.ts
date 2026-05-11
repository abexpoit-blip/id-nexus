import { Router } from "express";
import { q } from "../db";
import { authRequired, requireRole, AuthedReq } from "../auth";

const router = Router();

router.get("/mine", authRequired, async (req: AuthedReq, res) => {
  const rows = await q(
    `SELECT * FROM withdraw_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [req.user!.id]
  );
  res.json({ withdraws: rows });
});

// Admin
router.get("/", authRequired, requireRole("admin"), async (_req, res) => {
  const rows = await q(
    `SELECT w.*, u.email AS user_email FROM withdraw_requests w
     JOIN users u ON u.id = w.user_id ORDER BY w.created_at DESC LIMIT 200`
  );
  res.json({ withdraws: rows });
});

router.post("/:id/approve", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  const id = req.params.id;
  const [r] = await q(`SELECT * FROM withdraw_requests WHERE id=$1 FOR UPDATE`, [id]);
  if (!r) return res.status(404).json({ error: "not_found" });
  if (r.status !== "pending") return res.status(400).json({ error: "already_reviewed" });

  const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [r.user_id]);
  if (Number(p.balance_bdt) < Number(r.amount_bdt))
    return res.status(400).json({ error: "insufficient_balance" });

  await q(`UPDATE profiles SET balance_bdt = balance_bdt - $1 WHERE id=$2`, [r.amount_bdt, r.user_id]);
  const [np] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1`, [r.user_id]);
  await q(
    `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
     VALUES($1,'withdraw',$2,$3,$4,$5)`,
    [r.user_id, -Number(r.amount_bdt), np.balance_bdt, r.id, "Withdraw approved"]
  );
  await q(
    `UPDATE withdraw_requests SET status='paid', payout_txn_id=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1`,
    [id, req.body?.payout_txn_id || null, req.user!.id]
  );
  res.json({ ok: true });
});

router.post("/:id/reject", authRequired, requireRole("admin"), async (req: AuthedReq, res) => {
  await q(
    `UPDATE withdraw_requests SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=now()
     WHERE id=$1 AND status='pending'`,
    [req.params.id, req.body?.note || null, req.user!.id]
  );
  res.json({ ok: true });
});

export default router;