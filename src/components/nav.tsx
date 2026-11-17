"use client";

import { Gauge, MessageCircle, MessagesSquare, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Tableau de bord", short: "Accueil", icon: Gauge, admin: false },
  { href: "/coach", label: "Demander au coach", short: "Coach", icon: MessageCircle, admin: false },
  { href: "/objectif", label: "Objectif", short: "Objectif", icon: Target, admin: false },
  // Retours des testeurs : réservés à Bastien. Le bilan hebdomadaire (outil de réglage) est dans Paramètres.
  { href: "/retours", label: "Retours", short: "Retours", icon: MessagesSquare, admin: true },
];

/** En haut sur ordinateur, en barre d'onglets en bas de l'écran sur téléphone. */
export function Nav({ admin }: { admin: boolean }) {
  const pathname = usePathname();
  const links = LINKS.filter((link) => admin || !link.admin);
  return (
    <nav className="nav" aria-label="Navigation principale">
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <Link key={link.href} href={link.href} aria-current={(link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)) ? "page" : undefined}>
            <Icon size={18} className="nav-icon" aria-hidden />
            <span className="nav-label">{link.label}</span>
            <span className="nav-short">{link.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
