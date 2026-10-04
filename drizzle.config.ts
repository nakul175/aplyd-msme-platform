import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./modules/*/src/db/schema.ts",
  dialect: "sqlite",
});
