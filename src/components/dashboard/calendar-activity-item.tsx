import { Accessibility, CircleEllipsis, Dumbbell, Footprints, Waves } from "lucide-react";
import Link from "next/link";
import type { CalendarDisplayItem } from "@/lib/dashboard/types";

const icons = { strength_training: Dumbbell, swimming: Waves, mobility: Accessibility, other: CircleEllipsis };
export function CalendarActivityItem({ item }: { item: CalendarDisplayItem }) {
  const Icon = item.source === "running_sync" ? Footprints : icons[item.metadata.discipline as keyof typeof icons] ?? CircleEllipsis;
  const size = Math.max(30, Math.min(52, 30 + item.volume * (item.volumeUnit === "km" ? 1.4 : 0.25)));
  const content = <span className="calendar-bubble" style={{ width: size, minHeight: size }} title={`${item.displayType} · ${item.subtitle}`}><Icon size={15} /><span>{item.title}</span></span>;
  return item.href ? <Link href={item.href} className="calendar-item-link">{content}</Link> : <button className="calendar-item-link manual-calendar-button" type="button">{content}</button>;
}