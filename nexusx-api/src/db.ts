import { Pool, QueryResultRow } from "pg";
import "dotenv/config";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const q = <T extends QueryResultRow = any>(text: string, params?: any[]) =>
  pool.query<T>(text, params).then((r) => r.rows);