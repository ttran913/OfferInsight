import { computeOpenSourceCriteriaProgress } from "@/app/lib/open-source-criteria-progress";

describe("computeOpenSourceCriteriaProgress", () => {
  it("returns zeros for empty criteria", () => {
    expect(computeOpenSourceCriteriaProgress([], [])).toEqual({
      completed: 0,
      total: 0,
    });
  });

  it("counts required totals and caps completed per criteria type", () => {
    const criteria = [
      { type: "issue", count: 2 },
      { type: "ecosystem_conversation", count: 1 },
      { type: "blog", count: 1 },
    ];
    const doneEntries = [
      { criteriaType: "issue", selectedExtras: ["blog"] },
      { criteriaType: "issue", selectedExtras: [] },
      { criteriaType: "issue", selectedExtras: [] },
      { criteriaType: "ecosystem_conversation", selectedExtras: [] },
    ];

    expect(computeOpenSourceCriteriaProgress(criteria, doneEntries)).toEqual({
      completed: 4,
      total: 4,
    });
  });

  it("skips multiple_choice blocks", () => {
    const criteria = [
      { type: "multiple_choice", count: 1 },
      { type: "issue", count: 1 },
    ];
    expect(
      computeOpenSourceCriteriaProgress(criteria, [
        { criteriaType: "issue", selectedExtras: [] },
      ])
    ).toEqual({ completed: 1, total: 1 });
  });
});
