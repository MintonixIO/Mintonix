import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mintonix — Every rally. Nothing in between.", template: "%s · Mintonix" },
  description: "A rally-first view of badminton. Explore the ideas behind Mintonix and follow the engineering of rally detection and match playback.",
  icons: { icon: "/brand/logomark.png", apple: "/brand/logomark.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body id="top">
        <a className="skip-link" href="#main">Skip to content</a>
        <SiteHeader />
        <div className="site-shell">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
