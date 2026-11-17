import { apiAsAdmin } from "@/lib/profiles/request";
import { listWeeklyReviews } from "@/lib/server/coach-service";
import { weeklyReviewsMarkdown } from "@/lib/weekly/markdown";

export const dynamic = "force-dynamic";

/** Export Markdown des bilans hebdomadaires (outil interne de réglage). Réservé à Bastien. */
export function GET() {
  return apiAsAdmin(() => {
    const now = new Date().toISOString();
    return new Response(weeklyReviewsMarkdown(listWeeklyReviews(12), now), {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="sillage-bilans-${now.slice(0, 10)}.md"` },
    });
  });
}
