/**
 * Traffic-light statuses shown on the instructor dashboard.
 * 2 = green, 1 = yellow, 0 = red
 */
export type StatusColor = 0 | 1 | 2;

function daysBefore(now: Date, days: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * Active: when any open source card (any partnership) was last modified.
 * Green = last 7 days, Yellow = last 30 days.
 */
export function computeActiveStatus(
  entries: { dateModified: Date | null }[],
  now: Date = new Date()
): StatusColor {
  const sevenDaysAgo = daysBefore(now, 7);
  const thirtyDaysAgo = daysBefore(now, 30);

  if (entries.some((e) => e.dateModified && e.dateModified >= sevenDaysAgo)) {
    return 2;
  }
  if (entries.some((e) => e.dateModified && e.dateModified >= thirtyDaysAgo)) {
    return 1;
  }
  return 0;
}

/**
 * Progress: open source completion within the active partnership (red without one).
 * Green = 2+ distinct criteria types done in the last 30 days, Yellow = 1+ issue done in the last 90 days.
 */
export function computeProgressStatus(
  entries: {
    status: string;
    criteriaType: string | null;
    selectedExtras: unknown;
    partnershipName: string | null;
    dateModified: Date | null;
  }[],
  activePartnershipName: string | null,
  now: Date = new Date()
): StatusColor {
  if (!activePartnershipName) return 0;

  const thirtyDaysAgo = daysBefore(now, 30);
  const ninetyDaysAgo = daysBefore(now, 90);
  const doneEntries = entries.filter(
    (e) => e.status === 'done' && e.partnershipName === activePartnershipName
  );

  const criteriaTypesInLast30Days = new Set<string>();
  for (const e of doneEntries) {
    if (!e.dateModified || e.dateModified < thirtyDaysAgo) continue;
    if (e.criteriaType) criteriaTypesInLast30Days.add(e.criteriaType);
    if (Array.isArray(e.selectedExtras)) {
      (e.selectedExtras as string[]).forEach((t) => criteriaTypesInLast30Days.add(t));
    }
  }
  if (criteriaTypesInLast30Days.size >= 2) return 2;

  const issueDoneInLast90Days = doneEntries.some(
    (e) => e.criteriaType === 'issue' && e.dateModified && e.dateModified >= ninetyDaysAgo
  );
  return issueDoneInLast90Days ? 1 : 0;
}

/**
 * Parse a comma-separated status param like "2,0". Invalid values are dropped;
 * an empty result means "no filter".
 */
export function parseStatusColorsParam(value: string | null): StatusColor[] {
  if (!value) return [];
  const colors = new Set<StatusColor>();
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '0' || trimmed === '1' || trimmed === '2') {
      colors.add(Number(trimmed) as StatusColor);
    }
  }
  return Array.from(colors);
}
