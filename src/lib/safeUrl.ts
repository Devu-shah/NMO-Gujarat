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
 * Uses strict positive allowlist (https, http, mailto, tel, blob, and relative paths).
 * Disallows javascript:, vbscript:, data:, and unrecognized protocols.
 */
export function sanitizeUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '#';
  const clean = url.trim();

  // Strictly allow relative paths and page anchors (disallowing protocol-relative // and /\)
  if (clean.startsWith('/') && !clean.startsWith('//') && !clean.startsWith('/\\')) {
    return clean;
  }
  if (clean.startsWith('#')) {
    return clean;
  }

  // Parse absolute URLs using standard URL parser with strict safe protocol allowlist
  try {
    const parsed = new URL(clean);
    const safeProtocols = ['https:', 'http:', 'mailto:', 'tel:', 'blob:'];
    if (safeProtocols.includes(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {}

  return '#';
}

/**
 * Sanitizes image source URLs.
 * Strictly permits only https, http, blob, safe data:image/ URIs, and relative asset paths.
 */
export function sanitizeImageUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();

  // Strictly allow relative paths (disallowing protocol-relative // and /\)
  if (clean.startsWith('/') && !clean.startsWith('//') && !clean.startsWith('/\\')) {
    return clean;
  }

  // Strictly allow verified base64 data:image URIs
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(clean)) {
    return clean;
  }

  // Parse absolute URLs using standard URL parser with strict safe protocol allowlist
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'blob:') {
      return parsed.toString();
    }
  } catch {}

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
