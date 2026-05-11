import { Router } from "express";
import { q } from "../db";

const router = Router();

// Public read of selected app_settings keys
const PUBLIC_KEYS = new Set([
  "brand_credit",
  "payment_accounts",
  "min_deposit",
  "deposit_instructions",
  "support_enabled",
  "seller_applications_enabled",
  "vpn_service_enabled",
]);

router.get("/", async (req, res) => {
  const keysParam = String(req.query.keys || "").trim();
  const keys = keysParam
    ? keysParam.split(",").map((k) => k.trim()).filter((k) => PUBLIC_KEYS.has(k))
    : Array.from(PUBLIC_KEYS);
  if (!keys.length) return res.json({ settings: {} });
  const rows = await q(`SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`, [keys]);
  const settings: Record<string, any> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

// Public read of active payment accounts (table-based, separate from app_settings JSON)
router.get("/payment-accounts", async (_req, res) => {
  const rows = await q(
    `SELECT id, method, label, account_number, account_type, instructions, sort_order
     FROM payment_accounts WHERE is_active = true ORDER BY sort_order, method`
  );
  res.json({ accounts: rows });
});

// Public read of active VPN brands
router.get("/vpn-brands", async (_req, res) => {
  const rows = await q(
    `SELECT id, slug, name, description, logo_url, sort_order
     FROM vpn_brands WHERE is_active = true ORDER BY sort_order, name`
  );
  res.json({ brands: rows });
});

export default router;