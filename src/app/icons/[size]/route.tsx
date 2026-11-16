import { ImageResponse } from "next/og";
import { BrandIcon } from "@/lib/brand-icon";

const SIZES = new Set([192, 512]);

/** Icônes du manifeste (Android) : /icons/192, /icons/512, et /icons/512-maskable. */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const raw = (await params).size;
  const padded = raw.endsWith("-maskable");
  const size = Number(raw.replace("-maskable", ""));
  if (!SIZES.has(size)) return new Response("Introuvable", { status: 404 });
  return new ImageResponse(<BrandIcon size={size} padded={padded} />, { width: size, height: size });
}
