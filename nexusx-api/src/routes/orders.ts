import { Router } from "express";
import { q } from "../db";
import { authRequired, AuthedReq } from "../auth";

const router = Router();

router.post("/", authRequired, async (req: AuthedReq, res) => {
  const { category_id, quantity } = req.body || {};
  if (!category_id || !quantity || quantity < 1) return res.status(400).json({ error: "invalid_input" });
  try {
    const rows = await q(`SELECT place_order($1,$2,$3) AS r`, [req.user!.id, category_id, quantity]);
    res.json(rows[0].r);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/", authRequired, async (req: AuthedReq, res) => {
  const rows = await q(
    `SELECT o.*, c.name AS category_name FROM orders o
     JOIN categories c ON c.id = o.category_id
     WHERE o.buyer_id = $1 ORDER BY o.created_at DESC LIMIT 100`,
    [req.user!.id]
  );
  res.json({ orders: rows });
});

router.get("/:id", authRequired, async (req: AuthedReq, res) => {
  const [order] = await q(
    `SELECT * FROM orders WHERE id=$1 AND buyer_id=$2`,
    [req.params.id, req.user!.id]
  );
  if (!order) return res.status(404).json({ error: "not_found" });
  const items = await q(
    `SELECT oi.*, a.uid, a.password, a.email, a.email_password, a.two_fa, a.extra
     FROM order_items oi JOIN accounts a ON a.id = oi.account_id
     WHERE oi.order_id = $1`,
    [order.id]
  );
  res.json({ order, items });
});

export default router;