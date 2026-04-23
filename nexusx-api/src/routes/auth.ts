import { Router } from "express";
import { z } from "zod";
import { q } from "../db";
import { hash, verify, setAuthCookies, clearAuthCookies, refreshFromCookie, authRequired, AuthedReq } from "../auth";

const router = Router();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();

router.post("/register", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    display_name: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { email, password, display_name } = parsed.data;
  const exists = await q(`SELECT 1 FROM users WHERE email=$1`, [email.toLowerCase()]);
  if (exists.length) return res.status(409).json({ error: "email_taken" });
  const ph = await hash(password);
  const [u] = await q(
    `INSERT INTO users(email, password_hash) VALUES($1,$2) RETURNING id, email`,
    [email.toLowerCase(), ph]
  );
  await q(`INSERT INTO profiles(id, email, display_name) VALUES($1,$2,$3)`, [u.id, u.email, display_name || null]);
  await q(`INSERT INTO user_roles(user_id, role) VALUES($1,'buyer') ON CONFLICT DO NOTHING`, [u.id]);
  if (ADMIN_EMAIL && u.email === ADMIN_EMAIL) {
    await q(`INSERT INTO user_roles(user_id, role) VALUES($1,'admin') ON CONFLICT DO NOTHING`, [u.id]);
  }
  setAuthCookies(res, u.id);
  res.json({ ok: true, user: { id: u.id, email: u.email } });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "invalid_input" });
  const [u] = await q(`SELECT id, email, password_hash FROM users WHERE email=$1`, [String(email).toLowerCase()]);
  if (!u) return res.status(401).json({ error: "invalid_credentials" });
  const ok = await verify(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });
  setAuthCookies(res, u.id);
  res.json({ ok: true, user: { id: u.id, email: u.email } });
});

router.post("/logout", (req, res) => { clearAuthCookies(res); res.json({ ok: true }); });

router.post("/refresh", (req, res) => {
  const uid = refreshFromCookie(req);
  if (!uid) return res.status(401).json({ error: "invalid_refresh" });
  setAuthCookies(res, uid);
  res.json({ ok: true });
});

router.get("/me", authRequired, async (req: AuthedReq, res) => {
  const [p] = await q(`SELECT * FROM profiles WHERE id=$1`, [req.user!.id]);
  res.json({ user: req.user, profile: p });
});

export default router;