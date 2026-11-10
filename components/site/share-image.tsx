import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const shareImageSize = { width: 1200, height: 630 };
export const shareImageType = "image/png";

type ShareImage = { eyebrow?: string; title: string; detail?: string };

/** The link-preview card: logo, a title and one supporting line, in the site's colors. */
export async function shareImage({ eyebrow, title, detail }: ShareImage) {
  const logomark = await readFile(join(process.cwd(), "public/brand/logomark.png"), "base64");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: "#0b0c0e", color: "#f3f4f6", borderBottom: "10px solid #3693ff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, letterSpacing: "-0.02em" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered to an image, not to the page */}
          <img src={`data:image/png;base64,${logomark}`} alt="" width={58} height={66} />
          mintonix
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {eyebrow && <div style={{ display: "flex", fontSize: 28, color: "#5ba8ff" }}>{eyebrow}</div>}
          <div style={{ display: "flex", fontSize: title.length > 48 ? 60 : 76, lineHeight: 1.1, letterSpacing: "-0.03em" }}>{title}</div>
          {detail && <div style={{ display: "flex", fontSize: 30, lineHeight: 1.35, color: "#9a9da6" }}>{detail}</div>}
        </div>
      </div>
    ),
    shareImageSize,
  );
}
