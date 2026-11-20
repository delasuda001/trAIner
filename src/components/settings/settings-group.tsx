import { ChevronDown, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

type Accent = "pink" | "blue" | "yellow" | "green" | "orange";

/**
 * Catégorie repliable de la page Paramètres. Élément natif <details> : fonctionne sans
 * JavaScript, et l'état ouvert ou replié choisi par l'utilisateur survit aux rafraîchissements
 * de la page (React ne réécrit pas l'attribut « open » après le premier rendu).
 */
export function SettingsGroup({ id, title, note, badge, icon: Icon, accent, open = false, closedOnPhone = false, children }: {
  id: string;
  title: string;
  note?: string;
  badge?: string | null;
  icon: LucideIcon;
  accent: Accent;
  open?: boolean;
  /** Ouverte sur grand écran mais repliée par défaut sur téléphone (contenu très long). */
  closedOnPhone?: boolean;
  children: ReactNode;
}) {
  return (
    <details id={id} className="settings-group" open={open} data-closed-on-phone={closedOnPhone ? "" : undefined} style={{ ["--group-color" as string]: `var(--sl-${accent})` } as CSSProperties}>
      <summary>
        <span className="settings-group-icon" aria-hidden="true"><Icon size={18} strokeWidth={2.4} /></span>
        <span className="settings-group-text">
          <span className="settings-group-title">{title}</span>
          {note ? <span className="settings-group-note">{note}</span> : null}
        </span>
        {badge ? <span className="settings-group-badge">{badge}</span> : null}
        <ChevronDown className="settings-group-chev" size={20} aria-hidden="true" />
      </summary>
      <div className="settings-group-body">{children}</div>
    </details>
  );
}
