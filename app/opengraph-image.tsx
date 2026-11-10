import { shareImage, shareImageSize, shareImageType } from "@/components/site/share-image";
import { site } from "@/components/site/site";

export const alt = "Mintonix: badminton rally viewer and shot analysis";
export const size = shareImageSize;
export const contentType = shareImageType;

export default function Image() {
  return shareImage({ title: site.tagline, detail: "Badminton matches rally by rally, with a closer look at every shot." });
}
