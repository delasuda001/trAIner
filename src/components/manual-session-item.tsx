"use client";

import { Accessibility, CircleEllipsis, Dumbbell, Pencil, Trash2, Waves } from "lucide-react";
import type { ManualSession } from "@/lib/db/types";

const labels: Record<string, string> = { strength_training: "Musculation", swimming: "Natation", mobility: "Mobilité", other: "Autre" };
const icons = { strength_training: Dumbbell, swimming: Waves, mobility: Accessibility, other: CircleEllipsis };
type Props = { session: ManualSession; onEdit: () => void; onDelete: () => void };

export function ManualSessionItem({ session, onEdit, onDelete }: Props) {
  const Icon = icons[session.discipline as keyof typeof icons] ?? CircleEllipsis;
  return <article className="manual-item"><span className="manual-icon"><Icon size={19} /></span><div className="manual-info"><strong>{session.label || labels[session.discipline] || "Autre"}</strong><span>{session.sessionDate} · {labels[session.discipline] || "Autre"} · {session.durationMinutes} min</span></div><div className="manual-actions"><button className="icon-button" aria-label="Modifier" title="Modifier" onClick={onEdit}><Pencil size={15} /></button><button className="icon-button danger-button" aria-label="Supprimer" title="Supprimer" onClick={onDelete}><Trash2 size={15} /></button></div></article>;
}