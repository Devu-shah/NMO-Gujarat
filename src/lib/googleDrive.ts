import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getMemberIdCookie, setMemberIdCookie, isCertificateMatchingCookie } from './memberCookie';

/**
 * NMO Gujarat Central Google Drive Mega Folder Configuration
 * All events, subfolders, and certificates reside in or under this folder.
 */
export const NMO_ROOT_DRIVE_FOLDER_ID = '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2';
export const NMO_ROOT_DRIVE_FOLDER_NAME = 'NMO Gujarat';
export const NMO_ROOT_DRIVE_URL = `https://drive.google.com/drive/folders/${NMO_ROOT_DRIVE_FOLDER_ID}`;

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive'
];

export interface SavedDriveSession {
  accessToken: string;
  accountEmail: string;
  accountName: string;
  accountPhoto?: string;
  savedAt: string; // ISO date string
  expiresAt: number; // epoch ms
  folderId: string;
  folderName: string;
  folderUrl: string;
  status: 'active' | 'expired' | 'disconnected';
  hasRefreshToken?: boolean;
  refreshToken?: string;
  oauthConfigured?: boolean;
  redirectUri?: string;
}

const DRIVE_STORAGE_KEY = 'nmo_saved_google_drive_session_v1';

/**
 * Helper to safely read saved session from browser persistent storage
 */
export const loadStoredDriveSession = (): SavedDriveSession | null => {
  try {
    const raw = localStorage.getItem(DRIVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedDriveSession;
    if (parsed && parsed.accessToken) {
      return parsed;
    }
  } catch (err) {
    console.warn('Notice reading stored Google Drive session:', err);
  }
  return null;
};

/**
 * Helper to save drive session in browser persistent storage
 */
export const saveDriveSessionLocally = (session: SavedDriveSession) => {
  try {
    localStorage.setItem(DRIVE_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('Notice saving Google Drive session to localStorage:', err);
  }
};

/**
 * Save Drive session securely in the backend server.
 * This ensures the session persists across page reloads and multiple admin devices.
 */
export const saveDriveSessionToBackend = async (session: SavedDriveSession) => {
  try {
    const res = await fetch('/api/drive/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });
    if (!res.ok) {
      console.warn('Backend save-session returned non-200 status:', res.status);
    }
  } catch (err) {
    console.warn('Notice saving Google Drive session to backend:', err);
  }
};

/**
 * Helper to save drive session in Firestore so any future action can retrieve it
 */
export const saveDriveSessionToFirestore = async (session: SavedDriveSession) => {
  try {
    await setDoc(doc(db, 'Settings', 'googleDriveConfig'), {
      ...session,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Notice saving Google Drive session to Firestore:', err);
  }
};

/**
 * Restore persistent drive session from backend server.
 * If backend has a stored session or refresh token, this silently restores it and auto-refreshes expired access tokens.
 */
export const restoreDriveSessionFromBackend = async (): Promise<SavedDriveSession | null> => {
  try {
    const res = await fetch('/api/drive/status');
    if (res.ok) {
      const data = await res.json();
      if (data.connected && data.accessToken) {
        const session: SavedDriveSession = {
          accessToken: data.accessToken,
          accountEmail: data.accountEmail || 'devanshshah768@gmail.com',
          accountName: data.accountName || 'NMO Administrator',
          accountPhoto: data.accountPhoto,
          savedAt: new Date().toISOString(),
          expiresAt: data.expiresAt || Date.now() + 3600 * 1000,
          folderId: data.folderId || NMO_ROOT_DRIVE_FOLDER_ID,
          folderName: data.folderName || NMO_ROOT_DRIVE_FOLDER_NAME,
          folderUrl: data.folderUrl || NMO_ROOT_DRIVE_URL,
          status: 'active',
          hasRefreshToken: Boolean(data.hasRefreshToken),
          oauthConfigured: Boolean(data.oauthConfigured),
          redirectUri: data.redirectUri
        };
        cachedDriveSession = session;
        cachedDriveAccessToken = data.accessToken;
        saveDriveSessionLocally(session);
        return session;
      } else if (data.redirectUri || typeof data.oauthConfigured === 'boolean') {
        // Store configuration info even if disconnected
        if (cachedDriveSession) {
          cachedDriveSession.oauthConfigured = data.oauthConfigured;
          cachedDriveSession.redirectUri = data.redirectUri;
          cachedDriveSession.hasRefreshToken = data.hasRefreshToken;
        }
      }
    }
  } catch (err) {
    console.debug('Backend Drive session lookup note:', err);
  }
  return null;
};

/**
 * Helper to restore drive session from Firestore database as backup.
 * Gracefully handles missing document or unauthenticated access without throwing or logging noisy warnings.
 */
export const restoreDriveSessionFromFirestore = async (): Promise<SavedDriveSession | null> => {
  try {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'Settings', 'googleDriveConfig'));
    if (snap.exists()) {
      const data = snap.data() as SavedDriveSession;
      if (data && data.accessToken && data.status !== 'disconnected') {
        saveDriveSessionLocally(data);
        cachedDriveSession = data;
        cachedDriveAccessToken = data.accessToken;
        // Keep backend server in sync so endpoints like /api/drive/member-certificates have the active token
        saveDriveSessionToBackend(data).catch(() => {});
        return data;
      }
    }
    return null;
  } catch (err: any) {
    const code = err?.code;
    if (code === 'permission-denied' || code === 'not-found' || code === 'unavailable') {
      return null;
    }
    console.debug('Google Drive config not restored from Firestore:', err?.message || err);
    return null;
  }
};

// Immediate in-memory initialization from persistent storage
let cachedDriveSession: SavedDriveSession | null = loadStoredDriveSession();
let cachedDriveAccessToken: string | null = cachedDriveSession?.accessToken || null;
let isSigningIn = false;

// Asynchronous background hydration from backend on page reload
if (typeof window !== 'undefined') {
  restoreDriveSessionFromBackend().then((backendSession) => {
    if (!backendSession) {
      // Fallback: check Firestore if user authenticated
      onAuthStateChanged(auth, (user) => {
        if (user && !cachedDriveAccessToken) {
          restoreDriveSessionFromFirestore().catch(() => {});
        }
      });
    }
  }).catch(() => {});
}

/**
 * Asynchronously ensure a valid access token is available.
 * If expired, automatically requests token renewal from server-side refresh token flow.
 */
export const ensureDriveAccessToken = async (forceRefresh = false): Promise<string | null> => {
  // If not forcing refresh and current token has at least 2 minutes validity, reuse it
  if (!forceRefresh && cachedDriveAccessToken && cachedDriveSession) {
    const now = Date.now();
    if (cachedDriveSession.expiresAt > now + 120 * 1000) {
      return cachedDriveAccessToken;
    }
  }

  try {
    const url = `/api/drive/token${forceRefresh ? '?forceRefresh=true' : ''}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) {
        cachedDriveAccessToken = data.accessToken;
        if (cachedDriveSession) {
          cachedDriveSession.accessToken = data.accessToken;
          cachedDriveSession.expiresAt = data.expiresAt || Date.now() + 3600 * 1000;
          cachedDriveSession.status = 'active';
          saveDriveSessionLocally(cachedDriveSession);
        } else {
          await restoreDriveSessionFromBackend();
        }
        return data.accessToken;
      }
    } else if (res.status === 401) {
      const errJson = await res.json().catch(() => ({}));
      if (errJson.error === 'reauth_required') {
        if (cachedDriveSession) {
          cachedDriveSession.status = 'expired';
          saveDriveSessionLocally(cachedDriveSession);
        }
      }
    }
  } catch (err) {
    console.warn('Notice requesting token from backend:', err);
  }

  // Fallback to local memory / local storage
  const current = getDriveAccessToken();
  if (current) return current;

  const restored = await restoreDriveSessionFromBackend();
  if (restored?.accessToken) return restored.accessToken;

  const firestoreRestored = await restoreDriveSessionFromFirestore();
  return firestoreRestored?.accessToken || null;
};

/**
 * Wrapper for Google Drive REST API calls that automatically handles Bearer authorization
 * and automatically renews expired access tokens on 401 Unauthorized via the backend refresh token.
 */
export const authenticatedDriveFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  let token = await ensureDriveAccessToken();
  if (!token) {
    throw new Error('Google Drive is not connected. Please connect with Google Drive first.');
  }

  const buildHeaders = (authToken: string): Headers => {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${authToken}`);
    return headers;
  };

  let res = await fetch(url, {
    ...options,
    headers: buildHeaders(token)
  });

  // If token expired, auto-renew from server refresh token and retry request once
  if (res.status === 401) {
    console.log('[Google Drive API] Received 401 Unauthorized. Auto-renewing token from server...');
    const renewedToken = await ensureDriveAccessToken(true);
    if (renewedToken) {
      res = await fetch(url, {
        ...options,
        headers: buildHeaders(renewedToken)
      });
    }
  }

  return res;
};

/**
 * Check if the current Drive token is valid by querying Google TokenInfo API
 */
export const checkDriveTokenHealth = async (
  token?: string
): Promise<{ valid: boolean; email?: string; error?: string }> => {
  let t: string | null = token || getDriveAccessToken();
  if (!t) {
    t = await ensureDriveAccessToken();
  }
  if (!t) return { valid: false, error: 'No token found' };

  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(t)}`
    );
    if (res.ok) {
      const info = await res.json();
      return { valid: true, email: info.email };
    }

    // Try auto-refreshing via backend if initial token validation failed
    const refreshedToken = await ensureDriveAccessToken(true);
    if (refreshedToken && refreshedToken !== t) {
      const retryRes = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(refreshedToken)}`
      );
      if (retryRes.ok) {
        const info = await retryRes.json();
        return { valid: true, email: info.email };
      }
    }

    return { valid: false, error: 'Token expired or invalid' };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Validation request failed' };
  }
};

/**
 * Test server-side automatic token renewal across an expired access token.
 * Calls /api/drive/test-expire-and-refresh.
 */
