export const RECENCY_WINDOW_DAYS = 28;

const periods = new Map<string, number>();

export function recencyPeriod(publishedAt: string): number {
  let period = periods.get(publishedAt);
  if (period === undefined) {
    const time = Date.parse(publishedAt);
    period = Number.isNaN(time)
      ? 0
      : Math.floor(time / (RECENCY_WINDOW_DAYS * 86_400_000));
    periods.set(publishedAt, period);
  }
  return period;
}
