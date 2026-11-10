import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mintonix — Watch the rally. Read the game.", template: "%s · Mintonix" },
  description: "Watch badminton with less waiting. Skip between detected rallies, jump to points by score, and revisit exchanges in the original match video.",
  icons: { icon: "/brand/logomark.png", apple: "/brand/logomark.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body id="top">
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
