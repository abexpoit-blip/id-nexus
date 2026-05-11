#!/usr/bin/env node
/**
 * End-to-end smoke test for NexusX.
 *
 * Verifies (against the production VPS API by default):
 *   1. Buyer login              -> /api/auth/login
 *   2. Wallet balance read      -> /api/wallet/balance
 *   3. Place order              -> /api/orders            (buys 1 unit)
 *   4. Balance decrement check  -> /api/wallet/balance
 *   5. Delivery payload check   -> /api/orders/:id        (items have uid/password)
 *   6. Telegram delivery row    -> /api/admin/orders/:id/delivery (admin)
 *   7. Seller login + role      -> /api/auth/login + /api/auth/me
 *   8. Admin stock report       -> /api/admin/stock
 *
 * Outputs a pass/fail table to console and writes JSON to ./smoke-report.json
 * Exit code: 0 on full pass, 1 on any failure.
 *
 * Required env vars:
 *   SMOKE_API_BASE          (default https://api.nexus-x.cloud)
 *   SMOKE_BUYER_EMAIL       SMOKE_BUYER_PASSWORD
 *   SMOKE_SELLER_EMAIL      SMOKE_SELLER_PASSWORD
 *   SMOKE_ADMIN_EMAIL       SMOKE_ADMIN_PASSWORD
 * Optional:
 *   SMOKE_CATEGORY_ID       (skip auto-pick of first category with stock)
 *   SMOKE_REPORT_PATH       (default ./smoke-report.json)
 */

import { writeFileSync } from "node:fs";

const API = (process.env.SMOKE_API_BASE || "https://api.nexus-x.cloud").replace(/\/$/, "");
const REPORT_PATH = process.env.SMOKE_REPORT_PATH || "./smoke-report.json";

