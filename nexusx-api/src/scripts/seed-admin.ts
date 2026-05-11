import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool, q } from "../db";

/**
 * Seed (or reset) the initial admin account.
 *
 * Reads:
 *   ADMIN_EMAIL    (default: admin@nexusbuysell.com)
 *   ADMIN_PASSWORD (default: Shovon@5448)
 *
 * Idempotent: re-running updates the password and ensures the admin role exists.
 */
async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@nexusbuysell.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Shovon@5448";

  const hash = await bcrypt.hash(password, 10);

  const [existing] = await q<{ id: string }>(`SELECT id FROM users WHERE email=$1`, [email]);
  let userId: string;

  if (existing) {
    userId = existing.id;
    await q(`UPDATE users SET password_hash=$1, email_verified=true WHERE id=$2`, [hash, userId]);
    console.log(`↻  Updated existing admin user (${email})`);
  } else {
    const [u] = await q<{ id: string }>(
      `INSERT INTO users(email, password_hash, email_verified) VALUES($1,$2,true) RETURNING id`,
      [email, hash]
    );
    userId = u.id;
    console.log(`✓  Created admin user (${email})`);
  }

  await q(
    `INSERT INTO profiles(id, email, display_name) VALUES($1,$2,'Admin')
     ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email`,
    [userId, email]
  );

  await q(
    `INSERT INTO user_roles(user_id, role) VALUES($1,'admin') ON CONFLICT DO NOTHING`,
    [userId]
  );

  console.log(`✅ Admin ready:\n   email:    ${email}\n   password: ${password}\n   user id:  ${userId}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });