export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Absolute link into the app, or null when NEXTAUTH_URL isn't set. */
export function appUrl(path: string): string | null {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '');
  return baseUrl ? `${baseUrl}${path}` : null;
}

/** Full HTML document shared by the app's emails. `bodyHtml` is inserted as-is. */
export function emailLayout({
  heading,
  headingColor = '#007ACC',
  bodyHtml,
}: {
  heading: string;
  headingColor?: string;
  bodyHtml: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: ${headingColor};">${heading}</h2>
  ${bodyHtml}
</body>
</html>`;
}

/** Red "act now" box. `html` is inserted as-is. */
export function emailCallout(html: string): string {
  return `<p style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 16px 0;">${html}</p>`;
}

export function emailButton(href: string, label: string): string {
  return `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#007ACC;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:6px;">${escapeHtml(label)}</a></p>`;
}
