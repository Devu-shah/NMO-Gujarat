/**
 * Centralized API routing helper for NMO Gujarat
 *
 * Production Architecture:
 * - Frontend: https://nmo-gujarat.web.app (Firebase Hosting)
 * - Backend: https://nmo-gujarat.onrender.com (Render Express Server)
 *
 * When accessed from production Firebase Hosting, API requests route to Render.
 * In local dev (localhost) or AI Studio preview containers, it uses relative paths
 * or the explicitly defined VITE_API_URL environment variable.
 */

export const DEFAULT_PRODUCTION_BACKEND_URL = 'https://nmo-gujarat.onrender.com';

/**
 * Returns the base URL for Express backend API calls.
 */
export const getApiBaseUrl = (): string => {
  // If explicitly specified in Vite environment variables, use that
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  // Check current window context
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // Local dev or dev server container co-hosted on port 3000
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.run.app')) {
      return '';
    }
  }

  // Production default on Firebase Hosting (nmo-gujarat.web.app / nmo-gujarat.firebaseapp.com)
  return DEFAULT_PRODUCTION_BACKEND_URL;
};

/**
 * Constructs the full URL for an Express backend endpoint.
 *
 * Examples:
 *   apiUrl('/api/contact')
 *     -> In local dev: '/api/contact'
 *     -> On https://nmo-gujarat.web.app: 'https://nmo-gujarat.onrender.com/api/contact'
 */
export const apiUrl = (endpoint: string): string => {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!base) {
    return cleanEndpoint;
  }
  return `${base}${cleanEndpoint}`;
};

export default apiUrl;
