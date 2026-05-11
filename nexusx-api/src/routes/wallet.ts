import { Router } from "express";
import { q } from "../db";
import { authRequired, AuthedReq } from "../auth";

const router = Router();

router.get("/balance", authRequired, async (req: AuthedReq, res) => {
  const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1`, [req.user!.id]);
  res.json({ balance: Number(p?.balance_bdt || 0) });
});

router.get("/ledger", authRequired, async (req: AuthedReq, res) => {
  const rows = await q(
    `SELECT * FROM balance_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`,
    [req.user!.id]
  );
  res.json({ ledger: rows });
});

router.post("/topup", authRequired, async (req: AuthedReq, res) => {
  const { method, amount_bdt, sender_number, txn_id, note, screenshot_url } = req.body || {};
  if (!method || !amount_bdt || !sender_number || !txn_id)
    return res.status(400).json({ error: "invalid_input" });
  const [r] = await q(
    `INSERT INTO topup_requests(user_id, method, amount_bdt, sender_number, txn_id, note, screenshot_url)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user!.id, method, amount_bdt, sender_number, txn_id, note || null, screenshot_url || null]
  );
  res.json({ topup: r });
});

router.get("/topups", authRequired, async (req: AuthedReq, res) => {
  const rows = await q(
    `SELECT * FROM topup_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [req.user!.id]
  );
  res.json({ topups: rows });
});

router.post("/withdraw", authRequired, async (req: AuthedReq, res) => {
  const { method, amount_bdt, receiver_number, note } = req.body || {};
  if (!method || !amount_bdt || !receiver_number)
    return res.status(400).json({ error: "invalid_input" });
  if (!["bkash", "nagad"].includes(String(method)))
    return res.status(400).json({ error: "invalid_method", message: "Only bKash and Nagad are supported" });
  const amt = Number(amount_bdt);
  if (!Number.isFinite(amt) || amt < 100)
    return res.status(400).json({ error: "min_amount", message: "Minimum withdraw is ৳100" });
  if (!/^01[0-9]{9}$/.test(String(receiver_number).trim()))
    return res.status(400).json({ error: "invalid_number", message: "Enter a valid 11-digit BD mobile number" });
  const [p] = await q(`SELECT balance_bdt FROM profiles WHERE id=$1 FOR UPDATE`, [req.user!.id]);
  if (Number(p.balance_bdt) < amt) return res.status(400).json({ error: "insufficient_balance" });
  const [r] = await q(
    `INSERT INTO withdraw_requests(user_id, method, amount_bdt, receiver_number, note)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.user!.id, method, amt, String(receiver_number).trim(), note || null]
  );
  // Notify all admins of the new pending withdraw
  try {
    const [u] = await q<{ email: string }>(`SELECT email FROM users WHERE id=$1`, [req.user!.id]);
    const admins = await q<{ user_id: string }>(`SELECT user_id FROM user_roles WHERE role='admin'`);
    for (const a of admins) {
      await q(
        `INSERT INTO notifications(user_id, kind, title, body, reference_id)
         VALUES($1,'withdraw_pending',$2,$3,$4)`,
        [
          a.user_id,
          `New withdraw ৳${amt.toFixed(2)}`,
          `${u?.email ?? "A user"} requested ${method} payout to ${String(receiver_number).trim()}.`,
          r.id,
        ]
      );
    }
  } catch { /* notifications are best-effort */ }
  res.json({ withdraw: r });
});

export default router;