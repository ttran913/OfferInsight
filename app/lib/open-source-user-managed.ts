export const USER_MANAGED_CRITERIA_TYPES = [
  "issue",
] as const;

export type UserManagedCriteriaType =
  (typeof USER_MANAGED_CRITERIA_TYPES)[number];

export function isUserManagedCriteriaType(
  type: string | null | undefined
): type is UserManagedCriteriaType {
  return (
    type != null &&
    (USER_MANAGED_CRITERIA_TYPES as readonly string[]).includes(type)
  );
}
