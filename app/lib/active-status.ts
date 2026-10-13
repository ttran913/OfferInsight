/**
 * Active status for a student, based on when any open source card was last modified.
 * 2 = green (last 7 days), 1 = yellow (last 30 days), 0 = red (otherwise)
 */
export type ActiveStatus = 0 | 1 | 2;

export function computeActiveStatus(
  entries: { dateModified: Date | null }[],
  now: Date = new Date()
): ActiveStatus {
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  if (entries.some((e) => e.dateModified && new Date(e.dateModified) >= sevenDaysAgo)) {
    return 2;
  }
  if (entries.some((e) => e.dateModified && new Date(e.dateModified) >= thirtyDaysAgo)) {
    return 1;
  }
  return 0;
}

/**
 * Parse an `active` query param ("0", "1", "2"); returns null for anything else.
 */
export function parseActiveStatusParam(value: string | null): ActiveStatus | null {
  if (value === '0' || value === '1' || value === '2') {
    return Number(value) as ActiveStatus;
  }
  return null;
}
