// Python rounds halves to the nearest EVEN number (2.5 becomes 2, 3.5 becomes 4).
// JavaScript rounds halves up. We copy Python's way so both versions give the same scores.

export function pyRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}
