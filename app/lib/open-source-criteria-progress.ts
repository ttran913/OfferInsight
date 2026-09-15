export type CriteriaProgressItem = {
  type?: string;
  count?: number;
};

export type CriteriaProgressDoneEntry = {
  criteriaType?: string | null;
  selectedExtras?: unknown;
};

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

    const completedCount = doneEntries.filter((entry) => {
      if (entry.criteriaType === criteriaType) return true;
      const extras = entry.selectedExtras as string[] | null;
      return extras && Array.isArray(extras) && extras.includes(criteriaType);
    }).length;

    completed += Math.min(completedCount, requiredCount);
  }

  return { completed, total };
}
