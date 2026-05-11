import { Router } from "express";
import crypto from "crypto";
import { q } from "../db";
import { authRequired, AuthedReq } from "../auth";

const router = Router();

const PLISIO_API = "https://api.plisio.net/api/v1";

async function getSetting<T = any>(key: string, fallback: T): Promise<T> {
  const [r] = await q<{ value: any }>(`SELECT value FROM app_settings WHERE key=$1`, [key]);
  return (r?.value ?? fallback) as T;
}

// POST /api/wallet/plisio/create  (auth required)
router.post("/wallet/plisio/create", authRequired, async (req: AuthedReq, res) => {
  try {
    const apiKey = process.env.PLISIO_SECRET_KEY;
    if (!apiKey) return res.status(503).json({ error: "plisio_not_configured" });

    const enabledMap = await getSetting<Record<string, boolean>>(
      "payment_methods_enabled",
      { bkash: true, nagad: true, binance: true, plisio: false }
    );
    const plisioEnabled = await getSetting<boolean>("plisio_enabled", false);
    if (!enabledMap?.plisio || !plisioEnabled) {
      return res.status(403).json({ error: "plisio_disabled" });
    }

    const amountBdt = Number(req.body?.amount_bdt);
    if (!Number.isFinite(amountBdt) || amountBdt < 100) {
      return res.status(400).json({ error: "min_amount", message: "Minimum ৳100" });
    }
    const rate = Number(await getSetting<number>("bdt_to_usd_rate", 0.0085));
    const amountUsd = Math.max(1, Math.round(amountBdt * rate * 100) / 100);

    const orderNumber = `NX-${(req.user!.id || "").slice(0, 8)}-${Date.now()}`;
    const callbackBase = process.env.PUBLIC_API_BASE || "https://api.nexus-x.cloud";

    const params = new URLSearchParams({
      api_key: apiKey,
      source_currency: "USD",
      source_amount: String(amountUsd),
      order_number: orderNumber,
      order_name: "Nexus X wallet topup",
      callback_url: `${callbackBase}/api/webhooks/plisio?json=true`,
      email: req.user!.email || "",
    });

    const r = await fetch(`${PLISIO_API}/invoices/new?${params.toString()}`);
    const data: any = await r.json();
    if (data?.status !== "success") {
      return res.status(502).json({ error: "plisio_error", details: data });
    }
    const inv = data.data;

    await q(
      `INSERT INTO crypto_invoices(user_id, provider, invoice_id, order_number,
         amount_bdt, amount_usd, status, invoice_url, raw)
       VALUES($1,'plisio',$2,$3,$4,$5,'new',$6,$7)`,
      [req.user!.id, inv.txn_id, orderNumber, amountBdt, amountUsd, inv.invoice_url, inv]
    );

    res.json({
      invoice_url: inv.invoice_url,
      invoice_id: inv.txn_id,
      order_number: orderNumber,
      amount_usd: amountUsd,
    });
  } catch (e: any) {
    res.status(500).json({ error: "server_error", message: e?.message });
  }
});

// GET /api/wallet/plisio/invoices  (current user)
router.get("/wallet/plisio/invoices", authRequired, async (req: AuthedReq, res) => {
  const rows = await q(
    `SELECT id, invoice_id, order_number, amount_bdt, amount_usd, status, invoice_url, created_at, updated_at
       FROM crypto_invoices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [req.user!.id]
  );
  res.json({ invoices: rows });
});

// Verify Plisio callback (HMAC SHA1 over JSON-stringified params, sorted keys, w/ secret)
function verifyPlisio(body: any, secret: string): boolean {
  if (!body || typeof body !== "object") return false;
  const hash = body.verify_hash;
  if (!hash) return false;
  const data: any = { ...body };
  delete data.verify_hash;
  // Plisio recommendation: ksort then JSON encode
  const sorted: any = {};
  for (const k of Object.keys(data).sort()) sorted[k] = data[k];
  const str = JSON.stringify(sorted);
  const calc = crypto.createHmac("sha1", secret).update(str).digest("hex");
  return calc === hash;
}

// POST /api/webhooks/plisio  (no auth, HMAC verified)
router.post("/webhooks/plisio", async (req, res) => {
  try {
    const apiKey = process.env.PLISIO_SECRET_KEY;
    if (!apiKey) return res.status(503).json({ status: "error" });

    const body = req.body || {};
    if (!verifyPlisio(body, apiKey)) {
      console.warn("[plisio] verify_hash mismatch", body?.txn_id);
      return res.status(400).json({ status: "error" });
    }

    const txnId = String(body.txn_id || "");
    const status = String(body.status || ""); // new|pending|completed|expired|cancelled|error|mismatch
    const currency = body.currency ?? null;

    const [inv] = await q<any>(
      `SELECT * FROM crypto_invoices WHERE invoice_id=$1 FOR UPDATE`,
      [txnId]
    );
    if (!inv) {
      console.warn("[plisio] unknown invoice", txnId);
      return res.json({ status: "success" });
    }

    await q(
      `UPDATE crypto_invoices
          SET status=$2, currency=COALESCE($3, currency), raw=$4, updated_at=now()
        WHERE invoice_id=$1`,
      [txnId, status, currency, body]
    );

    if (status === "completed" && !inv.credited) {
      const amt = Number(inv.amount_bdt);
      // Insert pre-approved topup record
      const [tr] = await q<any>(
        `INSERT INTO topup_requests(user_id, method, amount_bdt, sender_number, txn_id, note,
           status, source, approved_at, reviewed_at)
         VALUES($1,'binance',$2,'crypto',$3,$4,'approved','plisio',now(),now())
         RETURNING id`,
        [inv.user_id, amt, txnId, `Plisio ${currency ?? ""}`.trim()]
      );

      // Credit balance
      const [p] = await q<any>(
        `UPDATE profiles SET balance_bdt = balance_bdt + $2, updated_at=now()
           WHERE id=$1 RETURNING balance_bdt`,
        [inv.user_id, amt]
      );
      await q(
        `INSERT INTO balance_ledger(user_id, kind, amount_bdt, balance_after, reference_id, note)
         VALUES($1,'topup',$2,$3,$4,$5)`,
        [inv.user_id, amt, Number(p.balance_bdt), tr.id, `Plisio crypto deposit ${txnId}`]
      );
      await q(
        `UPDATE crypto_invoices SET credited=true, topup_id=$2 WHERE invoice_id=$1`,
        [txnId, tr.id]
      );
      await q(
        `INSERT INTO notifications(user_id, kind, title, body, reference_id)
         VALUES($1,'topup_approved',$2,$3,$4)`,
        [inv.user_id, `Crypto deposit ৳${amt.toFixed(2)} credited`,
         `Plisio invoice ${txnId} confirmed.`, tr.id]
      );
    }

    res.json({ status: "success" });
  } catch (e: any) {
    console.error("[plisio webhook]", e);
    res.status(500).json({ status: "error", message: e?.message });
  }
});

export default router;
