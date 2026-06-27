import { createPostgresStore } from "./postgresStore.js";
import { createSqliteStore } from "./sqliteStore.js";
import { StoreError } from "./storeShared.js";

export function createStoreFromEnv(env = process.env) {
  const backend = (env.DATA_STORE || "sqlite").toLowerCase();

  if (backend === "sqlite") {
    return createSqliteStore({ dbPath: env.SQLITE_DB_PATH || undefined });
  }

  if (backend === "postgres" || backend === "postgresql") {
    return createPostgresStore({ connectionString: env.DATABASE_URL || undefined });
  }

  throw new StoreError(500, `Unsupported DATA_STORE: ${backend}`);
}
