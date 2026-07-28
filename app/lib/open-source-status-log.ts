import { prisma } from "@/db";

export const OPEN_SOURCE_STATUS_LABELS: Record<string, string> = {
  plan: "Plan",
  babyStep: "Baby Step",
  inProgress: "In Progress",
  done: "Done",
};

export function formatOpenSourceCardLabel(entry: {
  partnershipName: string;
  criteriaType?: string | null;
  metric?: string | null;
}): string {
  const parts = [entry.partnershipName];
  if (entry.criteriaType) {
    parts.push(entry.criteriaType.replace(/_/g, " "));
  }
  if (entry.metric) {
    parts.push(entry.metric);
  }
  return parts.join(" · ");
}

export function openSourceStatusLabel(status: string): string {
  return OPEN_SOURCE_STATUS_LABELS[status] ?? status;
}

function asResponseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function serializeFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return serializeFieldValue(a) === serializeFieldValue(b);
}

export type OpenSourceFieldEdit = {
  fieldLabel: string;
  fieldValue: string;
};

/** Diff plan/babyStep/proof response objects; returns changed keys with new values. */
export function diffOpenSourceResponseEdits(
  existing: {
    planResponses?: unknown;
    babyStepResponses?: unknown;
    proofResponses?: unknown;
  },
  incoming: {
    planResponses?: unknown;
    babyStepResponses?: unknown;
    proofResponses?: unknown;
  }
): OpenSourceFieldEdit[] {
  const groups: Array<[Record<string, unknown>, Record<string, unknown>]> = [
    [asResponseRecord(existing.planResponses), asResponseRecord(incoming.planResponses)],
    [asResponseRecord(existing.babyStepResponses), asResponseRecord(incoming.babyStepResponses)],
    [asResponseRecord(existing.proofResponses), asResponseRecord(incoming.proofResponses)],
  ];

  const edits: OpenSourceFieldEdit[] = [];
  const seen = new Set<string>();

  for (const [before, after] of groups) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (!key || seen.has(key)) continue;
      const oldVal = before[key];
      const newVal = after[key];
      if (valuesEqual(oldVal, newVal)) continue;
      seen.add(key);
      edits.push({
        fieldLabel: key,
        fieldValue: serializeFieldValue(newVal),
      });
    }
  }

  return edits;
}

export async function logOpenSourceColumnMove(params: {
  userId: string;
  entryId: number;
  cardLabel: string;
  fromStatus: string;
  toStatus: string;
}) {
  if (params.fromStatus === params.toStatus) {
    return null;
  }

  return prisma.openSourceStatusChange.create({
    data: {
      userId: params.userId,
      entryId: params.entryId,
      cardLabel: params.cardLabel,
      eventType: "column_move",
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
    },
  });
}

export async function logOpenSourceFieldEdits(params: {
  userId: string;
  entryId: number;
  cardLabel: string;
  edits: OpenSourceFieldEdit[];
}) {
  if (params.edits.length === 0) {
    return [];
  }

  await prisma.openSourceStatusChange.createMany({
    data: params.edits.map((edit) => ({
      userId: params.userId,
      entryId: params.entryId,
      cardLabel: params.cardLabel,
      eventType: "field_edit",
      fieldLabel: edit.fieldLabel,
      fieldValue: edit.fieldValue,
    })),
  });

  return params.edits;
}
