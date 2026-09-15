import partnershipsData from "@/partnerships/partnerships.json";
import typesData from "@/partnerships/types.json";
import type { OpenSourceEntry, OpenSourceStatus } from "../components/types";
import { normalizePartnerName } from "./partnership-name-match";

export const HELPER_CLICK_PREFIX = "__helperClicked__";
export const HELPER_CLICK_URL_MARKER = "url:";

export type BabyStepFieldDef = {
  type?: string;
  text?: string;
  helper_video?: string;
};

type PartnershipCriteriaDef = {
  type?: string;
  baby_step_column_fields?: BabyStepFieldDef[];
};

const STATUS_ORDER: Record<OpenSourceStatus, number> = {
  plan: 0,
  babyStep: 1,
  inProgress: 2,
  done: 3,
};

function dedupeFieldsByText(fields: BabyStepFieldDef[]): BabyStepFieldDef[] {
  const seen = new Set<string>();
  return (fields ?? []).filter((field) => {
    const text = field?.text?.trim();
    if (!text) return true;
    if (seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function resolveCriteriaDef(
  criteriaType: string | null | undefined,
  partnershipCriteria: PartnershipCriteriaDef[] = []
): PartnershipCriteriaDef | null {
  if (!criteriaType) return null;
  return (
    partnershipCriteria.find((c) => c.type === criteriaType) ??
    ((typesData.types as Record<string, PartnershipCriteriaDef>)?.[criteriaType] ?? null)
  );
}

/** Trim and strip trailing slashes so youtu.be/.../ matches youtu.be/... */
export function normalizeHelperVideoUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function helperClickKey(fieldText: string): string {
  return `${HELPER_CLICK_PREFIX}${fieldText}`;
}

export function helperClickKeyForUrl(url: string): string {
  return `${HELPER_CLICK_PREFIX}${HELPER_CLICK_URL_MARKER}${normalizeHelperVideoUrl(url)}`;
}

export function isHelperClickKey(key: string): boolean {
  return key.startsWith(HELPER_CLICK_PREFIX);
}

export function isHelperClickUrlKey(key: string): boolean {
  return key.startsWith(`${HELPER_CLICK_PREFIX}${HELPER_CLICK_URL_MARKER}`);
}

export function getHelperVideoUrlFromClickKey(key: string): string | null {
  if (!isHelperClickUrlKey(key)) return null;
  return normalizeHelperVideoUrl(
    key.slice(`${HELPER_CLICK_PREFIX}${HELPER_CLICK_URL_MARKER}`.length)
  );
}

export function hasHelperBeenClicked(
  responses: Record<string, unknown> | null | undefined,
  field: BabyStepFieldDef
): boolean {
  const helperVideo =
    typeof field.helper_video === "string" ? field.helper_video.trim() : "";
  if (!helperVideo) return false;

  const responsesObj = responses ?? {};
  if (responsesObj[helperClickKeyForUrl(helperVideo)]) return true;

  const text = field?.text?.trim() ?? "";
  if (text && responsesObj[helperClickKey(text)]) return true;

  return false;
}

export function getEffectiveBabyStepFields(
  entry: OpenSourceEntry,
  partnershipCriteria: PartnershipCriteriaDef[] = []
): BabyStepFieldDef[] {
  const primaryDef = resolveCriteriaDef(entry.criteriaType, partnershipCriteria);
  const fields: BabyStepFieldDef[] = dedupeFieldsByText([
    ...(primaryDef?.baby_step_column_fields ?? entry.babyStepFields ?? []),
  ]);

  if (
    entry.criteriaType !== "issue" ||
    !entry.selectedExtras?.length ||
    entry.status === "plan"
  ) {
    return fields;
  }

  const seenTexts = new Set(fields.map((f) => f?.text?.trim()).filter(Boolean));
  for (const extraType of entry.selectedExtras) {
    const extraDef = resolveCriteriaDef(extraType, partnershipCriteria);
    const extraFields = dedupeFieldsByText(extraDef?.baby_step_column_fields ?? []);
    for (const field of extraFields) {
      const text = field?.text?.trim();
      if (text && seenTexts.has(text)) continue;
      if (text) seenTexts.add(text);
      fields.push(field);
    }
  }

  return fields;
}

export function entryIncludesHelperVideoUrl(
  entry: OpenSourceEntry,
  helperVideoUrl: string,
  partnershipCriteria: PartnershipCriteriaDef[] = []
): boolean {
  const target = normalizeHelperVideoUrl(helperVideoUrl);
  if (!target) return false;

  return getEffectiveBabyStepFields(entry, partnershipCriteria).some((field) => {
    const video = typeof field.helper_video === "string" ? field.helper_video.trim() : "";
    return video.length > 0 && normalizeHelperVideoUrl(video) === target;
  });
}

/** Collect tutorial URLs already marked clicked on this entry (URL keys + legacy text keys). */
export function getClickedHelperUrlsFromEntry(
  entry: OpenSourceEntry,
  partnershipCriteria: PartnershipCriteriaDef[] = []
): string[] {
  const responses = entry.babyStepResponses ?? {};
  const urls = new Set<string>();

  for (const [key, value] of Object.entries(responses)) {
    if (!value || !isHelperClickKey(key)) continue;
    const fromUrlKey = getHelperVideoUrlFromClickKey(key);
    if (fromUrlKey) urls.add(fromUrlKey);
  }

  for (const field of getEffectiveBabyStepFields(entry, partnershipCriteria)) {
    const text = field.text?.trim();
    const video = typeof field.helper_video === "string" ? field.helper_video.trim() : "";
    if (!text || !video) continue;
    if (responses[helperClickKey(text)]) {
      urls.add(normalizeHelperVideoUrl(video));
    }
  }

  return [...urls];
}

export function isBabyStepComplete(
  entry: OpenSourceEntry,
  partnershipCriteria: PartnershipCriteriaDef[] = []
): boolean {
  const fields = getEffectiveBabyStepFields(entry, partnershipCriteria);
  if (fields.length === 0) return true;

  const responses = entry.babyStepResponses ?? {};

  for (const field of fields) {
    const text = field?.text?.trim();
    if (!text) continue;

    const helperVideo =
      typeof field.helper_video === "string" ? field.helper_video.trim() : "";
    if (helperVideo && !hasHelperBeenClicked(responses, field)) {
      return false;
    }

    const fieldType = (field.type ?? "").toLowerCase();
    if (fieldType === "checkbox" && !responses[text]) {
      return false;
    }
  }

  return true;
}

export function statusRequiresBabyStepComplete(
  fromStatus: OpenSourceStatus,
  toStatus: OpenSourceStatus
): boolean {
  const fromOrder = STATUS_ORDER[fromStatus];
  const toOrder = STATUS_ORDER[toStatus];
  return toOrder >= STATUS_ORDER.inProgress && toOrder > fromOrder;
}

export function getPartnershipCriteriaFromCatalog(
  partnershipName: string
): PartnershipCriteriaDef[] {
  const partnership = partnershipsData.partnerships.find(
    (p) => normalizePartnerName(p.name) === normalizePartnerName(partnershipName)
  );
  if (!partnership?.criteria) return [];

  return partnership.criteria.flatMap((c) => {
    if (c.type === "multiple_choice" && c.choices) {
      return c.choices.map((choice: { type?: string }) => {
        const typeDef = (typesData.types as Record<string, PartnershipCriteriaDef>)?.[
          choice.type ?? ""
        ];
        return typeDef ? { type: choice.type, ...typeDef } : { type: choice.type };
      });
    }
    const typeDef = (typesData.types as Record<string, PartnershipCriteriaDef>)?.[c.type];
    return typeDef ? [{ type: c.type, ...typeDef }] : [{ type: c.type }];
  });
}
