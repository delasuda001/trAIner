import type { Metadata } from "next";
import Link from "next/link";
import { SyncControl } from "@/components/sync-control";
import { ThemeToggle } from "@/components/theme-toggle";
import { readSyncState } from "@/lib/server/analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "trAIner",
  description: "Ton coach de course, sur tes données Garmin.",
};

export const dynamic = "force-dynamic";

// Applique le thème choisi avant le premier rendu, pour éviter un flash.
// `?theme=light|dark` force le thème sans l'enregistrer (captures d'écran).
const themeScript = `try{var q=new URLSearchParams(location.search).get("theme");var t=q||localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const sync = readSyncState();
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand"><span className="brand-mark">t</span>trAIner</Link>
            <span className="topbar-spacer" />
            <SyncControl lastSuccessAt={sync?.lastSuccessAt ?? null} lastError={sync?.lastError ?? null} />
            <ThemeToggle />
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
