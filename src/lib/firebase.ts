import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

// Configure Firestore logging to error-only to suppress transient WebChannel transport reconnect warnings
try {
  setLogLevel('error');
} catch {
  // Ignore if unsupported in environment
}

// Initialize Firebase App instance safely
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Support both standard (default) Firestore and named database if provided
const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId;
const isCustomNamedDb = firestoreDbId && firestoreDbId !== '(default)' && firestoreDbId !== 'default';

// Initialize Firestore with experimentalAutoDetectLongPolling enabled to prevent WebChannel Listen stream drops
function setupFirestore() {
  try {
    return isCustomNamedDb
      ? initializeFirestore(
          app,
          { experimentalAutoDetectLongPolling: true },
          firestoreDbId
        )
      : initializeFirestore(app, {
          experimentalAutoDetectLongPolling: true
        });
  } catch {
    return isCustomNamedDb ? getFirestore(app, firestoreDbId) : getFirestore(app);
  }
}

export const db = setupFirestore();
export const auth = getAuth(app);
export const storage = getStorage(app);

// Export firebaseConfig for any other components
export { firebaseConfig };

// Error handling conforming to skill requirements
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test on boot
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration: client is offline");
    }
  }
}

// Run connection test non-blocking
testConnection();
