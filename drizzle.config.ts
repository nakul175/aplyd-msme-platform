import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./modules/platform/src/db/schema.ts",
  dialect: "sqlite",
});
