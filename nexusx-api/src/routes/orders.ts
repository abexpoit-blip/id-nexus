import { Router } from "express";
import { q } from "../db";
import { authRequired, AuthedReq } from "../auth";

const router = Router();

router.post("/", authRequired, async (req: AuthedReq, res) => {
  const { category_id, quantity } = req.body || {};
  if (!category_id || !quantity || quantity < 1) return res.status(400).json({ error: "invalid_input" });
  // If buying a VPN plan, ensure the VPN service is currently enabled
  const [cat] = await q<{ kind: string }>(`SELECT kind FROM categories WHERE id=$1`, [category_id]);
  if (cat?.kind === "vpn") {
    const [s] = await q<{ value: any }>(
      `SELECT value FROM app_settings WHERE key='vpn_service_enabled'`
    );
    const enabled = !s ? true : (s.value === true || s.value === "true");
    if (!enabled) return res.status(403).json({ error: "vpn_service_disabled" });
  }
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
    `SELECT o.*, c.name AS category_name, c.kind AS category_kind, c.duration_days,
            b.id AS brand_id, b.name AS brand_name, b.slug AS brand_slug, b.logo_url AS brand_logo_url
       FROM orders o
       JOIN categories c ON c.id = o.category_id
       LEFT JOIN vpn_brands b ON b.id = c.brand_id
      WHERE o.id=$1 AND o.buyer_id=$2`,
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