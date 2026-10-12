import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

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
 * Helper to restore drive session from Firestore database
 */
export const restoreDriveSessionFromFirestore = async (): Promise<SavedDriveSession | null> => {
  try {
    const snap = await getDoc(doc(db, 'Settings', 'googleDriveConfig'));
    if (snap.exists()) {
      const data = snap.data() as SavedDriveSession;
      if (data && data.accessToken && data.status !== 'disconnected') {
        saveDriveSessionLocally(data);
        cachedDriveSession = data;
        cachedDriveAccessToken = data.accessToken;
        return data;
      }
    }
  } catch (err) {
    console.warn('Notice restoring Google Drive session from Firestore:', err);
  }
  return null;
};

// Immediate in-memory initialization from persistent storage
let cachedDriveSession: SavedDriveSession | null = loadStoredDriveSession();
let cachedDriveAccessToken: string | null = cachedDriveSession?.accessToken || null;
let isSigningIn = false;

// Asynchronous background hydration from Firestore if local cache is not set
if (!cachedDriveAccessToken) {
  restoreDriveSessionFromFirestore().catch(() => {});
}

/**
 * Check if the current Drive token is valid by querying Google TokenInfo API
 */
export const checkDriveTokenHealth = async (
  token?: string
): Promise<{ valid: boolean; email?: string; error?: string }> => {
  const t = token || cachedDriveAccessToken || loadStoredDriveSession()?.accessToken;
  if (!t) return { valid: false, error: 'No token found' };
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(t)}`
    );
    if (res.ok) {
      const info = await res.json();
      return { valid: true, email: info.email };
    }
    return { valid: false, error: 'Token expired or invalid' };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Validation request failed' };
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
 * Connect to Google Drive via popup, saving the session persistently for future reuse
 */
export const connectGoogleDrive = async (): Promise<{
  user: User;
  accessToken: string;
  session: SavedDriveSession;
}> => {
  try {
    isSigningIn = true;
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
    await saveDriveSessionToFirestore(session);

    return { user: result.user, accessToken: cachedDriveAccessToken, session };
  } catch (err: any) {
    console.error('Google Drive connection error:', err);
    throw err;
  } finally {
    isSigningIn = false;
  }
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
 * Asynchronously ensure an access token is available, restoring from Firestore if needed
 */
export const ensureDriveAccessToken = async (): Promise<string | null> => {
  const current = getDriveAccessToken();
  if (current) return current;
  const restored = await restoreDriveSessionFromFirestore();
  return restored?.accessToken || null;
};

/**
 * Disconnect Google Drive and clear saved session
 */
export const disconnectGoogleDrive = async () => {
  cachedDriveAccessToken = null;
  cachedDriveSession = null;
  try {
    localStorage.removeItem(DRIVE_STORAGE_KEY);
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
  const authToken = token || getDriveAccessToken();
  if (!authToken) return [];

  try {
    const q = `'${NMO_ROOT_DRIVE_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,createdTime)&pageSize=100&orderBy=name`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    if (!res.ok) {
      console.warn('Failed to list subfolders from NMO Gujarat folder');
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
    console.warn('Error listing event subfolders:', err);
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
  const authToken = token || getDriveAccessToken();
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
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink,createdTime', {
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

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(err.error?.message || 'Failed to create subfolder in NMO Gujarat Google Drive');
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

  const fileMetadata = {
    name: customFileName,
    description: `NMO Certificate for Membership ID: ${cleanNo} (${metadata.memberName}). Event: ${metadata.eventTitle || 'General CME'}. Stored in NMO Gujarat Drive.`,
    parents: [targetFolderId],
    properties: {
      membershipNumber: cleanNo,
      memberName: metadata.memberName,
      eventId: metadata.eventId || '',
      eventTitle: metadata.eventTitle || '',
      uploadedAt: new Date().toISOString()
    }
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' })
  );
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,description,properties',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    }
  );

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.error?.message || 'Failed to upload certificate to Google Drive');
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
    updatedAt: new Date().toISOString()
  };

  // Sync to Firestore for instant user retrieval
  await syncCertificateToFirestore(certRecord);

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
  } catch (err) {
    console.warn('Error fetching all certificates from Firestore:', err);
    return [];
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

  const token = getDriveAccessToken();

  // If Drive token is available, query live Drive in NMO Gujarat folder & subfolders
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
              driveFolderId: f.parents?.[0] || NMO_ROOT_DRIVE_FOLDER_ID
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

  // Fallback / standard retrieval from indexed Firestore certificates (No user Drive login required!)
  const firestoreCerts = await fetchMemberCertificatesFromFirestore(cleanNo);
  return firestoreCerts;
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
  const token = getDriveAccessToken();

  // If token is present, fetch media stream with bearer token
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

  // Direct download link fallback (works for public files)
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
