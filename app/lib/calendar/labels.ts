/** "1st".."4th", or "Last" for nth = -1. */
export function nthOrdinalLabel(nth: number): string {
  if (nth === -1) return 'Last';
  return ['1st', '2nd', '3rd', '4th'][nth - 1] ?? `${nth}th`;
}

/** "13:20" → "1:20 PM" */
export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}