export const testServerTokenRefresh = async (): Promise<{
  success: boolean;
  message: string;
  newExpiresInSeconds?: number;
}> => {
  try {
    const res = await fetch('/api/drive/test-expire-and-refresh', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      await ensureDriveAccessToken(true);
      return {
        success: true,
        message: data.message || 'Auto-refresh verified successfully!',
        newExpiresInSeconds: data.newExpiresInSeconds
      };
    }

    if (res.status === 404) {
      const stored = getSavedDriveAccount() || (await restoreDriveSessionFromFirestore());
      if (stored && stored.accessToken) {
        await saveDriveSessionToBackend(stored);
        const retryRes = await fetch('/api/drive/test-expire-and-refresh', { method: 'POST' });
        const retryData = await retryRes.json().catch(() => ({}));
        if (retryRes.ok && retryData.success) {
          await ensureDriveAccessToken(true);
          return {
            success: true,
            message: retryData.message || 'Auto-refresh verified successfully!',
            newExpiresInSeconds: retryData.newExpiresInSeconds
          };
        }
        return {
          success: false,
          message: retryData.message || retryData.error || 'Server session has no refresh token configured yet. Please use "Quick Connect via Token" in the Drive Setup Guide to store a permanent refresh token.'
        };
      }
      return {
        success: false,
        message: 'No Google Drive session is saved on the server yet. Please connect with Google Drive or enter tokens in "Drive Setup Guide > Quick Connect via Token" first.'
      };
    }

    return {
      success: false,
      message: data.message || data.error || 'Server-side refresh test failed.'
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Network error running refresh test' };
  }
};

/**
 * Get current saved Drive account metadata (email, folder, expiresAt, etc.)
 */
export const getSavedDriveAccount = (): SavedDriveSession | null => {
  if (cachedDriveSession) return cachedDriveSession;
  cachedDriveSession = loadStoredDriveSession();
  return cachedDriveSession;
};

// Create provider with Google Drive scope
export const createDriveProvider = (): GoogleAuthProvider => {
  const provider = new GoogleAuthProvider();
  GOOGLE_DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({
    prompt: 'consent',
    access_type: 'offline'
  });
  return provider;
};

// Initialize auth state listener
export const initDriveAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = getDriveAccessToken();
      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      // Do not wipe persistent Drive token unless explicitly disconnected
      if (!getDriveAccessToken()) {
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

/**
 * Connect to Google Drive using the secure server-side OAuth flow requesting offline access.
 * This obtains a long-lived Google OAuth refresh token that is stored securely on the server
 * and enables automatic, silent renewal of access tokens forever without re-prompts.
 */
export const connectGoogleDriveViaServerOAuth = async (): Promise<SavedDriveSession> => {
  return new Promise(async (resolve, reject) => {
    try {
      const urlRes = await fetch('/api/auth/google/url');
      if (!urlRes.ok) {
        const errJson = await urlRes.json().catch(() => ({}));
        throw new Error(errJson.message || 'Server Google OAuth 2.0 flow is not configured.');
      }
      const data = await urlRes.json();
      if (!data.url) {
        throw new Error('No authorization URL returned from server.');
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
      const popup = window.open(
        data.url,
        'google_drive_oauth_offline_popup',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,status=no`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // Popup was blocked by browser, redirect current window
        window.location.href = '/api/auth/google/login';
        return;
      }

      let finished = false;

      const handleMessage = async (event: MessageEvent) => {
        if (event.data?.type === 'GOOGLE_DRIVE_AUTH_SUCCESS') {
          finished = true;
          window.removeEventListener('message', handleMessage);
          const restored = await restoreDriveSessionFromBackend();
          if (restored) {
            resolve(restored);
          } else {
            const fallback: SavedDriveSession = {
              accessToken: '',
              accountEmail: event.data.email || 'admin@nmogujarat.org',
              accountName: 'NMO Administrator',
              savedAt: new Date().toISOString(),
              expiresAt: Date.now() + 3600 * 1000,
              folderId: NMO_ROOT_DRIVE_FOLDER_ID,
              folderName: NMO_ROOT_DRIVE_FOLDER_NAME,
              folderUrl: NMO_ROOT_DRIVE_URL,
              status: 'active',
              hasRefreshToken: true
            };
            cachedDriveSession = fallback;
            resolve(fallback);
          }
        } else if (event.data?.type === 'GOOGLE_DRIVE_AUTH_ERROR') {
          finished = true;
          window.removeEventListener('message', handleMessage);
          reject(new Error(event.data.error || 'Google Drive authorization was denied.'));
        }
      };

      window.addEventListener('message', handleMessage);

      // Watch for popup window close
      const pollTimer = setInterval(async () => {
        if (popup.closed) {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          if (!finished) {
            // Check if authorization completed immediately before popup closed
            const check = await restoreDriveSessionFromBackend();
            if (check && check.status === 'active') {
              resolve(check);
            } else {
              reject(new Error('Google Drive authorization window was closed before completion.'));
            }
          }
        }
      }, 1000);
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Connect to Google Drive via popup, saving the session persistently for future reuse
 */
export const connectGoogleDrive = async (): Promise<{
  user?: User;
  accessToken: string;
  session: SavedDriveSession;
}> => {
  try {
    isSigningIn = true;

    // Check if server OAuth is configured. If so, prefer the server-side offline flow to get a refresh token!
    let statusRes: Response | null = null;
    try {
      statusRes = await fetch('/api/drive/status');
    } catch (e) {}

    if (statusRes && statusRes.ok) {
      const statusData = await statusRes.json().catch(() => ({}));
      if (statusData.oauthConfigured) {
        console.log('[Google Drive] Initiating server-side offline OAuth flow...');
        const session = await connectGoogleDriveViaServerOAuth();
        return { accessToken: session.accessToken, session };
      }
    }

    // Fallback: Firebase Auth popup sign-in
    const provider = createDriveProvider();
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error(
        'Could not acquire Google Drive access token. Please ensure the popup was approved.'
      );
    }

    cachedDriveAccessToken = credential.accessToken;

    const session: SavedDriveSession = {
      accessToken: credential.accessToken,
      accountEmail: result.user.email || 'devanshshah768@gmail.com',
      accountName: result.user.displayName || 'Devansh Shah',
      accountPhoto: result.user.photoURL || undefined,
      savedAt: new Date().toISOString(),
      expiresAt: Date.now() + 3600 * 1000,
      folderId: NMO_ROOT_DRIVE_FOLDER_ID,
      folderName: NMO_ROOT_DRIVE_FOLDER_NAME,
      folderUrl: NMO_ROOT_DRIVE_URL,
      status: 'active'
    };

    cachedDriveSession = session;
    saveDriveSessionLocally(session);
    await saveDriveSessionToBackend(session);
    await saveDriveSessionToFirestore(session);

    return { user: result.user, accessToken: cachedDriveAccessToken, session };
  } catch (err: any) {
    console.error('Google Drive connection error:', err);
    if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized-domain')) {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'nmo-gujarat.web.app';
      const friendlyErr = new Error(
        `Firebase Authentication: Domain "${hostname}" is not authorized. Please add "${hostname}" to your Firebase Console under Authentication > Settings > Authorized domains.`
      );
      (friendlyErr as any).code = 'auth/unauthorized-domain';
      (friendlyErr as any).unauthorizedDomain = hostname;
      throw friendlyErr;
    }

    if (
      err?.code === 'auth/invalid-credential' ||
      err?.message?.includes('invalid-credential') ||
      err?.message?.includes('invalid_client') ||
      err?.message?.includes('client secret is invalid') ||
      err?.message?.includes('The provided client secret is invalid')
    ) {
      const friendlyErr = new Error(
        'Firebase: The provided client secret is invalid (auth/invalid-credential). In your Firebase Console under Authentication > Sign-in method > Google, the Web Client Secret does not match your Google Cloud Console OAuth credentials. Please update it in Firebase Console or configure server-side Direct OAuth.'
      );
      (friendlyErr as any).code = 'auth/invalid-credential';
      (friendlyErr as any).isInvalidClientSecret = true;
      (friendlyErr as any).rawError = err?.message || String(err);
      throw friendlyErr;
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Connect to Google Drive using a manual token (e.g. from Google OAuth Playground or manual generation)
 */
export const connectWithManualToken = async (
  accessToken: string,
  refreshToken?: string,
  customEmail?: string
): Promise<SavedDriveSession> => {
  let email = customEmail || 'admin@nmogujarat.org';
  let name = 'NMO Administrator';
  let photo: string | undefined;

  // Validate the access token by pinging Google userinfo endpoint
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.email) email = data.email;
      if (data.name) name = data.name;
      if (data.picture) photo = data.picture;
    }
  } catch (e) {
    console.debug('Userinfo lookup notice for manual token:', e);
  }

  const session: SavedDriveSession = {
    accessToken: accessToken.trim(),
    accountEmail: email,
    accountName: name,
    accountPhoto: photo,
    savedAt: new Date().toISOString(),
    expiresAt: Date.now() + 3600 * 1000,
    folderId: NMO_ROOT_DRIVE_FOLDER_ID,
    folderName: NMO_ROOT_DRIVE_FOLDER_NAME,
    folderUrl: NMO_ROOT_DRIVE_URL,
    status: 'active',
    hasRefreshToken: Boolean(refreshToken)
  };

  cachedDriveAccessToken = accessToken.trim();
  cachedDriveSession = session;
  saveDriveSessionLocally(session);
  await saveDriveSessionToBackend({
    ...session,
    refreshToken: refreshToken?.trim()
  });
  await saveDriveSessionToFirestore(session);

  return session;
};

/**
 * Return current access token from memory, local storage, or cached session
 */
export const getDriveAccessToken = (): string | null => {
  if (cachedDriveAccessToken) return cachedDriveAccessToken;
  const stored = loadStoredDriveSession();
  if (stored?.accessToken) {
    cachedDriveAccessToken = stored.accessToken;
    cachedDriveSession = stored;
    return stored.accessToken;
  }
  return null;
};

/**
 * Disconnect Google Drive and clear saved session
 */
export const disconnectGoogleDrive = async () => {
  cachedDriveAccessToken = null;
  cachedDriveSession = null;
  try {
    localStorage.removeItem(DRIVE_STORAGE_KEY);
    await fetch('/api/drive/disconnect', { method: 'POST' }).catch(() => {});
    await setDoc(
      doc(db, 'Settings', 'googleDriveConfig'),
      {
        status: 'disconnected',
        accessToken: null,
        disconnectedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (e) {
    console.warn('Disconnect notification notice:', e);
  }
};

export interface DriveCertificateFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  membershipNumber?: string;
  memberName?: string;
  eventId?: string;
  eventTitle?: string;
  driveFolderId?: string;
  driveFolderName?: string;
  description?: string;
  proxyViewUrl?: string;
  proxyDownloadUrl?: string;
  approvalStatus?: 'pending_approval' | 'approved' | 'rejected';
  uploadedBy?: 'admin' | 'member';
  assignedAttendance?: boolean;
  approvedAt?: string;
  updatedAt?: string;
}

export interface DriveFolderInfo {
  id: string;
  name: string;
  webViewLink?: string;
  createdTime?: string;
}

/**
 * Set public read permission on a Drive file or folder so anyone with the link can view/download
 */
export const makeDriveResourcePublic = async (fileOrFolderId: string, token: string): Promise<void> => {
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileOrFolderId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });
  } catch (err) {
    console.warn('Notice setting public permission:', err);
  }
};

/**
 * List all subfolders created under the NMO Gujarat mega folder (1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2)
 */
export const listEventSubfoldersInDrive = async (token?: string): Promise<DriveFolderInfo[]> => {
  let authToken = token || getDriveAccessToken();
  if (!authToken) {
    authToken = await ensureDriveAccessToken();
  }
  if (!authToken) return [];

  try {
    const q = `'${NMO_ROOT_DRIVE_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,createdTime)&pageSize=100&orderBy=name`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    if (!res.ok) {
      if (res.status === 401 && !token) {
        // Try one silent token refresh if not already explicitly passing token
        const fresh = await ensureDriveAccessToken(true);
        if (fresh && fresh !== authToken) {
          return listEventSubfoldersInDrive(fresh);
        }
      }
      return [];
    }

    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
      createdTime: f.createdTime
    }));
  } catch (err) {
    return [];
  }
};

/**
 * Generate a new event subfolder inside the NMO Gujarat mega folder
 */
export const createEventSubfolderInDrive = async (
  eventName: string,
  token?: string
): Promise<DriveFolderInfo> => {
  let authToken = token || getDriveAccessToken();
  if (!authToken) {
    throw new Error('Google Drive is not connected. Please connect with Google Drive first.');
  }

  const cleanName = eventName.replace(/['"]/g, '').trim();
  if (!cleanName) {
    throw new Error('Invalid event name for Google Drive subfolder.');
  }

  // Check if a subfolder with this name already exists in NMO Gujarat folder
  const existingSubfolders = await listEventSubfoldersInDrive(authToken);
  const existing = existingSubfolders.find((f) => f.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    return existing;
  }

  // Create new subfolder with parent set to NMO Gujarat mega folder
  let createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink,createdTime', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: cleanName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [NMO_ROOT_DRIVE_FOLDER_ID],
      description: `Certificates subfolder for "${cleanName}" in NMO Gujarat Mega Drive`
    })
  });

  // If 401 Unauthorized, attempt auto-refresh and retry once
  if (createRes.status === 401) {
    const refreshedToken = await ensureDriveAccessToken(true);
    if (refreshedToken) {
      authToken = refreshedToken;
      createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink,createdTime', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshedToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: cleanName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [NMO_ROOT_DRIVE_FOLDER_ID],
          description: `Certificates subfolder for "${cleanName}" in NMO Gujarat Mega Drive`
        })
      });
    }
  }

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    const rawMsg = err.error?.message || '';
    if (rawMsg.includes('invalid authentication credentials') || createRes.status === 401) {
      throw new Error(
        'Google Drive access token expired (401 Invalid Credentials). Please click "Authorize Google Drive" to reconnect, or configure a permanent refresh token in the Drive Setup Guide.'
      );
    }
    throw new Error(rawMsg || 'Failed to create subfolder in NMO Gujarat Google Drive');
  }

  const created = await createRes.json();

  // Make the folder accessible for reading
  await makeDriveResourcePublic(created.id, authToken);

  return {
    id: created.id,
    name: created.name,
    webViewLink: created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`,
    createdTime: created.createdTime
  };
};

/**
 * Generate a direct viewing URL for Google Drive images (JPG/PNG)
 */
export const getDriveDirectImageUrl = (fileId: string, thumbnailLink?: string): string => {
  if (thumbnailLink && thumbnailLink.includes('=s')) {
    return thumbnailLink.replace(/=s\d+.*$/, '=s1600');
  }
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
};

/**
 * Upload a certificate file directly to Google Drive (in either an event subfolder or the mega folder)
 */
export const uploadCertificateToDrive = async (
  file: File,
  metadata: {
    membershipNumber: string;
    memberName: string;
    eventId?: string;
    eventTitle?: string;
    targetFolderId?: string;
    uploadedBy?: 'admin' | 'member';
    approvalStatus?: 'pending_approval' | 'approved' | 'rejected';
    assignedAttendance?: boolean;
  }
): Promise<DriveCertificateFile> => {
  let token = getDriveAccessToken();
  if (!token) {
    token = await ensureDriveAccessToken();
  }
  if (!token) {
    throw new Error('Please connect or initialize the NMO Google Drive account before uploading.');
  }

  // Ensure target folder is either the designated event subfolder or the NMO Gujarat mega folder
  const targetFolderId = metadata.targetFolderId && metadata.targetFolderId.trim()
    ? metadata.targetFolderId.trim()
    : NMO_ROOT_DRIVE_FOLDER_ID;

  const cleanNo = metadata.membershipNumber.trim().toUpperCase();
  const rawExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileExt = ['jpg', 'jpeg', 'png', 'pdf'].includes(rawExt) ? rawExt : 'jpg';

  // Save certificate using member's Membership ID only as requested
  const customFileName = `${cleanNo}.${fileExt}`;

  const uploadedBy = metadata.uploadedBy || 'admin';
  const approvalStatus =
    metadata.approvalStatus || (uploadedBy === 'member' ? 'pending_approval' : 'approved');

  const fileMetadata = {
    name: customFileName,
    description: `NMO Certificate for Membership ID: ${cleanNo} (${metadata.memberName}). Event: ${metadata.eventTitle || 'General CME'}. Status: ${approvalStatus}. Stored in NMO Gujarat Drive.`,
    parents: [targetFolderId],
    properties: {
      membershipNumber: cleanNo,
      memberName: metadata.memberName,
      eventId: metadata.eventId || '',
      eventTitle: metadata.eventTitle || '',
      uploadedAt: new Date().toISOString(),
      uploadedBy,
      approvalStatus
    }
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' })
  );
  form.append('file', file);

  let res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,description,properties',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    }
  );

  // If token expired, auto-renew from backend refresh token and retry upload once
  if (res.status === 401) {
    console.log('[Drive Upload] Token expired (401). Automatically refreshing via backend and retrying upload...');
    const renewedToken = await ensureDriveAccessToken(true);
    if (renewedToken) {
      token = renewedToken;
      res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,description,properties',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${renewedToken}`
          },
          body: form
        }
      );
    }
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const rawMsg = errData.error?.message || '';
    if (rawMsg.includes('invalid authentication credentials') || res.status === 401) {
      throw new Error(
        'Google Drive access token expired (401 Invalid Credentials). Please click "Authorize Google Drive" to reconnect, or configure a permanent refresh token in the Drive Setup Guide.'
      );
    }
    throw new Error(rawMsg || 'Failed to upload certificate to Google Drive');
  }

  const uploadedFile = await res.json();

  // Make the file publicly accessible so end-users can download directly without login
  await makeDriveResourcePublic(uploadedFile.id, token);

  const certRecord: DriveCertificateFile = {
    id: uploadedFile.id,
    name: uploadedFile.name,
    mimeType: uploadedFile.mimeType,
    size: uploadedFile.size ? `${(Number(uploadedFile.size) / (1024 * 1024)).toFixed(2)} MB` : undefined,
    createdTime: uploadedFile.createdTime || new Date().toISOString(),
    webViewLink: uploadedFile.webViewLink,
    webContentLink: uploadedFile.webContentLink || `https://drive.google.com/uc?id=${uploadedFile.id}&export=download`,
    thumbnailLink: uploadedFile.thumbnailLink,
    description: uploadedFile.description,
    membershipNumber: cleanNo,
    memberName: metadata.memberName,
    eventId: metadata.eventId,
    eventTitle: metadata.eventTitle,
    driveFolderId: targetFolderId,
    approvalStatus,
    uploadedBy,
    assignedAttendance: Boolean(metadata.assignedAttendance),
    updatedAt: new Date().toISOString()
  };

  // Sync to Firestore for instant user retrieval
  await syncCertificateToFirestore(certRecord);

  // Sync cookie
  setMemberIdCookie(cleanNo);

  return certRecord;
};

