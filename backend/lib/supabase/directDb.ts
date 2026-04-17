/**
 * Direct PostgreSQL connection — bypasses PostgREST entirely.
 *
 * Use for operations where PostgREST's schema cache is stale
 * (e.g. newly created tables/columns not yet visible to PostgREST).
 *
 * Pool is lazy-initialized on first call and reused for the process lifetime.
 * SSL required for hosted Supabase.
 */

import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) {
      throw new Error("SUPABASE_DB_URL is not set — cannot create direct DB connection");
    }
    // Strip sslmode from connection string — pg driver handles SSL via the ssl option
    const cleanUrl = connectionString.replace(/[?&]sslmode=require/, "");
    pool = new Pool({
      connectionString: cleanUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

/**
 * Execute a parameterized SQL query directly against PostgreSQL.
 * Returns `rows` array. Throws on error.
 */
export async function directQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}
