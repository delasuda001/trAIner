export function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function standardDeviation(values: number[]): number | null {
  const average = mean(values);
  if (average == null || values.length < 2) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export function weightedMean(values: Array<{ value: number; weight: number }>): number | null {
  const total = values.reduce((sum, entry) => sum + entry.weight, 0);
  return total > 0 ? values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / total : null;
}

export function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function present<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value != null);
}
