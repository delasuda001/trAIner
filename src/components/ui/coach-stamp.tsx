import { Sparkles } from "lucide-react";
import { generatedAtLabel, modelLabel } from "@/lib/coach/model-label";

/** Signature d'une analyse du coach : modèle et date de génération. */
export function CoachStamp({ model, createdAt, prefix = "Analyse" }: { model: string; createdAt: string; prefix?: string }) {
  return (
    <span className="coach-stamp" title={model}>
      <Sparkles size={12} aria-hidden /> {prefix} {modelLabel(model)} · {generatedAtLabel(createdAt)}
    </span>
  );
}
