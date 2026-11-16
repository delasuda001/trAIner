import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dossier de build séparé pour les essais (sans toucher à l'application en cours d'utilisation).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
