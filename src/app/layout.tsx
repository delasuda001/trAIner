import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Mono } from "next/font/google";
import { Settings } from "lucide-react";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { SyncControl } from "@/components/sync-control";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { BRAND } from "@/lib/brand";
import { runAs } from "@/lib/profiles/context";
import { requestMember } from "@/lib/profiles/request";
import { readSyncState } from "@/lib/server/analytics";
import { LogoutButton } from "@/components/profiles/logout-button";
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Sans session (page de connexion) : en-tête réduit, aucune donnée lue.
  const member = await requestMember();
  const sync = member ? runAs(member, () => readSyncState()) : null;
  return (
    <html lang="fr" className={`${display.variable} ${text.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand" aria-label={`${BRAND.name}, tableau de bord`}><LogoMark /><Wordmark /></Link>
            {member ? <Nav admin={member.role === "admin"} /> : null}
            <span className="topbar-spacer" />
            {member ? (
              <>
                <SyncControl lastSuccessAt={sync?.lastSuccessAt ?? null} lastError={sync?.lastError ?? null} lastAttemptAt={sync?.lastAttemptAt ?? null} guest={member.role === "guest"} />
                <Link href="/parametres" className="btn btn-ghost icon-btn" aria-label="Paramètres et consommation" title="Paramètres et consommation"><Settings size={16} /></Link>
              </>
            ) : null}
            <ThemeToggle />
            {member ? <LogoutButton name={member.name} /> : null}
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
