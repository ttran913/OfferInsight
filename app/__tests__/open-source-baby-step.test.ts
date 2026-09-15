import {
  getEffectiveBabyStepFields,
  helperClickKey,
  helperClickKeyForUrl,
  hasHelperBeenClicked,
  isBabyStepComplete,
  normalizeHelperVideoUrl,
  statusRequiresBabyStepComplete,
} from "@/app/dashboard/lib/open-source-baby-step";
import type { OpenSourceEntry } from "@/app/dashboard/components/types";

const ISSUE_HELPER_FIELD = {
  type: "URL",
  text: "Find an issue to work on.",
  helper_video: "https://youtu.be/TPqPsoahzOQ",
};

const ECOSYSTEM_CHECKBOX = {
  type: "checkbox",
  text: "Read this guide on reaching out to a user of your open source project.",
  helper_video: "https://docs.google.com/document/d/example",
};

const FEEDBACK_CHECKBOX = {
  type: "Checkbox",
  text: "The helper video will explain how you can maximize your chances of receiving feedback on your PR.",
  helper_video: "https://youtu.be/U87ZQIo9tu0",
};

const SEEK_FEEDBACK_SAME_URL = {
  type: "Checkbox",
  text: "Different copy, same tutorial video.",
  helper_video: "https://youtu.be/U87ZQIo9tu0",
};

const NO_HELPER_CHECKBOX = {
  type: "checkbox",
  text: "Acknowledge the contribution guidelines.",
  helper_video: "",
};

const partnershipCriteria = [
  {
    type: "issue",
    baby_step_column_fields: [ISSUE_HELPER_FIELD],
  },
  {
    type: "ecosystem_conversation",
    baby_step_column_fields: [ECOSYSTEM_CHECKBOX],
  },
  {
    type: "receive_feedback",
    baby_step_column_fields: [FEEDBACK_CHECKBOX],
  },
  {
    type: "seek_feedback",
    baby_step_column_fields: [SEEK_FEEDBACK_SAME_URL],
  },
  {
    type: "edge_cases",
    baby_step_column_fields: [NO_HELPER_CHECKBOX],
  },
];

function makeEntry(overrides: Partial<OpenSourceEntry> = {}): OpenSourceEntry {
  return {
    id: 1,
    partnershipName: "Test Partner",
    criteriaType: "issue",
    status: "babyStep",
    babyStepFields: [ISSUE_HELPER_FIELD],
    babyStepResponses: {},
    userId: "user-1",
    ...overrides,
  };
}

describe("getEffectiveBabyStepFields", () => {
  it("returns primary baby step fields", () => {
    expect(getEffectiveBabyStepFields(makeEntry(), partnershipCriteria)).toEqual([
      ISSUE_HELPER_FIELD,
    ]);
  });

  it("merges issue extra baby step fields", () => {
    const fields = getEffectiveBabyStepFields(
      makeEntry({
        status: "babyStep",
        selectedExtras: ["receive_feedback"],
      }),
      partnershipCriteria
    );
    expect(fields).toEqual([ISSUE_HELPER_FIELD, FEEDBACK_CHECKBOX]);
  });

  it("does not merge extras while card is still in plan", () => {
    const fields = getEffectiveBabyStepFields(
      makeEntry({
        status: "plan",
        selectedExtras: ["receive_feedback"],
      }),
      partnershipCriteria
    );
    expect(fields).toEqual([ISSUE_HELPER_FIELD]);
  });
});

describe("hasHelperBeenClicked / URL keys", () => {
  it("treats normalized URL click keys as shared across different field text", () => {
    const responses = {
      [helperClickKeyForUrl(FEEDBACK_CHECKBOX.helper_video)]: true,
    };
    expect(hasHelperBeenClicked(responses, FEEDBACK_CHECKBOX)).toBe(true);
    expect(hasHelperBeenClicked(responses, SEEK_FEEDBACK_SAME_URL)).toBe(true);
  });

  it("still accepts legacy text click keys", () => {
    const responses = {
      [helperClickKey(ISSUE_HELPER_FIELD.text)]: true,
    };
    expect(hasHelperBeenClicked(responses, ISSUE_HELPER_FIELD)).toBe(true);
  });

  it("returns false when helper_video is empty", () => {
    expect(
      hasHelperBeenClicked(
        { [helperClickKey(NO_HELPER_CHECKBOX.text)]: true },
        NO_HELPER_CHECKBOX
      )
    ).toBe(false);
  });

  it("normalizes trailing slashes for URL keys", () => {
    expect(normalizeHelperVideoUrl("https://youtu.be/abc/")).toBe("https://youtu.be/abc");
    expect(
      helperClickKeyForUrl("https://youtu.be/abc/")
    ).toBe(helperClickKeyForUrl("https://youtu.be/abc"));
  });
});

