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
 * Strict validator: Checks if a given certificate file or filename belongs to the member in the cookie
 */
export const isCertificateMatchingCookie = (
  cert: { membershipNumber?: string; name: string },
  cookieMemberId?: string | null
): boolean => {
  const targetId = (cookieMemberId || getMemberIdCookie() || '').trim().toUpperCase();
  if (!targetId) return false;

  const certMem = (cert.membershipNumber || '').trim().toUpperCase();
  const certName = (cert.name || '').trim().toUpperCase();

  // Must match either exact membershipNumber property or filename containing the membership ID
  if (certMem === targetId) return true;
  if (certName.includes(targetId)) return true;

  return false;
};
