/**
 * Smart parser for seller account uploads.
 *
 * Supports the following layouts (in priority order):
 *
 *   A. Standard CSV/XLSX with named headers:
 *        uid | password | 2fa | email | email_password
 *
 *   B. "61xxx" raw 3-column format (no header):
 *        61588725745509   Shovon@23   c_user=...; xs=...; fr=...
 *
 *   C. "1000xxx" raw 3-column format (no header):
 *        100010709204979  Shovon@24   wd=706x919; datr=...; c_user=...; xs=...
 *
 * For raw formats the UID is whatever is in column A — we ALSO attempt to
 * extract `c_user=NNNNNNNNNN` from the cookie blob (column C) and use that
 * as a tie-breaker when column A is corrupted by Excel's scientific
 * notation (e.g. "1.00093E+14") or when column A is missing.
 */

export type SellerRow = {
  uid: string;
  password: string;
  two_fa?: string;
  email?: string;
  email_password?: string;
  cookies?: string;
};

export type ParseResult =
  | {
      ok: true;
      rows: SellerRow[];
      format: "headers" | "raw_61xxx" | "raw_1000xxx" | "raw_unknown";
      duplicateUidsInFile: string[];
      recoveredFromCookie: number; // count of rows where UID came from c_user=
    }
  | { ok: false; reason: "empty" | "bad_format"; detail?: string };

const HEADER_MAP: Record<string, keyof SellerRow> = {
  uid: "uid",
  id: "uid",
  account: "uid",
  password: "password",
  pass: "password",
  pwd: "password",
  "2fa": "two_fa",
  twofa: "two_fa",
  two_fa: "two_fa",
  totp: "two_fa",
  email: "email",
  mail: "email",
  email_password: "email_password",
  emailpassword: "email_password",
  emailpass: "email_password",
  mailpass: "email_password",
  cookies: "cookies",
  cookie: "cookies",
};

const norm = (s: string) =>
  String(s ?? "").trim().toLowerCase().replace(/[\s\-]/g, "_");

/** Extract the Facebook user id from a cookie blob (`c_user=...`). */
export const extractUidFromCookie = (cookieBlob: string): string | null => {
  const m = cookieBlob.match(/c_user=(\d{6,20})/);
  return m ? m[1] : null;
};

/** Detect Excel-mangled scientific notation like "1.00093E+14". */
const looksLikeScientific = (v: string) =>
  /^\d(\.\d+)?[eE][+\-]?\d+$/.test(v.trim());

/** Convert a scientific notation string to its plain integer string form. */
const scientificToInt = (v: string): string | null => {
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Math.round(n).toString();
};

/** Try to recover a clean UID for one row. */
const resolveUid = (
  rawUid: string,
  cookieBlob: string,
): { uid: string | null; recoveredFromCookie: boolean } => {
  const fromCookie = cookieBlob ? extractUidFromCookie(cookieBlob) : null;

  const cleaned = String(rawUid ?? "").trim();
  if (!cleaned) return { uid: fromCookie, recoveredFromCookie: !!fromCookie };

  // Excel mangled it -> prefer cookie, otherwise reconstruct
  if (looksLikeScientific(cleaned)) {
    if (fromCookie) return { uid: fromCookie, recoveredFromCookie: true };
    const expanded = scientificToInt(cleaned);
    if (expanded) return { uid: expanded, recoveredFromCookie: false };
    return { uid: null, recoveredFromCookie: false };
  }

  // Plain digits is fine
  if (/^\d{6,20}$/.test(cleaned)) {
    // Sanity check: if cookie has a different UID, prefer cookie
    if (fromCookie && fromCookie !== cleaned) {
      return { uid: fromCookie, recoveredFromCookie: true };
    }
    return { uid: cleaned, recoveredFromCookie: false };
  }

  // Anything else — try cookie as last resort
  if (fromCookie) return { uid: fromCookie, recoveredFromCookie: true };
  return { uid: null, recoveredFromCookie: false };
};

/**
 * Detect upload format and convert raw spreadsheet rows
 * (XLSX `sheet_to_json({ header: 1 })` output) into clean SellerRow[].
 */
