import type { BenchVariant } from "./types";

/** Copie de la charge utile sans les clés retirées par la variante (chemins séparés par des points). */
export function applyDropKeys<T>(payload: T, dropKeys: string[]): T {
  const copy = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  for (const path of dropKeys) {
    const parts = path.split(".");
    let node: unknown = copy;
    for (const part of parts.slice(0, -1)) node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
    if (node && typeof node === "object") delete (node as Record<string, unknown>)[parts[parts.length - 1]];
  }
  return copy as T;
}

/** Empreinte stable d'une variante (pour réutiliser les sorties déjà obtenues). */
export function variantKey(variant: Pick<BenchVariant, "systemPrompt" | "dropKeys">, basePrompt: string): string {
  return JSON.stringify({ system: variant.systemPrompt ?? basePrompt, drop: [...variant.dropKeys].sort() });
}