describe("isBabyStepComplete", () => {
  it("requires helper click for fields with helper_video", () => {
    expect(isBabyStepComplete(makeEntry(), partnershipCriteria)).toBe(false);
    expect(
      isBabyStepComplete(
        makeEntry({
          babyStepResponses: {
            [helperClickKey(ISSUE_HELPER_FIELD.text)]: true,
          },
        }),
        partnershipCriteria
      )
    ).toBe(true);
  });

  it("accepts URL-based click keys for completion", () => {
    expect(
      isBabyStepComplete(
        makeEntry({
          babyStepResponses: {
            [helperClickKeyForUrl(ISSUE_HELPER_FIELD.helper_video)]: true,
          },
        }),
        partnershipCriteria
      )
    ).toBe(true);
  });

  it("requires checkbox and helper click when both exist", () => {
    const entry = makeEntry({
      criteriaType: "ecosystem_conversation",
      babyStepFields: [ECOSYSTEM_CHECKBOX],
    });

    expect(isBabyStepComplete(entry, partnershipCriteria)).toBe(false);

    expect(
      isBabyStepComplete(
        {
          ...entry,
          babyStepResponses: {
            [helperClickKey(ECOSYSTEM_CHECKBOX.text)]: true,
          },
        },
        partnershipCriteria
      )
    ).toBe(false);

    expect(
      isBabyStepComplete(
        {
          ...entry,
          babyStepResponses: {
            [helperClickKey(ECOSYSTEM_CHECKBOX.text)]: true,
            [ECOSYSTEM_CHECKBOX.text]: true,
          },
        },
        partnershipCriteria
      )
    ).toBe(true);
  });

  it("does not share checkbox Done across fields", () => {
    const entry = makeEntry({
      criteriaType: "ecosystem_conversation",
      babyStepFields: [ECOSYSTEM_CHECKBOX],
      babyStepResponses: {
        [helperClickKeyForUrl(ECOSYSTEM_CHECKBOX.helper_video)]: true,
        // checkbox not checked
      },
    });
    expect(isBabyStepComplete(entry, partnershipCriteria)).toBe(false);
  });

  it("requires only checkbox when helper_video is empty", () => {
    const entry = makeEntry({
      criteriaType: "edge_cases",
      babyStepFields: [NO_HELPER_CHECKBOX],
    });

    expect(isBabyStepComplete(entry, partnershipCriteria)).toBe(false);
    expect(
      isBabyStepComplete(
        {
          ...entry,
          babyStepResponses: { [NO_HELPER_CHECKBOX.text]: true },
        },
        partnershipCriteria
      )
    ).toBe(true);
  });

  it("returns true when there are no baby step fields", () => {
    expect(
      isBabyStepComplete(
        makeEntry({ babyStepFields: [], criteriaType: "unknown" }),
        partnershipCriteria
      )
    ).toBe(true);
  });

  it("does not require URL field values", () => {
    expect(
      isBabyStepComplete(
        makeEntry({
          babyStepResponses: {
            [helperClickKey(ISSUE_HELPER_FIELD.text)]: true,
            [ISSUE_HELPER_FIELD.text]: "",
          },
        }),
        partnershipCriteria
      )
    ).toBe(true);
  });
});

describe("statusRequiresBabyStepComplete", () => {
  it("requires completion when moving forward to inProgress or done", () => {
    expect(statusRequiresBabyStepComplete("babyStep", "inProgress")).toBe(true);
    expect(statusRequiresBabyStepComplete("plan", "inProgress")).toBe(true);
    expect(statusRequiresBabyStepComplete("plan", "done")).toBe(true);
    expect(statusRequiresBabyStepComplete("babyStep", "done")).toBe(true);
    expect(statusRequiresBabyStepComplete("inProgress", "done")).toBe(true);
  });

  it("does not require completion for backward or lateral moves", () => {
    expect(statusRequiresBabyStepComplete("babyStep", "plan")).toBe(false);
    expect(statusRequiresBabyStepComplete("inProgress", "babyStep")).toBe(false);
    expect(statusRequiresBabyStepComplete("plan", "babyStep")).toBe(false);
    expect(statusRequiresBabyStepComplete("babyStep", "babyStep")).toBe(false);
  });
});
