export type CriteriaProgressItem = {
  type?: string;
  count?: number;
  choices?: Array<{ type?: string; count?: number }>;
};

export type CriteriaProgressDoneEntry = {
  criteriaType?: string | null;
  selectedExtras?: unknown;
};

export type CrossPartnershipProgressRow = {
  id: number;
  name: string;
  completed: number;
  total: number;
  percent: number;
};

function countDoneForType(
  criteriaType: string,
  doneEntries: CriteriaProgressDoneEntry[]
): number {
  return doneEntries.filter((entry) => {
    if (entry.criteriaType === criteriaType) return true;
    const extras = entry.selectedExtras as string[] | null;
    return Array.isArray(extras) && extras.includes(criteriaType);
  }).length;
}

/** Per-criteria-type progress for partnership goals (primaries + extras). */
export function computeOpenSourceCriteriaProgress(
  criteria: CriteriaProgressItem[] | null | undefined,
  doneEntries: CriteriaProgressDoneEntry[]
): { completed: number; total: number } {
  if (!criteria || criteria.length === 0) {
    return { completed: 0, total: 0 };
  }

  let total = 0;
  let completed = 0;

  for (const item of criteria) {
    const criteriaType = item?.type;
    if (!criteriaType || criteriaType === "multiple_choice") continue;

    const requiredCount = item.count || 1;
    total += requiredCount;

    const completedCount = countDoneForType(criteriaType, doneEntries);
    completed += Math.min(completedCount, requiredCount);
  }

  return { completed, total };
}

export function progressPercent(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((100 * completed) / total);
}

/**
 * Expand raw catalog criteria for cross-partner scoring.
 * Unresolved multiple_choice blocks pick the choice that maximizes
 * min(doneMatches, count) against the done pool (still counts that choice's total).
 */
export function expandCriteriaWithBestMultipleChoice(
  criteria: CriteriaProgressItem[] | null | undefined,
  doneEntries: CriteriaProgressDoneEntry[]
): CriteriaProgressItem[] {
  if (!criteria || criteria.length === 0) return [];

  const result: CriteriaProgressItem[] = [];

  for (const item of criteria) {
    if (item?.type === "multiple_choice" && Array.isArray(item.choices) && item.choices.length > 0) {
      let best: CriteriaProgressItem | null = null;
      let bestCompleted = -1;

      for (const choice of item.choices) {
        if (!choice?.type) continue;
        const requiredCount = choice.count || 1;
        const completed = Math.min(
          countDoneForType(choice.type, doneEntries),
          requiredCount
        );
        if (completed > bestCompleted) {
          bestCompleted = completed;
          best = { type: choice.type, count: requiredCount };
        }
      }

      if (best) result.push(best);
      continue;
    }

    if (!item?.type || item.type === "multiple_choice") continue;
    result.push({ type: item.type, count: item.count || 1 });
  }

  return result;
}

/**
 * Percent complete toward each catalog partnership using all done cards
 * (any partnershipName). Prefer known expanded criteria (student selections)
 * when present; otherwise expand unresolved MC via best-match.
 */
export function computeCrossPartnershipProgressList(
  partnerships: Array<{ id: number; name: string; criteria?: CriteriaProgressItem[] | null }>,
  doneEntries: CriteriaProgressDoneEntry[],
  knownCriteriaByPartnershipId:
    | Map<number, CriteriaProgressItem[] | null | undefined>
    | Record<number, CriteriaProgressItem[] | null | undefined>
): CrossPartnershipProgressRow[] {
  const knownMap =
    knownCriteriaByPartnershipId instanceof Map
      ? knownCriteriaByPartnershipId
      : new Map(
          Object.entries(knownCriteriaByPartnershipId).map(([id, criteria]) => [
            Number(id),
            criteria,
          ])
        );

  const byId = new Map<
    number,
    { id: number; name: string; criteria?: CriteriaProgressItem[] | null }
  >();
  for (const partnership of partnerships) {
    if (!partnership?.id || byId.has(partnership.id)) continue;
    byId.set(partnership.id, partnership);
  }

  const rows: CrossPartnershipProgressRow[] = [];
  for (const partnership of byId.values()) {
    const known = knownMap.get(partnership.id);
    const criteria =
      known && known.length > 0
        ? known
        : expandCriteriaWithBestMultipleChoice(partnership.criteria, doneEntries);

    const { completed, total } = computeOpenSourceCriteriaProgress(
      criteria,
      doneEntries
    );
    rows.push({
      id: partnership.id,
      name: partnership.name,
      completed,
      total,
      percent: progressPercent(completed, total),
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return rows;
}
