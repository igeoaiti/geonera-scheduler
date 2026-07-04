import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl: string = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/geonera";

// Configure the database client
// For background workers, we want to configure the pool connection limits properly.
export const queryClient: postgres.Sql = postgres(databaseUrl, { max: 10, idle_timeout: 30, connect_timeout: 10 });

export const db: PostgresJsDatabase<typeof schema> = drizzle(queryClient, { schema });
export type Db = typeof db;