/**
 * Save certificate metadata in Firestore "Certificates" collection
 */
export const syncCertificateToFirestore = async (cert: DriveCertificateFile): Promise<void> => {
  try {
    await setDoc(doc(db, 'Certificates', cert.id), {
      ...cert,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Notice saving certificate to Firestore:', err);
  }
};

/**
 * Fetch member certificates from Firestore index
 */
export const fetchMemberCertificatesFromFirestore = async (
  membershipNumber: string
): Promise<DriveCertificateFile[]> => {
  const cleanNo = membershipNumber.trim().toUpperCase();
  if (!cleanNo) return [];

  try {
    const q = query(collection(db, 'Certificates'), where('membershipNumber', '==', cleanNo));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as DriveCertificateFile);
  } catch (err) {
    console.warn('Error fetching certificates from Firestore:', err);
    return [];
  }
};

/**
 * Fetch all certificates from Firestore index
 */
export const fetchAllCertificatesFromFirestore = async (): Promise<DriveCertificateFile[]> => {
  try {
    const snapshot = await getDocs(collection(db, 'Certificates'));
    return snapshot.docs.map((d) => d.data() as DriveCertificateFile);
  } catch (err: any) {
    if (err?.code !== 'permission-denied' && err?.code !== 'unavailable') {
      console.debug('Certificates lookup notice from Firestore:', err?.message || err);
    }
    return [];
  }
};

/**
 * Delete a file from Google Drive (e.g., when an admin rejects a member submission)
 */
export const deleteDriveFile = async (fileId: string): Promise<boolean> => {
  if (!fileId) return false;

  // 1. Try server delete endpoint
  try {
    const res = await fetch(`/api/drive/file/${encodeURIComponent(fileId)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      return true;
    }
  } catch (err) {
    console.warn('Server delete call notice:', err);
  }

  // 2. Client fallback with live Bearer token
  const token = getDriveAccessToken() || (await ensureDriveAccessToken());
  if (token) {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok || res.status === 404) {
        return true;
      }
    } catch (e) {
      console.warn('Client direct drive delete notice:', e);
    }
  }

  return false;
};

/**
 * Admin approves a certificate submission:
 * Marks approvalStatus as 'approved' in Firestore and optionally Drive properties.
 */
export const approveCertificate = async (certId: string): Promise<void> => {
  try {
    await setDoc(
      doc(db, 'Certificates', certId),
      {
        approvalStatus: 'approved',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (err) {
    console.error('Error approving certificate in Firestore:', err);
    throw err;
  }
};

/**
 * Admin rejects a certificate submission:
 * 1. Deletes the physical file from Google Drive
 * 2. Deletes the certificate document from Firestore
 */
export const rejectAndDeleteCertificate = async (
  certId: string,
  driveFileId: string
): Promise<void> => {
  // 1. Permanently delete from Google Drive
  await deleteDriveFile(driveFileId || certId).catch((e) => {
    console.warn('Notice deleting rejected file from Drive:', e);
  });

  // 2. Remove record from Firestore
  try {
    await deleteDoc(doc(db, 'Certificates', certId));
  } catch (err) {
    console.warn('Notice removing certificate record from Firestore:', err);
  }
};

/**
 * Fetch all certificate uploads waiting for Admin Approval
 */
export const fetchPendingCertificates = async (): Promise<DriveCertificateFile[]> => {
  try {
    const q = query(
      collection(db, 'Certificates'),
      where('approvalStatus', '==', 'pending_approval')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as DriveCertificateFile);
  } catch (err: any) {
    // If composite query fails or field unindexed, fallback to memory filter
    try {
      const all = await fetchAllCertificatesFromFirestore();
      return all.filter((c) => c.approvalStatus === 'pending_approval');
    } catch {
      return [];
    }
  }
};

/**
 * Search Google Drive exclusively within the NMO Gujarat Mega Folder and its subfolders
 * for certificates matched with the member's Membership ID
 */
export const fetchCertificatesByMembershipNumber = async (
  membershipNumber: string,
  specificFolderId?: string
): Promise<DriveCertificateFile[]> => {
  const cleanNo = membershipNumber.trim().toUpperCase();
  if (!cleanNo) return [];

  // Save the verified membership ID in cookie for strict isolation
  setMemberIdCookie(cleanNo);

  // 1. Try server-side Google Drive integration first
  // The server has the active Google Drive connection and searches Drive for files
  // where the file name contains the participant's membership ID.
  try {
    const serverResp = await fetch(`/api/drive/member-certificates/${encodeURIComponent(cleanNo)}`);
    if (serverResp.ok) {
      const serverData = await serverResp.json();
      if (serverData.certificates && Array.isArray(serverData.certificates) && serverData.certificates.length > 0) {
        // Enforce strict filtering: Only certificates matching this participant's membership ID via cookie validator
        const strictlyFiltered: DriveCertificateFile[] = serverData.certificates.filter((c: any) => {
          return isCertificateMatchingCookie(c, cleanNo);
        });

        if (strictlyFiltered.length > 0) {
          // Asynchronously cache into Firestore for offline/quick reference
          strictlyFiltered.forEach((cert) => {
            syncCertificateToFirestore(cert).catch(() => {});
          });
          return strictlyFiltered;
        }
      }
    }
  } catch (err) {
    console.warn('Notice querying server Drive certificates API:', err);
  }

  const token = getDriveAccessToken();

  // 2. If client Drive token is available, query live Drive directly
  if (token) {
    try {
      // Get all subfolders of NMO Gujarat folder
      const subfolders = await listEventSubfoldersInDrive(token);
      const allowedParentIds = new Set<string>([
        NMO_ROOT_DRIVE_FOLDER_ID,
        ...subfolders.map((s) => s.id)
      ]);

      let q = `trashed = false and (name contains '${cleanNo}' or fullText contains '${cleanNo}') and mimeType != 'application/vnd.google-apps.folder'`;
      if (specificFolderId && specificFolderId.trim()) {
        q += ` and '${specificFolderId.trim()}' in parents`;
      }

      const fields = 'files(id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,description,properties,parents)';
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const driveResults: DriveCertificateFile[] = (data.files || [])
          // Enforce that retrieved files are from NMO Gujarat folder or its subfolders ONLY
          .filter((f: any) => {
            if (specificFolderId) return true;
            return f.parents && f.parents.some((p: string) => allowedParentIds.has(p));
          })
          // Strict filter: Match exact membership ID in name or properties and cookie
          .filter((f: any) => {
            return isCertificateMatchingCookie(
              {
                membershipNumber: f.properties?.membershipNumber || cleanNo,
                name: f.name
              },
              cleanNo
            );
          })
          .map((f: any) => {
            const cert: DriveCertificateFile = {
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size ? `${(Number(f.size) / (1024 * 1024)).toFixed(2)} MB` : undefined,
              createdTime: f.createdTime,
              webViewLink: f.webViewLink,
              webContentLink: f.webContentLink || `https://drive.google.com/uc?id=${f.id}&export=download`,
              thumbnailLink: f.thumbnailLink,
              description: f.description,
              membershipNumber: f.properties?.membershipNumber || cleanNo,
              memberName: f.properties?.memberName,
              eventId: f.properties?.eventId,
              eventTitle: f.properties?.eventTitle,
              driveFolderId: f.parents?.[0] || NMO_ROOT_DRIVE_FOLDER_ID,
              approvalStatus: f.properties?.approvalStatus || 'approved',
              uploadedBy: f.properties?.uploadedBy || 'admin'
            };
            // Async sync to Firestore
            syncCertificateToFirestore(cert).catch(() => {});
            return cert;
          });

        if (driveResults.length > 0) {
          return driveResults;
        }
      }
    } catch (err) {
      console.warn('Live Drive search failed, falling back to Firestore index:', err);
    }
  }

  // 3. Fallback / standard retrieval from indexed Firestore certificates (No user Drive login required!)
  const firestoreCerts = await fetchMemberCertificatesFromFirestore(cleanNo);
  // Ensure strict filtering using cookie validator and remove rejected items
  return firestoreCerts.filter((c) => {
    if (c.approvalStatus === 'rejected') return false;
    return isCertificateMatchingCookie(c, cleanNo);
  });
};

