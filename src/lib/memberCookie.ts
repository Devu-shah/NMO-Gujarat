/**
 * Member ID Cookie Manager
 * Saves the authenticated member's Membership ID in a persistent client cookie.
 * Used to strictly verify and filter certificate retrieval so each member
 * only sees certificates matching their exact verified Membership ID.
 */

export const NMO_MEMBER_ID_COOKIE = 'nmo_member_id';

/**
 * Save membership ID in browser cookie
 */
export const setMemberIdCookie = (membershipNumber?: string | null): void => {
  if (typeof document === 'undefined') return;
  const clean = (membershipNumber || '').trim().toUpperCase();
  if (!clean) return;

  // Cookie valid for 365 days, accessible across entire portal
  document.cookie = `${NMO_MEMBER_ID_COOKIE}=${encodeURIComponent(clean)}; path=/; max-age=31536000; SameSite=Lax`;
};

/**
 * Retrieve membership ID from browser cookie
 */
export const getMemberIdCookie = (): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + NMO_MEMBER_ID_COOKIE + '=([^;]+)'));
  if (!match) return null;
  const val = decodeURIComponent(match[2]).trim().toUpperCase();
  return val || null;
};

/**
 * Clear membership ID cookie on sign out
 */
export const clearMemberIdCookie = (): void => {
  if (typeof document === 'undefined') return;
  document.cookie = `${NMO_MEMBER_ID_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
};

/**
 * Strips only the file extension from a filename.
 * e.g. "001.pdf" -> "001", "0012.pdf" -> "0012"
 */
export const getBaseFilename = (fileName: string): string => {
  if (!fileName || typeof fileName !== 'string') return '';
  const clean = fileName.trim();
  const lastDot = clean.lastIndexOf('.');
  return lastDot > 0 ? clean.substring(0, lastDot) : clean;
};

/**
 * Checks whether a filename strictly matches a membership ID.
 * - Membership IDs are strings to preserve leading zeros ("001" !== "1").
 * - Ignores only the file extension.
 * - Exact match: baseFilename === membershipId
 * - Or delimited prefix: baseFilename starts with `${membershipId}_` or `${membershipId}-`
 * - Strict check: "001" does NOT match "0012.pdf"
 */
export const isFilenameMatchingMembershipId = (
  fileName: string,
  membershipId: string
): boolean => {
  const targetId = String(membershipId || '').trim().toUpperCase();
  if (!targetId) return false;

  let base = getBaseFilename(fileName).trim().toUpperCase();
  if (base.startsWith('PENDING_')) {
    base = base.replace(/^PENDING_/, '');
  }

  if (base === targetId) return true;

  if (
    base.startsWith(`${targetId}_`) ||
    base.startsWith(`${targetId}-`) ||
    base.startsWith(`${targetId} `) ||
    base.startsWith(`${targetId}(`)
  ) {
    return true;
  }

  return false;
};

/**
 * Strict validator: Checks if a given certificate file or filename belongs to the member in the cookie
 */
export const isCertificateMatchingCookie = (
  cert: { membershipNumber?: string; name: string },
  cookieMemberId?: string | null
): boolean => {
  const targetId = (cookieMemberId || getMemberIdCookie() || '').trim().toUpperCase();
  if (!targetId) return false;

  const certMem = (cert.membershipNumber || '').trim().toUpperCase();
  if (certMem && certMem === targetId) return true;

  return isFilenameMatchingMembershipId(cert.name, targetId);
};
