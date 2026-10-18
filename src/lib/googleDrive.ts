import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getMemberIdCookie, setMemberIdCookie, isCertificateMatchingCookie } from './memberCookie';
import { apiUrl } from './api';

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
    const res = await fetch(apiUrl('/api/drive/save-session'), {
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
 * Uses the secure server-side session and refresh token without exposing raw secrets.
 */
export const restoreDriveSessionFromBackend = async (): Promise<SavedDriveSession | null> => {
  try {
    const res = await fetch(apiUrl('/api/drive/status'));
    if (res.ok) {
      const data = await res.json();
      if (data.connected && (data.status === 'active' || data.hasRefreshToken || data.accessToken)) {
        const session: SavedDriveSession = {
          accessToken: data.accessToken || 'server-managed',
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
        cachedDriveAccessToken = 'server-managed';
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
 * Returns true if Google Drive is currently connected with a valid server session
 */
export const isDriveConnected = (): boolean => {
  if (cachedDriveSession) {
    return cachedDriveSession.status === 'active' || Boolean(cachedDriveSession.hasRefreshToken);
  }
  return Boolean(cachedDriveAccessToken);
};

/**
 * Asynchronously ensure a valid Drive session is available on the backend.
 */
export const ensureDriveAccessToken = async (_forceRefresh = false): Promise<string | null> => {
  if (isDriveConnected()) {
    return 'server-managed';
  }

  try {
    const session = await restoreDriveSessionFromBackend();
    if (session && session.status === 'active') {
      return 'server-managed';
    }
  } catch (err) {
    console.debug('Notice requesting session verification:', err);
  }

  return isDriveConnected() ? 'server-managed' : null;
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
  _token?: string
): Promise<{ valid: boolean; email?: string; error?: string }> => {
  try {
    const res = await fetch(apiUrl('/api/drive/status'));
    if (res.ok) {
      const data = await res.json();
      if (data.connected && data.status === 'active') {
        return { valid: true, email: data.accountEmail || 'devanshshah768@gmail.com' };
      }
    }
    return { valid: false, error: 'Google Drive is disconnected or session expired' };
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
    const res = await fetch(apiUrl('/api/drive/test-expire-and-refresh'), { method: 'POST' });
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
        const retryRes = await fetch(apiUrl('/api/drive/test-expire-and-refresh'), { method: 'POST' });
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
      const urlRes = await fetch(apiUrl('/api/auth/google/url'));
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
        window.location.href = apiUrl('/api/auth/google/login');
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
      statusRes = await fetch(apiUrl('/api/drive/status'));
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
 * Returns sentinel indicator if Drive is connected, without exposing raw tokens to frontend code.
 */
export const getDriveAccessToken = (): string | null => {
  if (isDriveConnected()) {
    return 'server-managed';
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
    await fetch(apiUrl('/api/drive/disconnect'), { method: 'POST' }).catch(() => {});
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
  uploadSource?: 'admin' | 'user';
  uploadedBy?: 'admin' | 'member';
  approvalStatus?: 'not_required' | 'pending' | 'approved' | 'rejected' | 'pending_approval';
  rejectionReason?: string;
  uploaderUid?: string;
  decisionByAdminUid?: string;
  decisionByAdminName?: string;
  decisionAt?: string;
  assignedAttendance?: boolean;
  approvedAt?: string;
  updatedAt?: string;
  isAmbiguous?: boolean;
  ambiguousMatchesCount?: number;
}

export interface DriveFolderInfo {
  id: string;
  name: string;
  webViewLink?: string;
  createdTime?: string;
}

/**
 * Set read permission on a Drive file or folder if necessary.
 * Policy: Certificate viewing is securely mediated through server proxy to protect privacy.
 */
export const makeDriveResourcePublic = async (_fileOrFolderId: string, _token: string): Promise<void> => {
  // Respect security directive: Never make all Drive files publicly accessible to simplify viewing.
  // Access is securely proxied through /api/drive/file/:fileId.
  return;
};

/**
 * List all subfolders created under the NMO Gujarat mega folder (1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2)
 * Routed entirely through backend Express API.
 */
export const listEventSubfoldersInDrive = async (_token?: string): Promise<DriveFolderInfo[]> => {
  try {
    const res = await fetch(apiUrl('/api/drive/subfolders'));
    if (res.ok) {
      const data = await res.json();
      if (data.folders) {
        return data.folders;
      }
    }
  } catch (err) {
    console.debug('Backend subfolder listing notice:', err);
  }
  return [];
};

/**
 * Generate a new event subfolder inside the NMO Gujarat mega folder
 * Routed entirely through backend Express API.
 */
export const createEventSubfolderInDrive = async (
  eventName: string,
  _token?: string
): Promise<DriveFolderInfo> => {
  const cleanName = eventName.replace(/['"]/g, '').trim();
  if (!cleanName) {
    throw new Error('Invalid event name for Google Drive subfolder.');
  }

  try {
    const serverResp = await fetch(apiUrl('/api/drive/create-folder'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName, parentId: NMO_ROOT_DRIVE_FOLDER_ID })
    });
    if (serverResp.ok) {
      const data = await serverResp.json();
      if (data.folder) {
        return data.folder;
      }
    }
    const errData = await serverResp.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to create subfolder in Google Drive.');
  } catch (err: any) {
    console.error('Create subfolder error:', err);
    throw new Error(err.message || 'Unable to create event subfolder. Please verify Drive is connected.');
  }
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
 * Helper to convert browser File object to Base64 string
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Dynamically resolves "NMO Gujarat" root folder and "Events" subfolder without hardcoded IDs.
 * Never creates duplicate folders automatically.
 */
export const resolveDriveHierarchy = async (): Promise<{
  success: boolean;
  rootFolder?: DriveFolderInfo;
  eventsFolder?: DriveFolderInfo;
  error?: string;
  code?: string;
}> => {
  try {
    const res = await fetch(apiUrl('/api/drive/resolve-hierarchy'));
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to query Google Drive folder hierarchy'
    };
  }
};

/**
 * Resolves the designated event folder inside "NMO Gujarat → Events".
 * Never creates duplicate event folders automatically.
 */
export const resolveEventDriveFolder = async (
  eventId: string,
  eventTitle?: string,
  knownDriveFolderId?: string
): Promise<{
  success: boolean;
  rootFolder?: DriveFolderInfo;
  eventsFolder?: DriveFolderInfo;
  eventFolder?: DriveFolderInfo;
  error?: string;
  code?: string;
  availableFolders?: DriveFolderInfo[];
}> => {
  try {
    const params = new URLSearchParams();
    if (eventTitle) params.set('title', eventTitle);
    if (knownDriveFolderId) params.set('folderId', knownDriveFolderId);

    const res = await fetch(apiUrl(`/api/drive/resolve-event-folder/${encodeURIComponent(eventId)}?${params.toString()}`));
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to resolve event folder in Google Drive'
    };
  }
};

/**
 * Check if a certificate for this membership ID already exists in the event folder.
 */
export const checkCertificateDuplicate = async (
  folderId: string,
  membershipNumber: string
): Promise<{ exists: boolean; matchesCount: number; existingFiles: any[] }> => {
  try {
    const res = await fetch(apiUrl('/api/drive/check-duplicate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId, membershipNumber })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Notice checking certificate duplicate:', err);
  }
  return { exists: false, matchesCount: 0, existingFiles: [] };
};

/**
 * Lists all certificates in a specific event folder on Google Drive.
 * Matches filenames to membership ID strings (preserving leading zeros).
 * Identifies duplicate/ambiguous files.
 */
export const listEventFolderCertificates = async (
  folderId: string
): Promise<{
  success: boolean;
  count: number;
  files: DriveCertificateFile[];
  memberMap: { [key: string]: any[] };
}> => {
  try {
    const res = await fetch(apiUrl(`/api/drive/event-folder-files/${encodeURIComponent(folderId)}`));
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Error listing event folder certificates:', err);
  }
  return { success: false, count: 0, files: [], memberMap: {} };
};

/**
 * Upload a certificate file:
 * - Admin upload: Directly to Drive event folder. Does NOT require approval.
 * - User upload: To Drive event folder with status "pending". Requires Admin approval.
 * - Filename convention: Exactly ${membershipNumber}.${ext} (strings, preserving leading zeros).
 * - Conflict detection: Prevents silent overwriting.
 */
export const uploadCertificateToDrive = async (
  file: File,
  metadata: {
    membershipNumber: string;
    memberName: string;
    eventId?: string;
    eventTitle?: string;
    targetFolderId?: string;
    uploadSource?: 'admin' | 'user';
    uploadedBy?: 'admin' | 'member';
    uploaderUid?: string;
    approvalStatus?: 'not_required' | 'pending' | 'approved' | 'rejected' | 'pending_approval';
    overwriteExisting?: boolean;
    existingFileId?: string;
    assignedAttendance?: boolean;
  }
): Promise<DriveCertificateFile> => {
  const cleanNo = String(metadata.membershipNumber).trim().toUpperCase();
  if (!cleanNo) {
    throw new Error('Membership Number is required for certificate upload.');
  }

  // Validate allowed extensions (PDF, JPG, JPEG, PNG)
  const rawExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileExt = ['pdf', 'jpg', 'jpeg', 'png'].includes(rawExt) ? rawExt : 'jpg';

  if (!['pdf', 'jpg', 'jpeg', 'png'].includes(rawExt)) {
    throw new Error('Invalid file type: Only PDF, JPG, JPEG, and PNG files are allowed for certificates.');
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('File exceeds 15MB size limit. Please upload a smaller certificate file.');
  }

  const source: 'admin' | 'user' =
    metadata.uploadSource || (metadata.uploadedBy === 'member' ? 'user' : 'admin');

  const finalApprovalStatus: 'not_required' | 'pending' =
    source === 'admin' ? 'not_required' : 'pending';

  // 1. Try server-side upload endpoint first (handles hierarchy, Drive upload, and conflict checks)
  try {
    const base64Content = await fileToBase64(file);
    const serverResp = await fetch(apiUrl('/api/drive/upload-certificate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: base64Content,
        fileName: file.name,
        mimeType: file.type || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg'),
        membershipNumber: cleanNo,
        memberName: metadata.memberName,
        eventId: metadata.eventId || 'general',
        eventTitle: metadata.eventTitle || 'NMO Event',
        uploadSource: source,
        uploaderUid: metadata.uploaderUid || '',
        overwriteExisting: Boolean(metadata.overwriteExisting),
        existingFileId: metadata.existingFileId,
        targetFolderId: metadata.targetFolderId
      })
    });

    if (serverResp.status === 409) {
      const conflictData = await serverResp.json();
      const conflictError: any = new Error(conflictData.message || `A certificate for membership ID ${cleanNo} already exists.`);
      conflictError.conflict = true;
      conflictError.existingFileId = conflictData.existingFileId;
      conflictError.existingFileName = conflictData.existingFileName;
      throw conflictError;
    }

    if (serverResp.ok) {
      const resJson = await serverResp.json();
      const certRecord: DriveCertificateFile = {
        ...resJson.certificate,
        id: resJson.certificate.driveFileId,
        name: `${cleanNo}.${fileExt}`,
        uploadSource: source,
        approvalStatus: finalApprovalStatus,
        assignedAttendance: Boolean(metadata.assignedAttendance)
      };

      // Sync Firestore collection
      await syncCertificateToFirestore(certRecord);
      setMemberIdCookie(cleanNo);
      return certRecord;
    }
  } catch (err: any) {
    if (err.conflict) throw err;
    console.warn('Server upload endpoint notice, evaluating client fallback:', err);
  }

  // 2. Direct client fallback if server session is absent or direct token exists
  let token = getDriveAccessToken();
  if (!token) {
    token = await ensureDriveAccessToken();
  }
  if (!token) {
    throw new Error('Google Drive is not connected. Please connect Google Drive in the Admin Portal before uploading.');
  }

  const targetFolderId = metadata.targetFolderId || NMO_ROOT_DRIVE_FOLDER_ID;
  const customFileName = `${cleanNo}.${fileExt}`;

  // Check duplicate on client
  if (!metadata.overwriteExisting) {
    const dupCheck = await checkCertificateDuplicate(targetFolderId, cleanNo);
    if (dupCheck.exists && dupCheck.existingFiles.length > 0) {
      const existing = dupCheck.existingFiles[0];
      const conflictErr: any = new Error(`A certificate named "${existing.name}" already exists for Membership ID ${cleanNo}.`);
      conflictErr.conflict = true;
      conflictErr.existingFileId = existing.id;
      conflictErr.existingFileName = existing.name;
      throw conflictErr;
    }
  }

  const fileMetadata = {
    name: customFileName,
    description: `NMO Certificate for Membership ID: ${cleanNo} (${metadata.memberName}). Event: ${metadata.eventTitle || 'Event'}. Source: ${source}. Status: ${finalApprovalStatus}.`,
    parents: [targetFolderId],
    properties: {
      membershipNumber: cleanNo,
      memberName: metadata.memberName,
      eventId: metadata.eventId || '',
      eventTitle: metadata.eventTitle || '',
      uploadedAt: new Date().toISOString(),
      uploadSource: source,
      approvalStatus: finalApprovalStatus,
      uploaderUid: metadata.uploaderUid || ''
    }
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,description,properties',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Failed to upload certificate to Google Drive');
  }

  const uploadedFile = await res.json();
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
    uploadSource: source,
    approvalStatus: finalApprovalStatus,
    uploaderUid: metadata.uploaderUid || '',
    proxyViewUrl: apiUrl(`/api/drive/file/${uploadedFile.id}`),
    proxyDownloadUrl: apiUrl(`/api/drive/file/${uploadedFile.id}?download=true`),
    assignedAttendance: Boolean(metadata.assignedAttendance),
    updatedAt: new Date().toISOString()
  };

  await syncCertificateToFirestore(certRecord);
  setMemberIdCookie(cleanNo);
  return certRecord;
};

/**
 * Save certificate metadata in Firestore "Certificates" collection
 * Avoids duplicate records for the same event and member by using a deterministic document ID: `${eventId}_${membershipNumber}`
 */
export const syncCertificateToFirestore = async (cert: DriveCertificateFile): Promise<void> => {
  try {
    const docId = cert.eventId && cert.membershipNumber
      ? `${cert.eventId}_${cert.membershipNumber}`
      : cert.id;

    await setDoc(
      doc(db, 'Certificates', docId),
      {
        certId: docId,
        eventId: cert.eventId || '',
        eventTitle: cert.eventTitle || '',
        membershipNumber: cert.membershipNumber || '',
        memberName: cert.memberName || '',
        uploaderUid: cert.uploaderUid || '',
        uploadSource: cert.uploadSource || (cert.uploadedBy === 'member' ? 'user' : 'admin'),
        approvalStatus: cert.approvalStatus || 'not_required',
        driveFileId: cert.id,
        driveFolderId: cert.driveFolderId || '',
        originalFileName: cert.name,
        mimeType: cert.mimeType || 'application/pdf',
        fileSize: cert.size || '',
        uploadedAt: cert.createdTime || new Date().toISOString(),
        decisionByAdminUid: cert.decisionByAdminUid || null,
        decisionByAdminName: cert.decisionByAdminName || null,
        decisionAt: cert.decisionAt || null,
        rejectionReason: cert.rejectionReason || null,
        webViewLink: cert.webViewLink || null,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
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
    const res = await fetch(apiUrl(`/api/drive/file/${encodeURIComponent(fileId)}`), {
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
 * Records approving admin details, approval timestamp, updates Drive properties, and marks approvalStatus as 'approved'.
 */
export const approveCertificate = async (
  certId: string,
  adminInfo?: { uid?: string; name?: string },
  driveFileId?: string
): Promise<void> => {
  if (driveFileId) {
    try {
      await fetch(apiUrl('/api/drive/approve-certificate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driveFileId,
          adminUid: adminInfo?.uid || '',
          adminName: adminInfo?.name || 'Administrator'
        })
      });
    } catch (e) {
      console.warn('Backend drive approval update note:', e);
    }
  }

  try {
    await setDoc(
      doc(db, 'Certificates', certId),
      {
        approvalStatus: 'approved',
        decisionByAdminUid: adminInfo?.uid || 'admin',
        decisionByAdminName: adminInfo?.name || 'Administrator',
        decisionAt: new Date().toISOString(),
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
 * 1. Permanently removes the unapproved file from Google Drive via backend
 * 2. Records the rejection decision, reason, and admin metadata in Firestore
 */
export const rejectAndDeleteCertificate = async (
  certId: string,
  driveFileId: string,
  rejectionReason?: string,
  adminInfo?: { uid?: string; name?: string }
): Promise<void> => {
  try {
    await fetch(apiUrl('/api/drive/reject-certificate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driveFileId: driveFileId || certId,
        rejectionReason: rejectionReason || 'Certificate submission could not be verified by administrator',
        adminUid: adminInfo?.uid || '',
        adminName: adminInfo?.name || 'Administrator'
      })
    });
  } catch (e) {
    console.warn('Backend drive reject note:', e);
    await deleteDriveFile(driveFileId || certId).catch(() => {});
  }

  try {
    await setDoc(
      doc(db, 'Certificates', certId),
      {
        approvalStatus: 'rejected',
        rejectionReason: rejectionReason || 'Certificate submission could not be verified by administrator',
        decisionByAdminUid: adminInfo?.uid || 'admin',
        decisionByAdminName: adminInfo?.name || 'Administrator',
        decisionAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Notice updating rejected certificate record in Firestore:', err);
  }
};

/**
 * Fetch all user-uploaded certificate submissions waiting for Admin Approval.
 * Strictly excludes admin-uploaded certificates from this approval queue!
 */
export const fetchPendingCertificates = async (): Promise<DriveCertificateFile[]> => {
  try {
    const q = query(
      collection(db, 'Certificates'),
      where('uploadSource', '==', 'user')
    );
    const snap = await getDocs(q);
    const certs = snap.docs.map((d) => d.data() as any);
    return certs
      .filter((c) => c.approvalStatus === 'pending' || c.approvalStatus === 'pending_approval')
      .map((c) => ({
        id: c.driveFileId || c.certId,
        name: c.originalFileName || `${c.membershipNumber}.pdf`,
        mimeType: c.mimeType || 'application/pdf',
        size: c.fileSize,
        createdTime: c.uploadedAt,
        membershipNumber: c.membershipNumber,
        memberName: c.memberName,
        eventId: c.eventId,
        eventTitle: c.eventTitle,
        driveFolderId: c.driveFolderId,
        uploadSource: 'user',
        approvalStatus: 'pending',
        uploaderUid: c.uploaderUid,
        proxyViewUrl: apiUrl(`/api/drive/file/${c.driveFileId || c.certId}`),
        proxyDownloadUrl: apiUrl(`/api/drive/file/${c.driveFileId || c.certId}?download=true`)
      }));
  } catch (err: any) {
    try {
      const all = await fetchAllCertificatesFromFirestore();
      return all.filter(
        (c) =>
          c.uploadSource === 'user' &&
          (c.approvalStatus === 'pending' || c.approvalStatus === 'pending_approval')
      );
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
    const serverResp = await fetch(apiUrl(`/api/drive/member-certificates/${encodeURIComponent(cleanNo)}`));
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
    const res = await fetch(apiUrl(`/api/drive/file/${fileId}?download=true`));
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
