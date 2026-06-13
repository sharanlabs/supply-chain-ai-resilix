import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let pool: Pool | undefined;
let db: ReturnType<typeof drizzle> | undefined;

export function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  return url && url.length > 0 ? url : undefined;
}

export function getDb() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Postgres packet storage");
  }

  if (!db) {
    // node-postgres driver: a pg Pool supports interactive transactions
    // (db.transaction()), which neon-http does not. The Pool is lazy and
    // opens no connection until the first query, so importing pg at module
    // load is safe in memory mode (DATABASE_URL unset).
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle({ client: pool });
  }

  return db;
}
