import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Run Insights",
  description: "Vos activités de course, simplement.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}