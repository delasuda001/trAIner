import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityView } from "@/components/activity/activity-view";
import { asMember } from "@/lib/profiles/request";
import { getActivityView } from "@/lib/server/analytics";
import { readSessionCoach } from "@/lib/server/coach-service";
import { fetchDetailNow } from "@/lib/server/sync-service";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  return asMember(async (member) => {
    // Séance ancienne d'un invité : séries chargées à la première ouverture (Garmin, jamais Claude).
    await fetchDetailNow(member, id);
    const view = getActivityView(id);
    if (!view) notFound();
    const coach = view.analysis ? readSessionCoach(view.analysis) : null;
    return (
      <>
        <Link href="/" className="back"><ArrowLeft size={14} /> Tableau de bord</Link>
        <ActivityView view={view} coach={coach} />
      </>
    );
  });
}
