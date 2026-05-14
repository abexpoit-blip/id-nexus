import { Pool, PoolClient, QueryResultRow } from "pg";
import "dotenv/config";

const toPositiveInt = (value: string | undefined, fallback: number) => {
  const n = Number(value || fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const poolMax = toPositiveInt(process.env.DB_POOL_MAX, 20);
const statementTimeoutMs = toPositiveInt(process.env.DB_STATEMENT_TIMEOUT_MS, 15000);
const queryTimeoutMs = toPositiveInt(process.env.DB_QUERY_TIMEOUT_MS, 20000);
const lockTimeoutMs = toPositiveInt(process.env.DB_LOCK_TIMEOUT_MS, 5000);
const poolAcquireTimeoutMs = toPositiveInt(process.env.DB_POOL_ACQUIRE_TIMEOUT_MS, 5000);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: statementTimeoutMs,
  query_timeout: queryTimeoutMs,
  lock_timeout: lockTimeoutMs,
  idle_in_transaction_session_timeout: statementTimeoutMs,
  application_name: "nexusx-api",
});

pool.on("error", (err) => {
  console.error("[db.pool] idle client error", err?.message || err);
});

const acquireClient = () =>
  new Promise<PoolClient>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      const err = new Error("Database pool acquire timeout") as Error & { code?: string };
      err.code = "DB_POOL_ACQUIRE_TIMEOUT";
      reject(err);
    }, poolAcquireTimeoutMs);

    pool.connect((err, client, release) => {
      if (timedOut) {
        if (client) release();
        return;
      }
      clearTimeout(timer);
      if (err || !client) return reject(err || new Error("Database pool acquire failed"));
      resolve(client);
    });
  });

export const q = async <T extends QueryResultRow = any>(text: string, params?: any[]) => {
  const startedAt = Date.now();
  let client: PoolClient | undefined;
  try {
    client = await acquireClient();
    const r = await client.query<T>({ text, values: params, query_timeout: queryTimeoutMs });
    return r.rows;
  } catch (err: any) {
    console.error("[db.query]", {
      duration_ms: Date.now() - startedAt,
      code: err?.code,
      message: err?.message,
      pool_total: pool.totalCount,
      pool_idle: pool.idleCount,
      pool_waiting: pool.waitingCount,
      sql: text.replace(/\s+/g, " ").trim().slice(0, 240),
    });
    throw err;
  } finally {
    client?.release();
  }
};