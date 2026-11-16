import { ImageResponse } from "next/og";
import { BrandIcon } from "@/lib/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icône de l'écran d'accueil iPhone (« Sur l'écran d'accueil » dans Safari). */
export default function AppleIcon() {
  return new ImageResponse(<BrandIcon size={180} />, size);
}
