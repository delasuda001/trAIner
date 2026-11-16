import { AlertTriangle, CalendarDays, CheckCircle2, CircleDashed, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Tone } from "@/lib/engine/explain";

const ICONS = { good: CheckCircle2, warning: AlertTriangle, critical: AlertTriangle, neutral: Minus, up: TrendingUp, down: TrendingDown, none: CircleDashed, calendar: CalendarDays } as const;

/** Un état n'est jamais porté par la couleur seule : icône + libellé. */
export function Badge({ tone, label, icon }: { tone: Tone | "accent"; label: string; icon?: keyof typeof ICONS }) {
  const Icon = ICONS[icon ?? (tone === "accent" ? "neutral" : tone)];
  return (
    <span className={`badge badge-${tone}`}>
      <Icon size={13} aria-hidden />
      {label}
    </span>
  );
}
