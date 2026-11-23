import {
  computeCrossPartnershipProgressList,
  computeOpenSourceCriteriaProgress,
  expandCriteriaWithBestMultipleChoice,
  progressPercent,
} from "@/app/lib/open-source-criteria-progress";

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
      { type: "blog", count: 1 },
    ];
    const doneEntries = [
      { criteriaType: "issue", selectedExtras: ["blog"] },
      { criteriaType: "issue", selectedExtras: [] },
      { criteriaType: "issue", selectedExtras: [] },
    ];

    expect(computeOpenSourceCriteriaProgress(criteria, doneEntries)).toEqual({
      completed: 3,
      total: 3,
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

  it("credits partner B criteria via selectedExtras on a partner A done issue", () => {
    const partnerBCriteria = [
      { type: "issue", count: 1 },
      { type: "give_feedback", count: 2 },
      { type: "blog_post", count: 1 },
    ];
    // One issue card (with extras) + one primary give_feedback card from another partner
    const doneFromPartnerA = [
      {
        criteriaType: "issue",
        selectedExtras: ["give_feedback", "blog_post"],
      },
      { criteriaType: "give_feedback", selectedExtras: [] },
    ];

    expect(
      computeOpenSourceCriteriaProgress(partnerBCriteria, doneFromPartnerA)
    ).toEqual({ completed: 4, total: 4 });
  });

  it("caps completed at required count even with extra done cards", () => {
    expect(
      computeOpenSourceCriteriaProgress(
        [{ type: "find_bug", count: 2 }],
        [
          { criteriaType: "find_bug" },
          { criteriaType: "find_bug" },
          { criteriaType: "find_bug" },
          { criteriaType: "issue", selectedExtras: ["find_bug"] },
        ]
      )
    ).toEqual({ completed: 2, total: 2 });
  });
});

describe("expandCriteriaWithBestMultipleChoice", () => {
  it("picks the MC choice with the most done matches", () => {
    const criteria = [
      { type: "issue", count: 1 },
      {
        type: "multiple_choice",
        choices: [
          { type: "high_quality_question", count: 1 },
          { type: "initiative", count: 1 },
          { type: "propose_implementation_plan", count: 1 },
        ],
      },
    ];
    const doneEntries = [
      { criteriaType: "issue", selectedExtras: ["initiative"] },
    ];

    expect(expandCriteriaWithBestMultipleChoice(criteria, doneEntries)).toEqual(
      [
        { type: "issue", count: 1 },
        { type: "initiative", count: 1 },
      ]
    );
  });

  it("still includes an MC slot in total when no choice has progress", () => {
    const expanded = expandCriteriaWithBestMultipleChoice(
      [
        {
          type: "multiple_choice",
          choices: [
            { type: "high_quality_question", count: 1 },
            { type: "initiative", count: 1 },
          ],
        },
      ],
      []
    );

    expect(expanded).toEqual([{ type: "high_quality_question", count: 1 }]);
    expect(computeOpenSourceCriteriaProgress(expanded, [])).toEqual({
      completed: 0,
      total: 1,
    });
  });
});

describe("computeCrossPartnershipProgressList", () => {
  it("scores all partnerships from the shared done pool and sorts by name", () => {
    const partnerships = [
      {
        id: 2,
        name: "Brianna P.",
        criteria: [
          { type: "issue", count: 2 },
          { type: "give_feedback", count: 1 },
        ],
      },
      {
        id: 1,
        name: "Aaron A.",
        criteria: [{ type: "issue", count: 1 }],
      },
    ];
    const doneEntries = [
      { criteriaType: "issue", selectedExtras: ["give_feedback"] },
      { criteriaType: "issue", selectedExtras: [] },
    ];

    const rows = computeCrossPartnershipProgressList(
      partnerships,
      doneEntries,
      {}
    );

    expect(rows.map((r) => r.name)).toEqual(["Aaron A.", "Brianna P."]);
    expect(rows[0]).toMatchObject({
      completed: 1,
      total: 1,
      percent: 100,
    });
    expect(rows[1]).toMatchObject({
      completed: 3,
      total: 3,
      percent: 100,
    });
  });

  it("prefers known expanded criteria over catalog MC best-match", () => {
    const partnerships = [
      {
        id: 4,
        name: "Jagbir K.",
        criteria: [
          { type: "issue", count: 1 },
          {
            type: "multiple_choice",
            choices: [
              { type: "initiative", count: 1 },
              { type: "high_quality_question", count: 1 },
            ],
          },
        ],
      },
    ];
    const doneEntries = [
      { criteriaType: "issue", selectedExtras: ["initiative"] },
    ];

    const rows = computeCrossPartnershipProgressList(partnerships, doneEntries, {
      4: [
        { type: "issue", count: 1 },
        { type: "high_quality_question", count: 1 },
      ],
    });

    // Known selection is high_quality_question (0 done), not best-match initiative.
    expect(rows[0]).toMatchObject({
      completed: 1,
      total: 2,
      percent: 50,
    });
  });

  it("progressPercent rounds and handles zero total", () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(0, 0)).toBe(0);
  });
});