export const parseSellerUpload = (matrix: any[][]): ParseResult => {
  if (!matrix || matrix.length === 0) return { ok: false, reason: "empty" };

  // 1) Try header-based parsing if first row contains any known header
  const first = matrix[0].map((c) => norm(String(c ?? "")));
  const hasHeaders = first.some((c) => HEADER_MAP[c] === "uid") &&
                     first.some((c) => HEADER_MAP[c] === "password");

  if (hasHeaders || first.some((c) => HEADER_MAP[c] === "uid")) {
    const colTargets = first.map((c) => HEADER_MAP[c] || null);
    const hasPass = first.some((c) => HEADER_MAP[c] === "password");
    const hasUid = first.some((c) => HEADER_MAP[c] === "uid");
    if (!hasUid) {
      return { ok: false, reason: "bad_format", detail: "Missing required column: UID. Add a header named UID (or ID/Account)." };
    }
    if (!hasPass) {
      return { ok: false, reason: "bad_format", detail: "Missing required column: PASS. Add a header named PASS (or Password/Pwd)." };
    }
    const rows: SellerRow[] = [];
    const seen = new Set<string>();
    const dupes: string[] = [];
    let recovered = 0;
    for (let i = 1; i < matrix.length; i++) {
      const out: any = {};
      colTargets.forEach((t, idx) => {
        if (!t) return;
        const v = matrix[i][idx];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          out[t] = String(v).trim();
        }
      });
      const cookieBlob = out.cookies || "";
      const { uid, recoveredFromCookie } = resolveUid(out.uid || "", cookieBlob);
      if (!uid || !out.password) continue;
      if (recoveredFromCookie) recovered++;
      if (seen.has(uid)) { dupes.push(uid); continue; }
      seen.add(uid);
      rows.push({ ...out, uid });
    }
    if (rows.length === 0) {
      return { ok: false, reason: "bad_format", detail: "Headers detected but no valid UID/PASS rows. Check that UID is digits and PASS is non-empty." };
    }
    return { ok: true, format: "headers", rows, duplicateUidsInFile: dupes, recoveredFromCookie: recovered };
  }

  // 2) Headerless 3-column format (UID, Password, Cookies)
  const rows: SellerRow[] = [];
  const seen = new Set<string>();
  const dupes: string[] = [];
  let recovered = 0;
  let detected: ParseResult & { ok: true } = {
    ok: true,
    format: "raw_unknown",
    rows,
    duplicateUidsInFile: dupes,
    recoveredFromCookie: 0,
  };

  for (const row of matrix) {
    if (!row || row.length === 0) continue;
    // Drop fully-empty rows
    if (row.every((c) => String(c ?? "").trim() === "")) continue;

    const colA = String(row[0] ?? "").trim();
    const colB = String(row[1] ?? "").trim();
    const colC = String(row[2] ?? "").trim();

    // password is column B; cookie blob is column C
    const cookieBlob = colC;
    const { uid, recoveredFromCookie } = resolveUid(colA, cookieBlob);
    if (!uid || !colB) continue;
    if (recoveredFromCookie) recovered++;

    // Detect format flavour from cookie / UID prefix
    if (detected.format === "raw_unknown") {
      if (/^61\d{10,}$/.test(uid) || /\bfr=/.test(cookieBlob)) detected.format = "raw_61xxx";
      else if (/^100\d{10,}$/.test(uid) || /\bwd=/.test(cookieBlob)) detected.format = "raw_1000xxx";
    }

    if (seen.has(uid)) { dupes.push(uid); continue; }
    seen.add(uid);

    rows.push({
      uid,
      password: colB,
      cookies: cookieBlob || undefined,
    });
  }

  if (rows.length === 0) {
    return {
      ok: false,
      reason: "bad_format",
      detail:
        "Could not detect any valid rows. Expected one of: (a) CSV with UID/Password headers, or (b) 3 columns: UID, Password, Cookies.",
    };
  }

  detected.recoveredFromCookie = recovered;
  return detected;
};