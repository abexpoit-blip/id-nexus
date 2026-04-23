import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";
import { q } from "./db";

const ACCESS = process.env.JWT_SECRET!;
const REFRESH = process.env.JWT_REFRESH_SECRET!;
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || "30d";

export const hash = (pw: string) => bcrypt.hash(pw, 10);
export const verify = (pw: string, h: string) => bcrypt.compare(pw, h);

export const signAccess = (uid: string) =>
  jwt.sign({ uid }, ACCESS, { expiresIn: ACCESS_TTL } as jwt.SignOptions);
export const signRefresh = (uid: string) =>
  jwt.sign({ uid }, REFRESH, { expiresIn: REFRESH_TTL } as jwt.SignOptions);

export interface AuthedReq extends Request {
  user?: { id: string; email: string; roles: string[] };
}

export async function authRequired(req: AuthedReq, res: Response, next: NextFunction) {
  const token = req.cookies?.access_token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "unauthenticated" });
  try {
    const { uid } = jwt.verify(token, ACCESS) as { uid: string };
    const rows = await q(
      `SELECT u.id, u.email, COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
       FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
       WHERE u.id = $1 GROUP BY u.id`,
      [uid]
    );
    if (!rows[0]) return res.status(401).json({ error: "user_not_found" });
    req.user = { id: rows[0].id, email: rows[0].email, roles: rows[0].roles };
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

export function requireRole(role: string) {
  return (req: AuthedReq, res: Response, next: NextFunction) => {
    if (!req.user?.roles.includes(role)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

export function setAuthCookies(res: Response, uid: string) {
  const secure = process.env.COOKIE_SECURE !== "false";
  const domain = process.env.COOKIE_DOMAIN || undefined;
  res.cookie("access_token", signAccess(uid), {
    httpOnly: true, secure, sameSite: "lax", domain, maxAge: 15 * 60 * 1000, path: "/",
  });
  res.cookie("refresh_token", signRefresh(uid), {
    httpOnly: true, secure, sameSite: "lax", domain, maxAge: 30 * 24 * 3600 * 1000, path: "/",
  });
}

export function clearAuthCookies(res: Response) {
  const domain = process.env.COOKIE_DOMAIN || undefined;
  res.clearCookie("access_token", { domain, path: "/" });
  res.clearCookie("refresh_token", { domain, path: "/" });
}

export function refreshFromCookie(req: Request): string | null {
  const t = req.cookies?.refresh_token;
  if (!t) return null;
  try { return (jwt.verify(t, REFRESH) as { uid: string }).uid; } catch { return null; }
}