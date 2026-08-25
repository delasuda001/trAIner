type ActivityWithType = { type?: string | null };

export function isSupportedRunningActivity(activity: ActivityWithType): boolean {
  return normalizeActivityType(activity.type) === "run";
}

export function normalizeActivityType(type?: string | null): string | undefined {
  const normalized = type?.trim().toLowerCase();
  return normalized || undefined;
}