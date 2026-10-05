import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import { isSyntheticEnvironment } from "../modules/platform/src/env.ts";
import type { AppEnv } from "../modules/platform/src/env.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: "APLYD MSME platform",
  description: "Describe, diagnose, procure, deploy and run technology for a small manufacturer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const synthetic = isSyntheticEnvironment(env as unknown as AppEnv);
  return (
    <html lang="en">
      <body>
        {synthetic ? (
          <div className="banner" role="note">
            SYNTHETIC environment. Do not enter real company or personal data.
          </div>
        ) : null}
        <main>{children}</main>
      </body>
    </html>
  );
}