type StepResult = {
  name: string;
  ok: boolean;
  ms: number;
  detail?: any;
  error?: string;
};
const results: StepResult[] = [];

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ Missing required env var: ${name}`);
    process.exit(2);
  }
  return v;
}

/** Cookie-jar aware fetch wrapper. */
function makeClient() {
  let cookies = "";
  return async function call(
    path: string,
    opts: { method?: string; body?: any; headers?: Record<string, string> } = {}
  ) {
    const res = await fetch(`${API}${path}`, {
      method: opts.method || "GET",
      headers: {
        "content-type": "application/json",
        ...(cookies ? { cookie: cookies } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      redirect: "manual",
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    if (setCookie.length) {
      const merged = new Map<string, string>();
      cookies.split(";").map((c) => c.trim()).filter(Boolean).forEach((c) => {
        const [k, ...rest] = c.split("=");
        merged.set(k, rest.join("="));
      });
      for (const sc of setCookie) {
        const first = sc.split(";")[0];
        const [k, ...rest] = first.split("=");
        merged.set(k.trim(), rest.join("="));
      }
      cookies = Array.from(merged.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
    }
    let data: any = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, ok: res.ok, data };
  };
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const t0 = Date.now();
  try {
    const out = await fn();
    const ms = Date.now() - t0;
    results.push({ name, ok: true, ms, detail: out });
    console.log(`✓ ${name} (${ms}ms)`);
    return out;
  } catch (e: any) {
    const ms = Date.now() - t0;
    results.push({ name, ok: false, ms, error: e?.message || String(e) });
    console.error(`✗ ${name} (${ms}ms) — ${e?.message || e}`);
    return null;
  }
}

async function pickCategory(call: ReturnType<typeof makeClient>): Promise<string> {
  if (process.env.SMOKE_CATEGORY_ID) return process.env.SMOKE_CATEGORY_ID;
  const r = await call("/api/categories");
  if (!r.ok) throw new Error(`categories ${r.status}`);
  const cat = (r.data?.categories || []).find((c: any) => Number(c.available) > 0);
  if (!cat) throw new Error("no category with available stock");
  return cat.id;
}

async function main() {
  const buyerEmail = need("SMOKE_BUYER_EMAIL");
  const buyerPw = need("SMOKE_BUYER_PASSWORD");
  const sellerEmail = need("SMOKE_SELLER_EMAIL");
  const sellerPw = need("SMOKE_SELLER_PASSWORD");
  const adminEmail = need("SMOKE_ADMIN_EMAIL");
  const adminPw = need("SMOKE_ADMIN_PASSWORD");

  console.log(`\nNexusX smoke test → ${API}\n${"─".repeat(48)}`);

  // --- Health
  await step("health", async () => {
    const r = await fetch(`${API}/health`);
    if (!r.ok) throw new Error(`health ${r.status}`);
    return await r.json();
  });

  // ============================ BUYER ============================
  const buyer = makeClient();

  await step("buyer.login", async () => {
    const r = await buyer("/api/auth/login", {
      method: "POST",
      body: { email: buyerEmail, password: buyerPw },
    });
    if (!r.ok) throw new Error(`login ${r.status} ${JSON.stringify(r.data)}`);
    return r.data?.user;
  });

  const balanceBefore = await step("buyer.balance.before", async () => {
    const r = await buyer("/api/wallet/balance");
    if (!r.ok) throw new Error(`balance ${r.status}`);
    return Number(r.data.balance);
  });

  const categoryId = await step("buyer.pick_category", async () => pickCategory(buyer));
  if (!categoryId) return finish();

  const order = await step("buyer.place_order", async () => {
    if (balanceBefore == null) throw new Error("no prior balance");
    const r = await buyer("/api/orders", {
      method: "POST",
      body: { category_id: categoryId, quantity: 1 },
    });
    if (!r.ok) throw new Error(`order ${r.status} ${JSON.stringify(r.data)}`);
    if (!r.data?.order_id && !r.data?.id)
      throw new Error(`no order id in response: ${JSON.stringify(r.data)}`);
    return { id: r.data.order_id || r.data.id, total: Number(r.data.total_bdt ?? r.data.total ?? 0) };
  });

  await step("buyer.balance.decremented", async () => {
    if (balanceBefore == null || !order) throw new Error("prerequisite missing");
    const r = await buyer("/api/wallet/balance");
    if (!r.ok) throw new Error(`balance ${r.status}`);
    const after = Number(r.data.balance);
    const diff = balanceBefore - after;
    if (diff <= 0)
      throw new Error(`balance did not decrement: before=${balanceBefore} after=${after}`);
    return { before: balanceBefore, after, diff };
  });

  await step("buyer.delivery_payload", async () => {
    if (!order) throw new Error("no order");
    const r = await buyer(`/api/orders/${order.id}`);
    if (!r.ok) throw new Error(`order detail ${r.status}`);
    const items = r.data?.items || [];
    if (!items.length) throw new Error("no items delivered");
    const missing = items.filter((it: any) => !it.uid || !it.password);
    if (missing.length) throw new Error(`${missing.length} item(s) missing uid/password`);
    return { item_count: items.length, sample_uid: items[0].uid };
  });

  // =========================== SELLER ============================
  const seller = makeClient();

  await step("seller.login", async () => {
    const r = await seller("/api/auth/login", {
      method: "POST",
      body: { email: sellerEmail, password: sellerPw },
    });
    if (!r.ok) throw new Error(`login ${r.status}`);
    return r.data?.user;
  });

  await step("seller.me_role", async () => {
    const r = await seller("/api/auth/me");
    if (!r.ok) throw new Error(`me ${r.status}`);
    return { user: r.data?.user, profile_email: r.data?.profile?.email };
  });

  // ============================ ADMIN ============================
  const admin = makeClient();

  await step("admin.login", async () => {
    const r = await admin("/api/auth/login", {
      method: "POST",
      body: { email: adminEmail, password: adminPw },
    });
    if (!r.ok) throw new Error(`login ${r.status}`);
    return r.data?.user;
  });

  await step("admin.stock_report", async () => {
    const r = await admin("/api/admin/stock");
    if (!r.ok) throw new Error(`stock ${r.status} (admin role required)`);
    const stock = r.data?.stock || [];
    if (!stock.length) throw new Error("empty stock report");
    const totals = stock.reduce(
      (acc: any, s: any) => ({
        available: acc.available + (s.available || 0),
        sold: acc.sold + (s.sold || 0),
        total: acc.total + (s.total || 0),
      }),
      { available: 0, sold: 0, total: 0 }
    );
    return { categories: stock.length, totals };
  });

  await step("admin.telegram_delivery", async () => {
    if (!order) throw new Error("no order");
    const r = await admin(`/api/admin/orders/${order.id}/delivery`);
    if (!r.ok) throw new Error(`delivery ${r.status}`);
    const d = r.data?.delivery;
    if (!d) return { note: "no telegram delivery row (buyer may not have linked Telegram)" };
    return { status: d.status, attempts: d.attempt_count, sent_at: d.sent_at };
  });

  finish();
}

function finish() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);

  console.log(`\n${"─".repeat(48)}`);
  console.log(`Result: ${passed}/${results.length} passed in ${totalMs}ms`);
  if (failed) {
    console.log(`\nFailures:`);
    for (const r of results.filter((r) => !r.ok)) console.log(`  - ${r.name}: ${r.error}`);
  }

  const report = {
    api: API,
    timestamp: new Date().toISOString(),
    passed,
    failed,
    total_ms: totalMs,
    steps: results,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nJSON report → ${REPORT_PATH}`);

  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("smoke test crashed:", e);
  process.exit(1);
});