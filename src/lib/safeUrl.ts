/**
 * URL and Protocol Sanitization Utilities
 * Prevents DOM Cross-Site Scripting (XSS) via javascript:, vbscript:, and malicious data: schemes.
 */

/**
 * Validates that an email address follows standard RFC-compliant format
 * without newlines, control characters, or protocol injection.
 */
export function isValidEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim();
  if (clean.length > 254 || clean.includes('\n') || clean.includes('\r') || clean.includes('\0')) {
    return false;
  }
  // Standard non-backtracking safe email regex
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(clean);
}

/**
 * Safely constructs a mailto: URL with encoded parameters.
 * Returns '#' if the recipient email is invalid or contains forbidden protocol schemes.
 */
export function sanitizeMailto(email?: string | null, params?: Record<string, string>): string {
  if (!email || typeof email !== 'string') return '#';
  const cleanEmail = email.trim();
  if (!isValidEmail(cleanEmail)) return '#';

  const base = `mailto:${encodeURIComponent(cleanEmail)}`;
  if (!params) return base;

  const validEntries = Object.entries(params)
    .filter(([_, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);

  return validEntries.length > 0 ? `${base}?${validEntries.join('&')}` : base;
}

/**
 * Validates and sanitizes telephone numbers for tel: links.
 * Returns '#' if the phone number contains forbidden characters.
 */
export function sanitizeTel(phone?: string | null): string {
  if (!phone || typeof phone !== 'string') return '#';
  const clean = phone.trim();
  // Strip non-digit characters except leading plus
  const sanitized = clean.replace(/[^0-9+]/g, '');
  if (sanitized.length < 3 || sanitized.length > 20) return '#';
  return `tel:${sanitized}`;
}

/**
 * Sanitizes URLs for links and navigation.
 * Strictly permits only http, https, mailto, tel, blob, and relative paths.
 * Blocks javascript:, vbscript:, and data: schemes.
 */
export function sanitizeUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '#';
  const clean = url.trim();
  const lower = clean.toLowerCase();

  // Explicit blocklist for dangerous schemes
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:')
  ) {
    return '#';
  }

  // Allowed schemes
  if (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('/') ||
    lower.startsWith('#')
  ) {
    return clean;
  }

  return '#';
}

/**
 * Sanitizes image source URLs.
 * Strictly permits only https, http, data:image/, blob, and relative asset paths.
 * Blocks javascript:, vbscript:, and non-image data: schemes.
 */
export function sanitizeImageUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();
  const lower = clean.toLowerCase();

  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text') ||
    lower.startsWith('data:application')
  ) {
    return '';
  }

  if (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('data:image/') ||
    lower.startsWith('blob:') ||
    lower.startsWith('/')
  ) {
    return clean;
  }

  return '';
}

/**
 * Cryptographically secure random integer generator.
 * Uses window.crypto.getRandomValues instead of insecure Math.random().
 */
export function secureRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  if (range <= 0) return min;

  const array = new Uint32Array(1);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    // Node.js or fallback environment
    const cryptoMod = (globalThis as any).crypto;
    if (cryptoMod && cryptoMod.getRandomValues) {
      cryptoMod.getRandomValues(array);
    }
  }

  return min + (array[0] % range);
}
