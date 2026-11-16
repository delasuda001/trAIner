import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { SyncControl } from "@/components/sync-control";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { readSyncState } from "@/lib/server/analytics";
import "./globals.css";

// Polices auto-hébergées par Next au build : aucune requête externe à l'usage.
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-barlow" });
const text = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "trAIner",
  description: "Ton coach de course, sur tes données Garmin.",
};

export const dynamic = "force-dynamic";

// Thème appliqué avant le premier rendu (sombre par défaut) ; `?theme=light|dark` force sans mémoriser et coupe les animations (captures d'écran).
const themeScript = `try{var q=new URLSearchParams(location.search).get("theme");var t=q||localStorage.getItem("theme");if(t==="light")document.documentElement.dataset.theme="light";if(q)document.documentElement.dataset.still="1";}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const sync = readSyncState();
  return (
    <html lang="fr" className={`${display.variable} ${text.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand" aria-label="trAIner, tableau de bord"><LogoMark /><Wordmark /></Link>
            <Nav />
            <span className="topbar-spacer" />
            <SyncControl lastSuccessAt={sync?.lastSuccessAt ?? null} lastError={sync?.lastError ?? null} lastAttemptAt={sync?.lastAttemptAt ?? null} />
            <ThemeToggle />
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
