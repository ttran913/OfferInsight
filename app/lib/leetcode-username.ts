/** True when the value looks like a LeetCode profile URL instead of a bare username. */
export function looksLikeLeetCodeUrl(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  return lower.includes('leetcode.com') || lower.includes('leetcode.cn');
}
