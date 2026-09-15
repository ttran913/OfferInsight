import partnershipsData from "@/partnerships/partnerships.json";
import typesData from "@/partnerships/types.json";

/**
 * Expand a partnership's criteria for a user's multiple-choice selections.
 * Multiple-choice blocks become the selected choice only (merged with types.json).
 */
export function buildCriteria(
  partnershipId: number,
  selections: Record<string, string>
): any[] {
  let mcIndex = 0;
  return (
    partnershipsData.partnerships.find((p) => p.id === partnershipId)?.criteria ||
    []
  ).flatMap((c: any) => {
    if (c.type === "multiple_choice" && c.choices) {
      const selectedType = selections[String(mcIndex)];
      mcIndex++;
      if (!selectedType) return [];
      const selectedChoice = c.choices.find(
        (choice: any) => choice.type === selectedType
      );
      if (!selectedChoice) return [];
      const typeDef = (typesData.types as any)[selectedChoice.type];
      return [{ ...selectedChoice, ...typeDef }];
    }
    return [{ ...c, ...((typesData.types as any)[c.type] || {}) }];
  });
}
