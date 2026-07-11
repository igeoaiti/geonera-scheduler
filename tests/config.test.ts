import { expect, test } from "bun:test";
import drizzleConfig from "../drizzle.config";
import type { Db } from "../src/db";

test("Drizzle Configuration Properties", (): void => {
  expect(drizzleConfig).toBeDefined();
  expect(drizzleConfig.schema).toBe("./src/db/schema.ts");
  expect(drizzleConfig.dialect).toBe("postgresql");
  expect(drizzleConfig.out).toBe("./drizzle");
  expect(drizzleConfig.migrations).toEqual({
    schema: "drizzle",
    table: "__geonera_scheduler_migrations",
  });
});

test("Database Client Type Exports", (): void => {
  const typedDb: Db | null = null;
  expect(typedDb).toBeNull();
});
