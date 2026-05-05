/**
 * HTML escaping utilities for templates that interpolate user-controlled data
 * into HTML rendered by Puppeteer or returned as a page body.
 *
 * Any value that ultimately comes from chart metadata (`#TITLE`, `#ARTIST`,
 * `#DESCRIPTION`, `#CREDIT`, etc.), user aliases, pack names, or anything else
 * a user can write into the database MUST go through `escapeHtml` before being
 * placed into HTML, and through `safeUrl` before being placed into a `src` /
 * `href` attribute.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
  '=': '&#61;',
};

/**
 * Escape a string for safe interpolation into HTML text or attribute contexts.
 * Accepts any value; non-strings are coerced. `null`/`undefined` become "".
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  return str.replace(/[&<>"'`=]/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Validate that a URL is safe to drop into an `src` / `href` attribute.
 * Allows http(s) and data:image/* URIs. Anything else (including
 * `javascript:`, `vbscript:`, malformed URLs, or non-strings) returns the
 * supplied fallback (default: empty string).
 *
 * The returned value is also HTML-attribute-escaped.
 */
export function safeUrl(value: unknown, fallback: string = ''): string {
  if (typeof value !== 'string' || value.length === 0) return escapeHtml(fallback);
  const trimmed = value.trim();
  // Reject anything with control characters that could confuse the parser.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return escapeHtml(fallback);
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:image/')) {
    return escapeHtml(trimmed);
  }
  // Protocol-relative URLs (//host/...) are also acceptable; they inherit the page's scheme.
  if (lower.startsWith('//')) return escapeHtml(trimmed);
  return escapeHtml(fallback);
}
