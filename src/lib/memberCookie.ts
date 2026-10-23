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
  membershipId: string,
  fileProperties?: Record<string, any>
): boolean => {
  const targetId = String(membershipId || '').trim().toUpperCase();
  if (!targetId) return false;

  // Check file property if available
  if (fileProperties?.membershipNumber) {
    const propId = String(fileProperties.membershipNumber).trim().toUpperCase();
    if (propId === targetId) return true;
  }
  if (fileProperties?.membershipId) {
    const propId = String(fileProperties.membershipId).trim().toUpperCase();
    if (propId === targetId) return true;
  }

  let base = getBaseFilename(fileName).trim().toUpperCase();
  if (base.startsWith('PENDING_')) {
    base = base.replace(/^PENDING_/, '');
  }

  if (base === targetId) return true;

  // Delimited prefix formats (e.g. 9521_EVT, 9521-EVT, 9521 EVT, 9521(1))
  // Strict requirement: "9521" must NEVER match "95210_EVT" or "95210.jpg"
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
 * Extracts a membership ID from a filename by matching against known membership IDs
 * or detecting valid numeric / NMO- format prefixes with supported delimiters.
 * - Supports IDs of any length (including short numeric IDs like "9521").
 * - Preserves leading zeros (e.g. "001").
 * - Requires a valid delimiter ('_', '-', space, or '(') or an exact match.
 * - Prevents partial matches (e.g. "9521" does NOT match "95210_EVT-1.jpg").
 * - Preserves "NMO-" format support.
 */
export const extractMembershipIdFromFilename = (
  fileName: string,
  knownMembershipIds?: Set<string> | Map<string, any> | string[],
  fileProperties?: Record<string, any>
): string | null => {
  if (fileProperties?.membershipNumber) {
    const propId = String(fileProperties.membershipNumber).trim().toUpperCase();
    if (propId) return propId;
  }
  if (fileProperties?.membershipId) {
    const propId = String(fileProperties.membershipId).trim().toUpperCase();
    if (propId) return propId;
  }

  if (!fileName || typeof fileName !== 'string') return null;
  let base = getBaseFilename(fileName).trim().toUpperCase();
  if (base.startsWith('PENDING_')) {
    base = base.replace(/^PENDING_/, '').trim();
  }
  if (!base) return null;

  // 1. If known membership IDs from Users collection are provided:
  if (knownMembershipIds) {
    const hasId = (id: string) => {
      if (knownMembershipIds instanceof Set || knownMembershipIds instanceof Map) {
        return knownMembershipIds.has(id);
      }
      return (knownMembershipIds as string[]).includes(id);
    };

    // 1a. Exact match
    if (hasId(base)) {
      return base;
    }

    // 1b. Check if base matches any candidate prefix before delimiter
    // Format: numeric ID of ANY length (\d+) or NMO format (NMO-[A-Z0-9-]+)
    const delimMatch = base.match(/^(NMO-[A-Z0-9-]+|\d+)(?:[_ \-(]|$)/i);
    if (delimMatch && delimMatch[1]) {
      const candidate = delimMatch[1].toUpperCase();
      if (hasId(candidate)) {
        return candidate;
      }
    }

    // 1c. Scan known IDs (supporting arbitrary custom format IDs), sorted longest first
    const idList = knownMembershipIds instanceof Set || knownMembershipIds instanceof Map
      ? Array.from(knownMembershipIds.keys())
      : (knownMembershipIds as string[]);

    const sorted = [...idList].sort((a, b) => b.length - a.length);
    for (const rawId of sorted) {
      const id = String(rawId).trim().toUpperCase();
      if (!id) continue;
      if (isFilenameMatchingMembershipId(base, id)) {
        return id;
      }
    }
  }

  // 2. Pattern-based extraction when knownMembershipIds is not provided:
  // Must match either:
  // - NMO-[A-Z0-9-]+
  // - \d+ (any length, preserving leading zeros)
  // followed by delimiter [_ - (] or end of string
  const match = base.match(/^(NMO-[A-Z0-9-]+|\d+)(?:[_ \-(]|$)/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }

  return null;
};

/**
 * Strict validator: Checks if a given certificate file or filename belongs to the member in the cookie
 */
export const isCertificateMatchingCookie = (
  cert: { membershipNumber?: string; name: string; properties?: Record<string, any> },
  cookieMemberId?: string | null
): boolean => {
  const targetId = (cookieMemberId || getMemberIdCookie() || '').trim().toUpperCase();
  if (!targetId) return false;

  const certMem = (cert.membershipNumber || '').trim().toUpperCase();
  if (certMem && certMem === targetId) return true;

  return isFilenameMatchingMembershipId(cert.name, targetId, cert.properties);
};

