import vinext from "vinext";
import { defineConfig } from "vite";

// Placeholder id for the local D1 database. Hosted environments are configured outside this file.
const LOCAL_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local and send no telemetry.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          main: "./worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
          d1_databases: [
            { binding: "DB", database_name: "aplyd-local", database_id: LOCAL_DATABASE_ID },
          ],
          // Never a production value. Synthetic sign-in refuses to run for any other value.
          vars: { APLYD_ENV: "local" },
        },
      }),
    ],
  };
});