/**
 * List all certificates from the NMO Gujarat mega folder and its event subfolders
 */
export const listCertificatesInFolder = async (
  folderId?: string
): Promise<DriveCertificateFile[]> => {
  const token = getDriveAccessToken();

  if (token) {
    try {
      const targetFolder = folderId && folderId.trim() ? folderId.trim() : NMO_ROOT_DRIVE_FOLDER_ID;
      
      // If root folder, gather files from root and subfolders
      const subfolders = await listEventSubfoldersInDrive(token);
      const subfolderMap = new Map<string, string>();
      subfolders.forEach((s) => subfolderMap.set(s.id, s.name));
      subfolderMap.set(NMO_ROOT_DRIVE_FOLDER_ID, NMO_ROOT_DRIVE_FOLDER_NAME);

      const targetParents = folderId && folderId.trim()
        ? [folderId.trim()]
        : [NMO_ROOT_DRIVE_FOLDER_ID, ...subfolders.map((s) => s.id)];

      const allFiles: DriveCertificateFile[] = [];

      // Query files for the target parents
      for (const parentId of targetParents) {
        const q = `'${parentId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
        const fields = 'files(id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,description,properties,parents)';
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=100`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          const items = (data.files || []).map((f: any) => {
            let extractedMemNo = f.properties?.membershipNumber;
            if (!extractedMemNo) {
              const match = f.name.match(/([0-9]{8,14}|NMO-[A-Z0-9-]+)/i);
              if (match) extractedMemNo = match[1].toUpperCase();
            }

            const cert: DriveCertificateFile = {
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size ? `${(Number(f.size) / (1024 * 1024)).toFixed(2)} MB` : undefined,
              createdTime: f.createdTime,
              webViewLink: f.webViewLink,
              webContentLink: f.webContentLink || `https://drive.google.com/uc?id=${f.id}&export=download`,
              thumbnailLink: f.thumbnailLink,
              description: f.description,
              membershipNumber: extractedMemNo,
              memberName: f.properties?.memberName,
              eventId: f.properties?.eventId,
              eventTitle: f.properties?.eventTitle,
              driveFolderId: parentId,
              driveFolderName: subfolderMap.get(parentId)
            };

            // Sync to Firestore cache
            syncCertificateToFirestore(cert).catch(() => {});
            return cert;
          });
          allFiles.push(...items);
        }
      }

      if (allFiles.length > 0) {
        return allFiles;
      }
    } catch (err) {
      console.warn('Error reading from live Drive, returning Firestore certificates:', err);
    }
  }

  // Fallback to Firestore index
  return fetchAllCertificatesFromFirestore();
};

/**
 * Download a certificate file directly from Google Drive or browser stream
 */
export const downloadDriveCertificate = async (fileId: string, filename: string): Promise<void> => {
  // 1. Try server streaming proxy endpoint first
  try {
    const res = await fetch(`/api/drive/file/${fileId}?download=true`);
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `Certificate_${fileId}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      return;
    }
  } catch (err) {
    console.warn('Server proxy download failed, trying client direct:', err);
  }

  const token = getDriveAccessToken();

  // 2. If token is present, fetch media stream with bearer token
  if (token) {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        return;
      }
    } catch (err) {
      console.warn('Bearer download failed, opening direct link:', err);
    }
  }

  // 3. Direct download link fallback (works for public files)
  const downloadUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
  window.open(downloadUrl, '_blank');
};

/**
 * Delete certificate entry from Firestore
 */
export const deleteCertificateFromFirestore = async (certId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'Certificates', certId));
  } catch (err) {
    console.warn('Error deleting certificate from Firestore:', err);
  }
};
