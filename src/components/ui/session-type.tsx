import { Activity, Bike, Feather, Flag, Footprints, Gauge, Mountain, Route, Waves, Zap } from "lucide-react";
import type { SessionFamily, SessionKind } from "@/lib/engine/activity-metrics";
import type { SuggestionType } from "@/lib/engine/suggestion";

/**
 * Code couleur Sillage : la couleur d'une séance est celle de sa zone FC
 * dominante (Z1 bleu → Z5 rose), partout (listes, graphiques, suggestion,
 * page séance). Les autres sports sont en encre atténuée, avec leur icône.
 */

export type Zone = 1 | 2 | 3 | 4 | 5;
export type Family = SessionFamily | "other";

export const ZONE_COLOR: Record<Zone, string> = { 1: "var(--zone-1)", 2: "var(--zone-2)", 3: "var(--zone-3)", 4: "var(--zone-4)", 5: "var(--zone-5)" };
export const ZONE_NAMES: Record<Zone, string> = { 1: "Z1 Récup", 2: "Z2 Endurance", 3: "Z3 Tempo", 4: "Z4 Seuil", 5: "Z5 VO2max" };
export const OTHER_COLOR = "var(--zone-other)";

export function zoneColor(zone: Zone | null | undefined): string {
  return zone ? ZONE_COLOR[zone] : OTHER_COLOR;
}

/** Zone dominante d'une répartition de temps par zone (Z1 à Z5). */
export function dominantZone(shares: number[] | null | undefined): Zone | null {
  if (!shares || !shares.some((value) => value > 0)) return null;
  let best = 0;
  shares.forEach((value, index) => { if (value > shares[best]) best = index; });
  return (best + 1) as Zone;
}

export const FAMILY_STYLE: Record<Family, { label: string; Icon: typeof Activity }> = {
  easy: { label: "Endurance", Icon: Footprints },
  long: { label: "Sortie longue", Icon: Route },
  steady: { label: "Tempo / seuil", Icon: Gauge },
  intervals: { label: "Fractionné", Icon: Zap },
  other: { label: "Autre sport", Icon: Activity },
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

/** Zone visée par une séance proposée (même code couleur que les séances faites). */
export const SUGGESTION_ZONE: Record<SuggestionType, Zone | null> = {
  endurance: 2, long: 2, recovery_run: 1, taper: 2, rest: null, threshold: 4, vo2max: 5, specific: 4, race: 4,
};

const SPORT_ICONS: Record<string, typeof Activity> = { swimming: Waves, cycling: Bike, hiking: Mountain, walking: Footprints };

export function SessionGlyph({ family, zone, sport, size = "lg", icon }: { family: Family; zone?: Zone | null; sport?: string; size?: "lg" | "sm"; icon?: "taper" | "race" }) {
  const Icon = icon === "race" ? Flag : icon === "taper" ? Feather : family === "other" && sport && SPORT_ICONS[sport] ? SPORT_ICONS[sport] : FAMILY_STYLE[family].Icon;
  return (
    <span className={`glyph${size === "sm" ? " glyph-sm" : ""}${zone ? "" : " other"}`} style={zone ? { ["--glyph" as string]: zoneColor(zone) } : undefined} aria-hidden>
      <Icon size={size === "sm" ? 15 : 22} strokeWidth={2.2} />
    </span>
  );
}

export function ZoneDot({ zone }: { zone: Zone | null }) {
  return <span className="zone-dot" style={{ ["--glyph" as string]: zoneColor(zone) }} aria-hidden />;
}

