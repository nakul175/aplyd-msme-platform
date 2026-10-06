import type { Metadata, Viewport } from "next";
import { env } from "cloudflare:workers";
import { isSyntheticEnvironment } from "../modules/platform/src/env.ts";
import type { AppEnv } from "../modules/platform/src/env.ts";
import { AppBar } from "./_ui/appbar.tsx";
import "./globals.css";

// The home page is titled with the app's name. Every other page exports its own `metadata = { title: "<page>" }`, which the template turns
// into "<page>: APLYD", so a tab, a history entry and a screen reader's page announcement all say which page it is.
export const metadata: Metadata = {
  title: { default: "APLYD MSME platform", template: "%s: APLYD" },
  description: "Describe, diagnose, procure, deploy and run technology for a small manufacturer.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1519" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const synthetic = isSyntheticEnvironment(env as unknown as AppEnv);
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to the page
        </a>
        {synthetic ? (
          <div className="banner" role="note">
            <strong>SYNTHETIC environment.</strong> Do not enter real company or personal data.
          </div>
        ) : null}
        <AppBar />
        <main id="main">{children}</main>
        <footer className="foot">
          <div className="foot-in">
            <p>APLYD MSME platform. An early version, built to be tested with manufacturers.</p>
            <p>English only for now.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
