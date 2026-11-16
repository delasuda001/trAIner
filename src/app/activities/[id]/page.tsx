import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityView } from "@/components/activity/activity-view";
import { getActivityView } from "@/lib/server/analytics";
import { readSessionCoach } from "@/lib/server/coach-service";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const view = getActivityView(decodeURIComponent((await params).id));
  if (!view) notFound();
  const coach = view.analysis ? readSessionCoach(view.analysis) : null;
  return (
    <>
      <Link href="/" className="back"><ArrowLeft size={14} /> Tableau de bord</Link>
      <ActivityView view={view} coach={coach} />
    </>
  );
}
