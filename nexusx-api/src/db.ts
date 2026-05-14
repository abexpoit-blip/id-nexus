import { Pool, QueryResultRow } from "pg";
import "dotenv/config";

const poolMax = Number(process.env.DB_POOL_MAX || 20);
const statementTimeoutMs = Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000);
const queryTimeoutMs = Number(process.env.DB_QUERY_TIMEOUT_MS || 20000);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number.isFinite(poolMax) ? poolMax : 20,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: Number.isFinite(statementTimeoutMs) ? statementTimeoutMs : 15000,
  query_timeout: Number.isFinite(queryTimeoutMs) ? queryTimeoutMs : 20000,
  application_name: "nexusx-api",
});

pool.on("error", (err) => {
  console.error("[db.pool] idle client error", err?.message || err);
});

export const q = <T extends QueryResultRow = any>(text: string, params?: any[]) => {
  const startedAt = Date.now();
  return pool.query<T>(text, params)
    .then((r) => r.rows)
    .catch((err) => {
      console.error("[db.query]", {
        duration_ms: Date.now() - startedAt,
        code: err?.code,
        message: err?.message,
        sql: text.replace(/\s+/g, " ").trim().slice(0, 240),
      });
      throw err;
    });
};