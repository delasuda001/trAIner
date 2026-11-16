import type { Sport } from "@/lib/source/types";
import type { VerdictLevel } from "./verdict";
import type { Tone } from "./explain";

export const SPORT_LABELS: Record<Sport, string> = {
  running: "Course",
  trail_running: "Trail",
  treadmill_running: "Tapis",
  cycling: "Vélo",
  swimming: "Natation",
  hiking: "Randonnée",
  walking: "Marche",
  strength: "Renforcement",
  ski_touring: "Ski de rando",
  surfing: "Surf",
  other: "Autre",
};

export const VERDICT_TONES: Record<VerdictLevel, { tone: Tone; icon: "up" | "neutral" | "down" | "none" }> = {
  above: { tone: "good", icon: "up" },
  in_line: { tone: "neutral", icon: "neutral" },
  below: { tone: "warning", icon: "down" },
  no_reference: { tone: "neutral", icon: "none" },
};
