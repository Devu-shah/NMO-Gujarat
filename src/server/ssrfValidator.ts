import dns from 'dns';
import net from 'net';

export const TRUSTED_SMTP_HOSTS = new Set([
  'smtp.gmail.com',
  'smtp-relay.brevo.com',
  'smtp.sendgrid.net',
  'email-smtp.us-east-1.amazonaws.com',
  'email-smtp.us-east-2.amazonaws.com',
  'email-smtp.eu-west-1.amazonaws.com',
  'smtp.office365.com',
  'smtp.mailgun.org',
  'smtp.postmarkapp.com',
  'smtp.zoho.com',
  'smtp.zoho.in',
  'smtp.ethereal.email'
]);

export const ALLOWED_SMTP_PORTS = new Set([25, 465, 587, 2525]);

/**
 * Checks if an IPv4 address is in a private, loopback, link-local, or cloud-metadata subnet
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true;

  const [b0, b1] = parts;
  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 10.0.0.0/8 (RFC 1918 Private)
  if (b0 === 10) return true;
  // 172.16.0.0/12 (RFC 1918 Private)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.168.0.0/16 (RFC 1918 Private)
  if (b0 === 192 && b1 === 168) return true;
  // 169.254.0.0/16 (Link-local & Cloud metadata e.g. 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;
  // 0.0.0.0/8
  if (b0 === 0) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;
  // 224.0.0.0/4 (Multicast) or 240.0.0.0/4 (Reserved)
  if (b0 >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, link-local, or unique-local subnet
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;

  // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1 or ::ffff:169.254.169.254
  if (lower.startsWith('::ffff:')) {
    const ipv4 = lower.substring(7);
    if (net.isIPv4(ipv4)) {
      return isPrivateIPv4(ipv4);
    }
    return true;
  }
  // fe80::/10 (Link-local)
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true;
  }
  // fc00::/7 (Unique local)
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // Unknown or malformed IP treated as unsafe
}

/**
 * Validates target host and port against SSRF attacks.
 * Resolves DNS and guarantees no IP points to internal, private, loopback, or cloud-metadata endpoints.
 * Returns the resolved safe IP address to prevent DNS rebinding attacks.
 */
export async function validateHostForSSRF(
  host: string,
  port: number
): Promise<{ safe: boolean; resolvedIp?: string; error?: string }> {
  if (!host || typeof host !== 'string') {
    return { safe: false, error: 'Host is required.' };
  }

  const cleanHost = host.trim().toLowerCase();
  if (cleanHost.length > 255 || cleanHost.includes(' ') || cleanHost.includes('/') || cleanHost.includes('@')) {
    return { safe: false, error: 'Invalid hostname format.' };
  }

  if (!ALLOWED_SMTP_PORTS.has(port)) {
    return {
      safe: false,
      error: `Port ${port} is not permitted for SMTP testing. Permitted ports: 25, 465, 587, 2525.`
    };
  }

  // Explicit loopback, link-local, and cloud metadata string check
  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost === '127.0.0.1' ||
    cleanHost === '::1' ||
    cleanHost === '0.0.0.0' ||
    cleanHost.includes('169.254')
  ) {
    return {
      safe: false,
      error: 'Connections to loopback, link-local, and cloud metadata addresses are forbidden.'
    };
  }

  try {
    const records = await dns.promises.lookup(cleanHost, { all: true });
    if (!records || records.length === 0) {
      return { safe: false, error: `Could not resolve hostname ${cleanHost}.` };
    }

    for (const record of records) {
      if (isPrivateIp(record.address)) {
        return {
          safe: false,
          error: `Host ${cleanHost} resolved to private/restricted IP address (${record.address}). Connection blocked by SSRF policy.`
        };
      }
    }

    return { safe: true, resolvedIp: records[0].address };
  } catch (dnsErr: any) {
    return { safe: false, error: `DNS resolution failed for ${cleanHost}: ${dnsErr?.message || 'Host not found'}` };
  }
}

/**
 * Escapes HTML characters fully to prevent reflected XSS.
 * Includes &, <, >, ", ', and `
 */
export function escapeHtmlStrict(str?: string | null): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}
