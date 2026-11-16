import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/** Application installable (Android : « Installer » ; iPhone : Partager → « Sur l'écran d'accueil »). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F1F2EC",
    theme_color: "#F1F2EC",
    lang: "fr",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
