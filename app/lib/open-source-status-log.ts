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

/** Insert a log row only when status actually changes. */
export async function logOpenSourceStatusChange(params: {
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
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
    },
  });
}
