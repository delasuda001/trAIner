import type { Metadata, Viewport } from "next";
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
import { FeedbackButton } from "@/components/feedback/feedback-button";
import { GaugeProvider } from "@/components/coach/coach-gauge";
import { coachGauge } from "@/lib/server/quota";
import { refreshRateLimits } from "@/lib/server/usage";
import { RegisterProvider } from "@/components/ui/register";
import { ConnectionProvider, OfflineBanner } from "@/components/offline/connection";
import { registerForRole } from "@/lib/register";
import { ArrivalCelebration, HeaderHearts } from "@/components/fun/celebration";
import { celebrated } from "@/lib/profiles/celebration";
import { WelcomeTour } from "@/components/tour/welcome-tour";
import { tourPending } from "@/lib/server/tour";
import { displayFirstName } from "@/lib/tour/tour";
import "./globals.css";

// Polices auto-hébergées par Next au build : aucune requête externe à l'usage.
const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-bricolage" });
const text = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono" });

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
  // iPhone : ouverte depuis l'écran d'accueil, l'application s'affiche en plein écran, sans barre Safari.
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F1F2EC" }, { media: "(prefers-color-scheme: dark)", color: "#15151E" }],
};

export const dynamic = "force-dynamic";

// Thème : celui du système par défaut, ou le choix mémorisé ; `?theme=light|dark` force sans mémoriser (captures d'écran).
const themeScript = `try{var q=new URLSearchParams(location.search).get("theme");var t=q||localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;if(q)document.documentElement.dataset.still="1";}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Sans session (page de connexion) : en-tête réduit, aucune donnée lue.
  const member = await requestMember();
  const sync = member ? runAs(member, () => readSyncState()) : null;
  // Jauge de l'abonnement de Bastien, montrée aux invités près des boutons du coach.
  // Relevé de l'abonnement s'il date de plus de 5 min (sans token, attente bornée à 2,5 s).
  if (member?.role === "guest") await refreshRateLimits({ waitMs: 2_500 });
  const gauge = member?.role === "guest" ? runAs(member, () => coachGauge()) : null;
  return (
    <html lang="fr" className={`${display.variable} ${text.variable}`} data-rendered-at={new Date().toISOString()} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <RegisterProvider register={registerForRole(member?.role)}>
        <ConnectionProvider>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand" aria-label={`${BRAND.name}, tableau de bord`}><LogoMark /><Wordmark />{celebrated(member?.id) ? <HeaderHearts /> : null}</Link>
            {member ? <Nav admin={member.role === "admin"} /> : null}
            <span className="topbar-spacer" />
            {member ? (
              <>
                <SyncControl lastSuccessAt={sync?.lastSuccessAt ?? null} lastError={sync?.lastError ?? null} lastAttemptAt={sync?.lastAttemptAt ?? null} guest={member.role === "guest"} />
                <Link href="/parametres" className="btn btn-ghost icon-btn" aria-label="Paramètres et consommation" title="Paramètres et consommation"><Settings size={16} /></Link>
              </>
            ) : null}
            <span className="desktop-only"><ThemeToggle /></span>
            {member ? <span className="desktop-only"><LogoutButton name={member.name} /></span> : null}
          </div>
        </header>
        {celebrated(member?.id) ? <ArrivalCelebration /> : null}
        <main className="shell"><OfflineBanner /><GaugeProvider gauge={gauge}>{children}</GaugeProvider></main>
        {member ? <FeedbackButton /> : null}
        {member ? <WelcomeTour firstName={displayFirstName(member.name)} guest={member.role === "guest"} autoOpen={tourPending(member.id)} /> : null}
        </ConnectionProvider>
        </RegisterProvider>
      </body>
    </html>
  );
}
