import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mintonix — Every rally. Nothing in between.", template: "%s · Mintonix" },
  description: "Watch badminton with less waiting. Skip between detected rallies, jump to points by score, and revisit exchanges in the original match video.",
  icons: { icon: "/brand/logomark.png", apple: "/brand/logomark.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body id="top">
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
