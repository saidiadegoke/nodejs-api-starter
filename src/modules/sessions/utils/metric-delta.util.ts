import { MetricDeltaDto } from '../dto';

export function computeDelta(value: number, previous: number): MetricDeltaDto {
  const v = Number(value) || 0;
  const p = Number(previous) || 0;

  if (p === 0) {
    return {
      value: v,
      previous: p,
      delta_pct: v === 0 ? 0 : null,
      direction: v > 0 ? 'up' : 'flat',
    };
  }

  const pct = Number((((v - p) / p) * 100).toFixed(2));
  const direction = Math.abs(pct) < 0.001 ? 'flat' : pct > 0 ? 'up' : 'down';
  return { value: v, previous: p, delta_pct: pct, direction };
}

export function computeDeltas<K extends string>(
  current: Record<K, number>,
  previous: Record<K, number>,
  keys: readonly K[],
): Record<K, MetricDeltaDto> {
  return Object.fromEntries(
    keys.map((key) => [key, computeDelta(current[key], previous[key])]),
  ) as Record<K, MetricDeltaDto>;
}
