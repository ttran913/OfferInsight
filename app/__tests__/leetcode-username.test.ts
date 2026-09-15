import { looksLikeLeetCodeUrl } from '@/app/lib/leetcode-username';

describe('looksLikeLeetCodeUrl', () => {
  it('returns false for a plain username', () => {
    expect(looksLikeLeetCodeUrl('your_handle')).toBe(false);
  });

  it('returns true for leetcode.com profile URLs', () => {
    expect(looksLikeLeetCodeUrl('https://leetcode.com/u/your_handle')).toBe(true);
    expect(looksLikeLeetCodeUrl('leetcode.com/u/your_handle')).toBe(true);
  });

  it('returns true for leetcode.cn profile URLs', () => {
    expect(looksLikeLeetCodeUrl('https://leetcode.cn/u/your_handle')).toBe(true);
  });

  it('returns false for empty or whitespace input', () => {
    expect(looksLikeLeetCodeUrl('')).toBe(false);
    expect(looksLikeLeetCodeUrl('   ')).toBe(false);
    expect(looksLikeLeetCodeUrl(null)).toBe(false);
    expect(looksLikeLeetCodeUrl(undefined)).toBe(false);
  });
});
