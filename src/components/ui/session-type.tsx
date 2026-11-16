import { Activity, Bike, Feather, Flag, Footprints, Gauge, Mountain, Route, Waves, Zap } from "lucide-react";
import type { SessionFamily, SessionKind } from "@/lib/engine/activity-metrics";
import type { SuggestionType } from "@/lib/engine/suggestion";

/**
 * Langage visuel des types de séance : une couleur et une icône par famille,
 * les mêmes dans les listes, les graphiques, la suggestion et la page séance.
 */

export type Family = SessionFamily | "other";

export const FAMILY_STYLE: Record<Family, { color: string; label: string; Icon: typeof Activity }> = {
  easy: { color: "var(--fam-easy)", label: "Endurance", Icon: Footprints },
  long: { color: "var(--fam-long)", label: "Sortie longue", Icon: Route },
  steady: { color: "var(--fam-steady)", label: "Tempo / seuil", Icon: Gauge },
  intervals: { color: "var(--fam-intervals)", label: "Fractionné", Icon: Zap },
  other: { color: "var(--fam-other)", label: "Autre sport", Icon: Activity },
};

const KIND_FAMILY: Record<SessionKind, SessionFamily> = {
  recovery: "easy", endurance: "easy", long: "long", tempo: "steady", threshold: "steady",
  intervals_short: "intervals", intervals_vo2: "intervals", intervals_threshold: "intervals", intervals_tempo: "intervals",
};

export function familyOfKind(kind: string | null | undefined): Family {
  return kind && kind in KIND_FAMILY ? KIND_FAMILY[kind as SessionKind] : "other";
}

export const SUGGESTION_FAMILY: Record<SuggestionType, Family> = {
  endurance: "easy", recovery_run: "easy", taper: "easy", rest: "other", long: "long",
  threshold: "intervals", vo2max: "intervals", specific: "intervals", race: "steady",
};

const SPORT_ICONS: Record<string, typeof Activity> = { swimming: Waves, cycling: Bike, hiking: Mountain, walking: Footprints };

export function SessionGlyph({ family, sport, size = "lg", icon }: { family: Family; sport?: string; size?: "lg" | "sm"; icon?: "taper" | "race" }) {
  const style = FAMILY_STYLE[family];
  const Icon = icon === "race" ? Flag : icon === "taper" ? Feather : family === "other" && sport && SPORT_ICONS[sport] ? SPORT_ICONS[sport] : style.Icon;
  return (
    <span className={`glyph${size === "sm" ? " glyph-sm" : ""}`} style={{ ["--glyph" as string]: style.color }} aria-hidden>
      <Icon size={size === "sm" ? 15 : 22} strokeWidth={2.2} />
    </span>
  );
}
