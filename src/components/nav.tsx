"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Tableau de bord" },
    { href: "/coach", label: "Demander au coach" },
    { href: "/objectif", label: "Objectif" },
  ];
  return (
    <nav className="nav" aria-label="Navigation principale">
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={(link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)) ? "page" : undefined}>{link.label}</Link>
      ))}
    </nav>
  );
}
