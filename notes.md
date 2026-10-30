# TODO:

## Code Cleanup Tasks

### 1. Remove Debug Console.log Statements
- `auth.ts` lines 28-29, 36 - Debug logs in session callback
- `app/server.ts` line 9 - "Unauthorized!!!!!!!!!!!!!!!!!!!!!!" debug message
- `app/onboarding/page.tsx` line 8 - Same debug message
- Check all 24 files with console.log statements and remove debug ones

### 2. Clean Up Large Commented Code Blocks
- `auth.ts` lines 61-134 - Entire commented NextAuth configuration (70+ lines)
  - Consider removing if not needed for reference

### 3. Review Documentation Files
- `HYDRATION_FIXES.md` - Documentation (might be outdated, check if still relevant)

### 4. Review Potentially Unused Onboarding Page
- `app/onboarding/page.tsx` - Simple navigation page that might not be needed if users go directly to page1/page2/page3

---

## NextAuth Theming

NextAuth has built-in theme customization options that can be configured in `auth.config.ts` without needing to create custom pages. This is much simpler than creating custom pages for sign-in, verify-request, error, etc.

**Current Configuration:**
- Located in `auth.config.ts` under the `theme` property
- Currently set to: dark colorScheme, electric-blue brandColor (#007ACC), white buttonText

**Available Theme Options:**
- `colorScheme`: "auto" | "dark" | "light" - Overall theme
- `brandColor`: Hex color code for accent/button colors
- `buttonText`: Hex color code for button text color
- `logo`: URL to logo image (optional)

**Reference:**
- NextAuth v5 documentation for theme options
- Can explore more advanced theming in the future if needed
