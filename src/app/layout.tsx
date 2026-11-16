import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono } from "next/font/google";
import { Settings } from "lucide-react";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { SyncControl } from "@/components/sync-control";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { BRAND } from "@/lib/brand";
import { readSyncState } from "@/lib/server/analytics";
import "./globals.css";

// Polices auto-hébergées par Next au build : aucune requête externe à l'usage.
const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-bricolage" });
const text = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono" });

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
};

export const dynamic = "force-dynamic";

// Thème : celui du système par défaut, ou le choix mémorisé ; `?theme=light|dark` force sans mémoriser (captures d'écran).
const themeScript = `try{var q=new URLSearchParams(location.search).get("theme");var t=q||localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;if(q)document.documentElement.dataset.still="1";}catch(e){}`;

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
            <Link href="/" className="brand" aria-label={`${BRAND.name}, tableau de bord`}><LogoMark /><Wordmark /></Link>
            <Nav />
            <span className="topbar-spacer" />
            <SyncControl lastSuccessAt={sync?.lastSuccessAt ?? null} lastError={sync?.lastError ?? null} lastAttemptAt={sync?.lastAttemptAt ?? null} />
            <Link href="/parametres" className="btn btn-ghost icon-btn" aria-label="Paramètres et consommation" title="Paramètres et consommation"><Settings size={16} /></Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
