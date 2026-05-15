import { Router } from "express";
import { q } from "../db";

const router = Router();

router.get("/", async (_req, res) => {
  const rows = await q(
    `SELECT c.*, COALESCE(s.available, 0) AS available,
            b.name AS brand_name, b.slug AS brand_slug, b.logo_url AS brand_logo_url
     FROM categories c
     LEFT JOIN vpn_brands b ON b.id = c.brand_id
     LEFT JOIN (
       SELECT category_id, COUNT(*)::int AS available FROM accounts
       WHERE status='available' GROUP BY category_id
     ) s ON s.category_id = c.id
     WHERE c.is_active = true ORDER BY c.sort_order, c.name`
  );
  res.json({ categories: rows });
});

router.get("/stock", async (_req, res) => {
  const rows = await q(
    `SELECT category_id, COUNT(*)::int AS available FROM accounts
     WHERE status='available' GROUP BY category_id`
  );
  res.json({ stock: rows });
});

// Public: top sellers contributing stock to a category, with tier badges
router.get("/:id/sellers", async (req, res) => {
  const rows = await q(
    `SELECT u.id AS seller_id,
        COALESCE(p.display_name, split_part(u.email,'@',1)) AS name,
        COUNT(*) FILTER (WHERE a.status='available')::int AS available,
        COALESCE((SELECT COUNT(*)::int FROM order_items oi WHERE oi.seller_id=u.id),0) AS sales_lifetime
      FROM accounts a
      JOIN users u ON u.id=a.seller_id
      LEFT JOIN profiles p ON p.id=u.id
      WHERE a.category_id=$1 AND COALESCE(p.is_banned,false)=false
      GROUP BY u.id, p.display_name, u.email
      HAVING COUNT(*) FILTER (WHERE a.status='available') > 0
      ORDER BY available DESC, sales_lifetime DESC
      LIMIT 8`,
    [req.params.id]
  );
  const tierFor = (n: number) => n>=1000?"vip":n>=250?"gold":n>=50?"silver":n>=1?"bronze":"none";
  res.json({ sellers: rows.map((s: any) => ({ ...s, tier: tierFor(Number(s.sales_lifetime||0)) })) });
});

export default router;