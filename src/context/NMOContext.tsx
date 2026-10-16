import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  NMOUserRecord,
  NMOEvent,
  EventParticipant,
  UserRole,
  PrantType,
  ApprovalStatus,
  AttendanceStatus,
  NMOImportLog,
  NMOAuditLog
} from '../types/nmo';
import { auth, db } from '../lib/firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  updatePassword,
  User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import {
  createEventSubfolderInDrive,
  getDriveAccessToken
} from '../lib/googleDrive';
import { setMemberIdCookie, clearMemberIdCookie } from '../lib/memberCookie';

interface NMOContextType {
  // Auth state
  firebaseUser: FirebaseUser | null;
  currentUser: NMOUserRecord | null;
  currentMember: NMOUserRecord | null; // Compatibility alias
  isLoadingAuth: boolean;
  activeRole: UserRole;
  activePrant: PrantType;

  // Unified login & auth
  loginWithEmail: (email: string, pass: string) => Promise<UserRole>;
  registerWithEmail: (
    email: string,
    pass: string,
    membershipNo: string,
    name: string,
    prant: 'Gujarat' | 'Saurashtra'
  ) => Promise<UserRole>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changeUserPassword: (newPassword: string) => Promise<void>;
  switchDemoRole: (role: UserRole, prant?: PrantType) => void;
  linkMembershipNumber: (membershipNumber: string) => Promise<boolean>;

  // Top-Level Collection 1: "Users"
  users: NMOUserRecord[];
  setUsers: React.Dispatch<React.SetStateAction<NMOUserRecord[]>>;
  members: NMOUserRecord[]; // Compatibility alias
  getUserByMembershipNumber: (membershipNumber: string) => NMOUserRecord | undefined;
  getMemberByNumber: (membershipNumber: string) => NMOUserRecord | undefined; // Alias
  addUser: (user: NMOUserRecord) => Promise<void>;
  addMember: (member: NMOUserRecord) => Promise<void>; // Alias
  updateUser: (user: NMOUserRecord) => Promise<void>;
  updateMember: (member: NMOUserRecord) => Promise<void>; // Alias
  deleteUser: (membershipNumber: string) => Promise<void>;
  deleteMember: (membershipNumber: string) => Promise<void>; // Alias
  clearNonAdminUsers: () => Promise<{ deletedCount: number; preservedCount: number; success: boolean; error?: string }>;
  clearAllMembers: () => Promise<{ deletedCount: number; preservedCount: number; success: boolean; error?: string }>;
  deleteMultipleUsers: (membershipNumbers: string[]) => Promise<number>;
  updateUserRole: (membershipNumber: string, newRole: UserRole, newPrant?: PrantType) => Promise<void>;
  batchImportUsers: (
    newUsers: NMOUserRecord[],
    filename: string,
    options?: {
      mode?: 'add_update' | 'replace_sync' | 'validate_only';
      onProgress?: (processed: number, total: number) => void;
      unchangedCount?: number;
      invalidCount?: number;
      duplicateCount?: number;
      missingUsers?: NMOUserRecord[];
    }
  ) => Promise<{ added: number; updated: number; duplicates: number; deactivated: number; success: boolean; error?: string }>;
  batchImportMembers: (
    newUsers: NMOUserRecord[],
    filename: string,
    options?: any
  ) => Promise<{ added: number; updated: number; duplicates: number }>; // Alias
  syncReplaceUsers: (
    newUsers: NMOUserRecord[],
    filename: string,
    options?: {
      onProgress?: (processed: number, total: number) => void;
      missingUsers?: NMOUserRecord[];
    }
  ) => Promise<{ added: number; updated: number; deactivated: number; success: boolean; error?: string }>;
  replaceMembersDataset: (
    newUsers: NMOUserRecord[],
    filename: string,
    options?: any
  ) => Promise<{ added: number; updated: number; deactivated: number }>; // Alias
  createUsersBackup: () => { jsonContent: string; filename: string };

  // Top-Level Collection 2: "Events" (with embedded participants[])
  events: NMOEvent[];
  eventRegistrations: any[]; // Computed compatibility view
  addEvent: (eventData: Omit<NMOEvent, 'eventId' | 'createdAt' | 'updatedAt' | 'participants'>) => Promise<string>;
  updateEvent: (event: NMOEvent) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  createEventDriveSubfolder: (eventId: string, eventTitle: string) => Promise<{ id: string; name: string; webViewLink?: string } | null>;
  toggleEventDynamicField: (eventId: string, isDynamic: boolean, fieldName?: string, fieldType?: string) => Promise<void>;

  // Participant Registration & Workflow (State Committee Review -> Approve/Reject -> Attendance)
  registerForEvent: (eventId: string, membershipNumber: string, memberName: string) => Promise<void>;
  cancelEventRegistration: (eventId: string, membershipNumber: string) => Promise<void>;
  deleteParticipantFromEvent: (eventId: string, membershipNumber: string) => Promise<void>;
  updateParticipantApproval: (
    eventId: string,
    membershipNumber: string,
    approvalStatus: ApprovalStatus
  ) => Promise<void>;
  updateRegistrationStatus: (registrationId: string, status: any) => Promise<void>; // Alias
  updateParticipantAttendance: (
    eventId: string,
    membershipNumber: string,
    attendanceStatus: AttendanceStatus
  ) => Promise<void>;
  updateAttendanceStatus: (registrationId: string, status: any) => Promise<void>; // Alias
  getEventParticipants: (eventId: string) => EventParticipant[];
  getMemberRegistrations: (membershipNumber: string) => any[];

  // Announcements & Tickers (Client State synced with announcements)
  announcements: any[];
  addAnnouncement: (announcement: any) => Promise<void>;
  toggleAnnouncement: (id: string, active: boolean) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;

  // Audit Logs & Export helpers
  importLogs: NMOImportLog[];
  auditLogs: NMOAuditLog[];
  logAudit: (action: string, targetType: string, targetId: string, details: string) => Promise<void>;
  exportUsersToCSV: (filterPrant?: PrantType, selectedOnly?: string[]) => void;
  exportEventParticipantsToCSV: (eventId: string) => void;

  // Cities list from Database
  cities: string[];
  addCityToDatabase: (cityName: string) => Promise<void>;

  // Local caching & manual database sync
  refreshFromDatabase: (force?: boolean) => Promise<{ usersCount: number; eventsCount: number; registrationsCount: number }>;
  isSyncing: boolean;
  lastSyncTime: string | null;
  addEventRSVPManually: (eventId: string, participantData: Partial<EventParticipant>) => Promise<void>;
}

const NMOContext = createContext<NMOContextType | undefined>(undefined);

export const LOCAL_STORAGE_USERS_KEY = 'nmo_firestore_users_v2';
export const LOCAL_STORAGE_EVENTS_KEY = 'nmo_firestore_events_v2';
export const LOCAL_STORAGE_IMPORTS_KEY = 'nmo_firestore_imports_v2';
export const LOCAL_STORAGE_AUDIT_KEY = 'nmo_firestore_audit_v2';
export const LOCAL_STORAGE_SYNC_TIME_KEY = 'nmo_firestore_last_sync_v2';
export const LOCAL_STORAGE_CITIES_KEY = 'nmo_firestore_cities_v2';

export const DEFAULT_GUJARAT_CITIES: string[] = [
  'Ahmedabad',
  'Amreli',
  'Anand',
  'Aravalli (Modasa)',
  'Banaskantha (Palanpur)',
  'Bharuch',
  'Bhavnagar',
  'Botad',
  'Chhota Udaipur',
  'Dahod',
  'Dang (Ahwa)',
  'Devbhumi Dwarka',
  'Gandhinagar',
  'Gir Somnath (Veraval)',
  'Jamnagar',
  'Junagadh',
  'Kheda (Nadiad)',
  'Kutch (Bhuj)',
  'Mahisagar (Lunawada)',
  'Mehsana',
  'Morbi',
  'Narmada (Rajpipla)',
  'Navsari',
  'Panchmahal (Godhra)',
  'Patan',
  'Porbandar',
  'Rajkot',
  'Sabarkantha (Himatnagar)',
  'Surat',
  'Surendranagar',
  'Tapi (Vyara)',
  'Vadodara',
  'Valsad',
  'Vapi'
];

// Deep sanitization helper guaranteeing Firestore never rejects unsupported undefined values
export const cleanDocForFirestore = (obj: Record<string, any>): Record<string, any> => {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || k === 'undefined') {
      continue;
    }
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (k === 'uid' && trimmed === '') continue;
      clean[k] = trimmed;
    } else if (Array.isArray(v)) {
      clean[k] = v.map((item) => (typeof item === 'object' && item !== null ? cleanDocForFirestore(item) : item));
    } else if (typeof v === 'object' && !(v instanceof Date)) {
      clean[k] = cleanDocForFirestore(v);
    } else {
      clean[k] = v;
    }
  }
  if (!clean.uid || typeof clean.uid !== 'string' || clean.uid.trim() === '') {
    delete clean.uid;
  }
  return clean;
};

// Bulletproof helper to identify protected administrator accounts (never treats regular members as admins)
export const isProtectedAdminUser = (
  u: Partial<NMOUserRecord>,
  currentUser?: NMOUserRecord | null
): boolean => {
  if (!u) return false;
  const role = (u.role || '').trim().toLowerCase();
  const email = (u.email || '').trim().toLowerCase();
  const memNo = (u.membershipNumber || '').trim().toUpperCase();

  // 1. Primary Master Super Administrator
  if (
    email === 'devanshshah768@gmail.com' ||
    email === 'superadmin@nmogujarat.org' ||
    memNo === 'NMO-ADMIN-001'
  ) {
    return true;
  }

  // 2. Explicit administrative role with verified administrative identifiers
  if (role === 'super_admin') {
    return true;
  }

  if (
    role === 'state_admin' &&
    (email.includes('secretary.gujarat') || memNo === 'NMO-STATE-001' || memNo.startsWith('ADMIN-'))
  ) {
    return true;
  }

  if (
    role === 'prant_admin' &&
    (email.includes('secretary.saurashtra') || memNo === 'NMO-PRANT-001' || memNo.startsWith('ADMIN-'))
  ) {
    return true;
  }

  // 3. Current active user session (if they are an admin, protect them so they don't lock themselves out)
  if (currentUser && currentUser.role && currentUser.role !== 'member') {
    const currentMemNo = (currentUser.membershipNumber || '').trim().toUpperCase();
    if (currentMemNo !== '' && memNo !== '' && memNo === currentMemNo) {
      return true;
    }
  }

  return false;
};

export const NMOProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState<NMOUserRecord | null>(null);

  useEffect(() => {
    if (currentUser?.membershipNumber) {
      setMemberIdCookie(currentUser.membershipNumber);
    }
  }, [currentUser?.membershipNumber]);

  // Collection 1: "Users" (Empty clean initial state, no random fake records)
  const [users, setUsers] = useState<NMOUserRecord[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Collection 2: "Events" (Empty clean initial state, no random fake records)
  const [events, setEvents] = useState<NMOEvent[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_EVENTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [announcements, setAnnouncements] = useState<any[]>([]);

  const [importLogs, setImportLogs] = useState<NMOImportLog[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_IMPORTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [auditLogs, setAuditLogs] = useState<NMOAuditLog[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_AUDIT_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Collection: "Cities" state from Database
  const [dbCities, setDbCities] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_CITIES_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_GUJARAT_CITIES;
  });

  // Unique sorted cities list computed from Firestore Cities + existing events + users
  const cities = useMemo(() => {
    const set = new Set<string>();
    (dbCities.length > 0 ? dbCities : DEFAULT_GUJARAT_CITIES).forEach((c) => {
      if (c && typeof c === 'string' && c.trim()) set.add(c.trim());
    });
    events.forEach((e) => {
      if (e.city && typeof e.city === 'string' && e.city.trim()) set.add(e.city.trim());
    });
    users.forEach((u) => {
      if (u.city && typeof u.city === 'string' && u.city.trim()) set.add(u.city.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [dbCities, events, users]);

  const addCityToDatabase = async (cityName: string): Promise<void> => {
    const clean = cityName.trim();
    if (!clean) return;
    try {
      await setDoc(doc(db, 'Cities', clean), {
        name: clean,
        state: 'Gujarat',
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Notice saving city to Firestore:', e);
    }
    setDbCities((prev) => {
      const updated = Array.from(new Set([...prev, clean]));
      try {
        localStorage.setItem(LOCAL_STORAGE_CITIES_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Sync state to local storage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(users));
    } catch {}
  }, [users]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_EVENTS_KEY, JSON.stringify(events));
    } catch {}
  }, [events]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_IMPORTS_KEY, JSON.stringify(importLogs));
    } catch {}
  }, [importLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_AUDIT_KEY, JSON.stringify(auditLogs));
    } catch {}
  }, [auditLogs]);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_SYNC_TIME_KEY) || null;
    } catch {
      return null;
    }
  });

  // Client-Side Caching & Fast Manual Syncing:
  // Instead of continuous streaming onSnapshot querying the whole database on every render,
  // data is securely cached in local storage for instant loading. Admins can click "Refresh from Database"
  // anytime they want to pull the latest changes from Firestore.
  const refreshFromDatabase = async (force: boolean = false): Promise<{
    usersCount: number;
    eventsCount: number;
    registrationsCount: number;
  }> => {
    setIsSyncing(true);
    try {
      // 1. Fetch Users collection
      const usersSnap = await getDocs(collection(db, 'Users'));
      const fetchedUsers: NMOUserRecord[] = [];
      usersSnap.forEach((docSnap) => {
        const data = docSnap.data() as NMOUserRecord;
        fetchedUsers.push({
          ...data,
          membershipNumber: data.membershipNumber || docSnap.id
        });
      });

      // 2. Fetch Events collection
      const eventsSnap = await getDocs(collection(db, 'Events'));
      const fetchedEvents: NMOEvent[] = [];
      eventsSnap.forEach((docSnap) => {
        const data = docSnap.data() as NMOEvent;
        fetchedEvents.push({
          ...data,
          eventId: data.eventId || docSnap.id,
          participants: data.participants || []
        });
      });

      // 3. Fetch event_registrations to ensure all RSVPs and attendance are merged
      let regCount = 0;
      try {
        const regSnap = await getDocs(collection(db, 'event_registrations'));
        regCount = regSnap.size;
        regSnap.forEach((docSnap) => {
          const regData = docSnap.data() as any;
          const targetEvtId = regData.eventId;
          if (targetEvtId) {
            const targetEvt = fetchedEvents.find((e) => e.eventId === targetEvtId);
            if (targetEvt) {
              const memNo = (regData.membershipNumber || '').toUpperCase();
              if (memNo) {
                targetEvt.participants = targetEvt.participants || [];
                const existingIdx = targetEvt.participants.findIndex(
                  (p) => p.membershipNumber.toUpperCase() === memNo
                );
                const participantItem: EventParticipant = {
                  membershipNumber: memNo,
                  uid: regData.uid,
                  name: regData.name || 'Member',
                  email: regData.email || '',
                  phone: regData.phone || '',
                  medicalCollege: regData.medicalCollege || '',
                  prant: regData.prant || targetEvt.prant,
                  registrationDate: regData.registrationDate || new Date().toISOString().split('T')[0],
                  approvalStatus: regData.registrationStatus || regData.status || 'Pending',
                  attendanceStatus: regData.attendanceStatus || 'Pending'
                };
                if (existingIdx >= 0) {
                  targetEvt.participants[existingIdx] = {
                    ...targetEvt.participants[existingIdx],
                    ...participantItem
                  };
                } else {
                  targetEvt.participants.push(participantItem);
                }
              }
            }
          }
        });
      } catch (e) {
        console.debug('Notice loading event_registrations:', e);
      }

      // Update state and cache
      if (fetchedUsers.length > 0 || force) {
        setUsers(fetchedUsers);
        try {
          localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(fetchedUsers));
        } catch {}
      }

      if (fetchedEvents.length > 0 || force) {
        setEvents(fetchedEvents);
        try {
          localStorage.setItem(LOCAL_STORAGE_EVENTS_KEY, JSON.stringify(fetchedEvents));
        } catch {}
      }

      // 4. Fetch Cities collection from database
      try {
        const citiesSnap = await getDocs(collection(db, 'Cities'));
        const loadedCities: string[] = [];
        citiesSnap.forEach((d) => {
          const val = d.data()?.name || d.id;
          if (val && typeof val === 'string') loadedCities.push(val.trim());
        });
        if (loadedCities.length > 0) {
          setDbCities(loadedCities);
          try {
            localStorage.setItem(LOCAL_STORAGE_CITIES_KEY, JSON.stringify(loadedCities));
          } catch {}
        } else {
          // Seed Cities collection in Firestore
          for (const c of DEFAULT_GUJARAT_CITIES) {
            setDoc(doc(db, 'Cities', c), {
              name: c,
              state: 'Gujarat',
              createdAt: new Date().toISOString()
            }).catch(() => {});
          }
          setDbCities(DEFAULT_GUJARAT_CITIES);
        }
      } catch (e) {
        console.debug('Notice fetching Cities collection:', e);
      }

      const syncTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastSyncTime(syncTime);
      try {
        localStorage.setItem(LOCAL_STORAGE_SYNC_TIME_KEY, syncTime);
      } catch {}

      return {
        usersCount: fetchedUsers.length,
        eventsCount: fetchedEvents.length,
        registrationsCount: regCount
      };
    } catch (err: any) {
      console.warn('Error refreshing from database:', err);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  };

  // One-time initial seeding on mount only if client cache is empty
  useEffect(() => {
    const cachedUsersStr = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
    const cachedEventsStr = localStorage.getItem(LOCAL_STORAGE_EVENTS_KEY);
    const hasCachedUsers = cachedUsersStr && JSON.parse(cachedUsersStr).length > 0;
    const hasCachedEvents = cachedEventsStr && JSON.parse(cachedEventsStr).length > 0;

    if (!hasCachedUsers && !hasCachedEvents) {
      refreshFromDatabase();
    }
  }, []);

  // Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user && user.email) {
        const emailLower = user.email.toLowerCase();
        const isSuperAdminEmail =
          emailLower === 'devanshshah768@gmail.com' ||
          emailLower === 'superadmin@nmogujarat.org';

        // Look for matching user in the Users collection
        let matched = users.find(
          (u) =>
            (u.email && u.email.toLowerCase() === emailLower) ||
            u.uid === user.uid
        );

        if (!matched && isSuperAdminEmail) {
          matched = {
            membershipNumber: 'NMO-ADMIN-001',
            name: user.displayName || 'State Administrator',
            email: user.email,
            role: 'super_admin',
            accountStatus: 'Active',
            prant: 'All' as any,
            uid: user.uid,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
          };
        } else if (matched) {
          // If super admin email, enforce super_admin
          if (isSuperAdminEmail && matched.role !== 'super_admin') {
            matched = { ...matched, role: 'super_admin' };
          }
          // Update uid and lastLogin if missing
          matched = {
            ...matched,
            uid: user.uid,
            lastLogin: new Date().toISOString()
          };
        }

        if (matched) {
          setCurrentUser(matched);
        }
      } else {
        // Maintain admin login: Check if Super Admin server-side cookie exists
        try {
          const resp = await fetch('/api/admin/session', { credentials: 'include' });
          if (resp.ok) {
            const data = await resp.json();
            if (data.authenticated && data.user) {
              const sessionAdmin: NMOUserRecord = {
                membershipNumber: data.user.membershipNumber || 'NMO-ADMIN-001',
                name: data.user.name || 'Dr. Devansh Shah',
                email: data.user.email || 'devanshshah768@gmail.com',
                role: 'super_admin',
                accountStatus: 'Active',
                status: 'Active',
                prant: 'All' as any,
                nmoState: 'Gujarat',
                uid: data.user.uid,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
              };
              setCurrentUser(sessionAdmin);
            }
          }
        } catch (cookieErr) {
          // Silently proceed if server session check unavailable
        }
      }
      setIsLoadingAuth(false);
    });

    return () => unsubscribe();
  }, [users]);

  // Unified login portal handler:
  // Login ID: Email Address (or Membership Number)
  // Initial Password: Official Membership Number (e.g. 231112001791)
  // Afterwards: Users can change their password
  const loginWithEmail = async (loginId: string, pass: string): Promise<UserRole> => {
    let resolvedRole: UserRole = 'member';
    const cleanId = loginId.trim();
    const cleanIdLower = cleanId.toLowerCase();
    const cleanPass = pass.trim();

    if (!cleanId || !cleanPass) {
      throw new Error('Please enter both your Login ID (Email) and Password.');
    }

    const isSuperAdminEmail =
      cleanIdLower === 'devanshshah768@gmail.com' ||
      cleanIdLower === 'superadmin@nmogujarat.org';

    // 1. Locate member in Users collection (match by email OR membershipNumber)
    let matched = users.find(
      (u) =>
        (u.email && u.email.toLowerCase() === cleanIdLower) ||
        (u.membershipNumber && u.membershipNumber.toLowerCase() === cleanIdLower)
    );

    // If not in local state yet, query Firestore Users directly
    if (!matched) {
      try {
        const directDoc = await getDoc(doc(db, 'Users', cleanId.toUpperCase()));
        if (directDoc.exists()) {
          matched = directDoc.data() as NMOUserRecord;
        } else {
          const qEmail = query(collection(db, 'Users'), where('email', '==', cleanIdLower));
          const snap = await getDocs(qEmail);
          if (!snap.empty) {
            matched = snap.docs[0].data() as NMOUserRecord;
          }
        }
      } catch (err) {
        console.warn('Firestore user lookup notice:', err);
      }
    }

    // 2. Handle Super Administrator Authentication
    // Super Admin credentials MUST be verified by Firebase Authentication without bypass, mock login, or fallback
    const isSuperAdminLogin =
      isSuperAdminEmail ||
      cleanId.toUpperCase() === 'NMO-ADMIN-001' ||
      (matched && matched.role === 'super_admin');

    if (isSuperAdminLogin) {
      const targetAdminEmail = cleanIdLower.includes('@')
        ? cleanIdLower
        : (matched?.email?.trim().toLowerCase() || 'devanshshah768@gmail.com');

      // Verify the password through Firebase Authentication first (no bypass, no mock fallback)
      const cred = await signInWithEmailAndPassword(auth, targetAdminEmail, cleanPass);
      const authUser = cred.user;

      // Validate the authenticated user's trusted role/UID against configured Super Admin identity
      const authenticatedEmail = (authUser.email || targetAdminEmail).toLowerCase();
      const isAuthorizedSuperAdmin =
        authenticatedEmail === 'devanshshah768@gmail.com' ||
        authenticatedEmail === 'superadmin@nmogujarat.org' ||
        matched?.role === 'super_admin';

      if (!isAuthorizedSuperAdmin) {
        throw new Error('Access denied: User is not authorized as Super Administrator.');
      }

      // Check account status if matched record exists
      if (matched && matched.accountStatus === 'Inactive') {
        throw new Error('This account has been deactivated. Please contact the administrator.');
      }

      // Locate or construct the Super Admin record using the real Firebase Auth UID
      const officialMemNo = matched?.membershipNumber || 'NMO-ADMIN-001';
      const verifiedAdmin: NMOUserRecord = {
        membershipNumber: officialMemNo,
        name: matched?.name || authUser.displayName || 'Dr. Devansh Shah',
        email: authenticatedEmail,
        role: 'super_admin',
        accountStatus: 'Active',
        status: 'Active',
        prant: matched?.prant || 'All',
        nmoState: matched?.nmoState || 'Gujarat',
        uid: authUser.uid,
        createdAt: matched?.createdAt || new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      setCurrentUser(verifiedAdmin);

      // Maintain login for admins: Store server-side cookie accessible only by superadmin
      try {
        await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: authenticatedEmail,
            membershipNumber: officialMemNo,
            name: verifiedAdmin.name,
            uid: verifiedAdmin.uid
          })
        });
      } catch (cookieErr) {
        console.warn('Notice setting server-side admin cookie:', cookieErr);
      }

      try {
        const safeData = cleanDocForFirestore(verifiedAdmin);
        await setDoc(doc(db, 'Users', officialMemNo), safeData, { merge: true });
      } catch (err) {
        console.warn('Notice saving verified super admin login:', err);
      }

      setUsers((prev) => {
        const next = prev.map((u) => (u.membershipNumber === officialMemNo ? verifiedAdmin : u));
        if (!next.some((u) => u.membershipNumber === officialMemNo)) {
          next.push(verifiedAdmin);
        }
        try {
          localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });

      await logAudit(
        'USER_LOGIN',
        'ADMIN',
        officialMemNo,
        `Super Admin ${verifiedAdmin.name} (${officialMemNo}) logged in successfully with verified Firebase credentials`
      );

      return 'super_admin';
    }

    if (!matched) {
      throw new Error(
        'Invalid login credentials. Please verify your Login ID and password.'
      );
    }

    if (matched.accountStatus === 'Inactive') {
      throw new Error('This account has been deactivated. Please contact the administrator.');
    }

    const officialMemNo = (matched.membershipNumber || '').trim().toUpperCase();
    const isMembershipPasswordMatch =
      cleanPass.toUpperCase() === officialMemNo ||
      cleanPass.toLowerCase() === officialMemNo.toLowerCase();
    const isCustomPasswordMatch =
      Boolean(matched.customPassword) && matched.customPassword === cleanPass;

    let authUser: FirebaseUser | null = null;
    const targetEmail = matched.email?.trim().toLowerCase() || cleanIdLower;

    // Check credentials: Valid if matches official membership number OR custom password
    if (isMembershipPasswordMatch || isCustomPasswordMatch) {
      // Valid credentials provided! Attempt transparent Firebase Auth in background
      try {
        const cred = await signInWithEmailAndPassword(auth, targetEmail, cleanPass);
        authUser = cred.user;
      } catch {
        try {
          if (cleanPass.length >= 6) {
            const cred = await createUserWithEmailAndPassword(auth, targetEmail, cleanPass);
            authUser = cred.user;
          }
        } catch {
          // Gracefully continue: user is authenticated by membership number in Users collection
        }
      }
    } else {
      // Neither membership number nor custom password matched; attempt standard Firebase Auth
      try {
        const cred = await signInWithEmailAndPassword(auth, targetEmail, cleanPass);
        authUser = cred.user;
      } catch (authErr: any) {
        throw new Error(
          'Invalid password. Please check your credentials or use the Forgot Password link to reset your account.'
        );
      }
    }

    // 4. Resolve Role & Session
    resolvedRole = matched.role || 'member';
    const updatedMemberRecord: NMOUserRecord = {
      ...matched,
      uid: authUser?.uid || matched.uid || `user-${officialMemNo}`,
      role: resolvedRole,
      lastLogin: new Date().toISOString()
    };

    setCurrentUser(updatedMemberRecord);

    // Save updated lastLogin & uid to Firestore and local state
    try {
      const safeData = cleanDocForFirestore(updatedMemberRecord);
      await setDoc(doc(db, 'Users', officialMemNo), safeData, { merge: true });
    } catch (e) {
      console.warn('Notice updating user login info:', e);
    }

    setUsers((prev) => {
      const next = prev.map((u) => (u.membershipNumber === officialMemNo ? updatedMemberRecord : u));
      try {
        localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    await logAudit(
      'USER_LOGIN',
      'USER',
      officialMemNo,
      `User ${updatedMemberRecord.name} (${officialMemNo}) logged in as ${resolvedRole}`
    );

    return resolvedRole;
  };

  // Change user password after first login
  const changeUserPassword = async (newPassword: string): Promise<void> => {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters in length.');
    }

    if (auth.currentUser) {
      try {
        await updatePassword(auth.currentUser, newPassword);
      } catch (e) {
        console.warn('Firebase Auth update password notice:', e);
      }
    }

    if (currentUser) {
      const cleanNo = currentUser.membershipNumber.trim().toUpperCase();
      try {
        await updateDoc(doc(db, 'Users', cleanNo), {
          hasCustomPassword: true,
          customPassword: newPassword,
          updatedAt: new Date().toISOString()
        });
      } catch {}
      const updatedUser: NMOUserRecord = {
        ...currentUser,
        hasCustomPassword: true,
        customPassword: newPassword
      };
      setCurrentUser(updatedUser);
      setUsers((prev) => {
        const next = prev.map((u) => (u.membershipNumber === cleanNo ? updatedUser : u));
        try {
          localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    }

    await logAudit(
      'PASSWORD_CHANGE',
      'USER',
      currentUser?.membershipNumber || 'UNKNOWN',
      'User updated their account password'
    );
  };

  const registerWithEmail = async (
    email: string,
    pass: string,
    membershipNo: string,
    name: string,
    prant: 'Gujarat' | 'Saurashtra'
  ): Promise<UserRole> => {
    const cleanNo = membershipNo.trim().toUpperCase();
    let uid = `user-${Date.now()}`;

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      uid = cred.user.uid;
    } catch (e: any) {
      // In offline mode continue with generated UID
      if (e.code !== 'auth/email-already-in-use') {
        console.warn('Firebase registration notice:', e.message);
      }
    }

    // Check if membership record already exists from CSV
    const existing = users.find((u) => u.membershipNumber.toUpperCase() === cleanNo);
    const updatedUser: NMOUserRecord = existing
      ? {
          ...existing,
          email,
          name: name.trim() || existing.name,
          uid,
          accountStatus: 'Active',
          updatedAt: new Date().toISOString()
        }
      : {
          membershipNumber: cleanNo,
          name: name.trim(),
          email,
          prant,
          role: 'member',
          accountStatus: 'Active',
          uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

    await addUser(updatedUser);
    setCurrentUser(updatedUser);
    return updatedUser.role;
  };

  const logout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    try {
      await firebaseSignOut(auth);
    } catch {}
    clearMemberIdCookie();
    setCurrentUser(null);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const switchDemoRole = (role: UserRole, prant?: PrantType) => {
    const targetPrant = prant || (role === 'prant_admin' ? 'Saurashtra' : 'All');
    const existingUserOfRole = users.find((u) => u.role === role);

    const simulatedUser: NMOUserRecord = existingUserOfRole
      ? { ...existingUserOfRole, role, prant: targetPrant as any }
      : {
          membershipNumber:
            role === 'super_admin'
              ? 'NMO-SUPER-001'
              : role === 'state_admin'
              ? 'NMO-STATE-001'
              : role === 'prant_admin'
              ? 'NMO-PRANT-001'
              : role === 'city_admin'
              ? 'NMO-CITY-001'
              : 'NMO-MEM-001',
          name:
            role === 'super_admin'
              ? 'Super Admin (All Privileges)'
              : role === 'state_admin'
              ? 'State Admin (Gujarat State)'
              : role === 'prant_admin'
              ? `Prant Admin (${targetPrant} Prant)`
              : role === 'city_admin'
              ? 'City Admin (Ahmedabad)'
              : 'Verified NMO Member',
          email:
            role === 'super_admin'
              ? 'devanshshah768@gmail.com'
              : role === 'state_admin'
              ? 'secretary.gujarat@nmogujarat.org'
              : role === 'prant_admin'
              ? 'secretary.saurashtra@nmogujarat.org'
              : role === 'city_admin'
              ? 'admin.ahmedabad@nmogujarat.org'
              : 'member@nmogujarat.org',
          role,
          city: 'Ahmedabad',
          prant: targetPrant as any,
          accountStatus: 'Active',
          lastLogin: new Date().toISOString()
        };

    setCurrentUser(simulatedUser);
  };

  const linkMembershipNumber = async (membershipNumber: string): Promise<boolean> => {
    const cleanNo = membershipNumber.trim().toUpperCase();
    const found = users.find((u) => u.membershipNumber.toUpperCase() === cleanNo);
    if (!found) return false;

    if (currentUser) {
      const merged: NMOUserRecord = {
        ...found,
        uid: currentUser.uid || found.uid,
        email: currentUser.email || found.email
      };
      await updateUser(merged);
      setCurrentUser(merged);
    }
    return true;
  };

  // --- Collection 1 ("Users") Operations ---
  const getUserByMembershipNumber = (membershipNumber: string) => {
    return users.find(
      (u) => u.membershipNumber.toLowerCase() === membershipNumber.toLowerCase()
    );
  };

  const addUser = async (userRecord: NMOUserRecord) => {
    const memNo = userRecord.membershipNumber?.trim().toUpperCase();
    if (!memNo) {
      throw new Error('Membership Number is required');
    }

    const cleanUser: NMOUserRecord = {
      ...userRecord,
      membershipNumber: memNo,
      name: userRecord.name?.trim() || 'New Member',
      email: (userRecord.email || '').trim().toLowerCase(),
      role: userRecord.role || 'member',
      accountStatus: userRecord.accountStatus || userRecord.status || 'Active',
      status: userRecord.status || userRecord.accountStatus || 'Active',
      nmoState: userRecord.nmoState || 'Gujarat',
      prant: userRecord.prant || 'Gujarat',
      hasCustomPassword: userRecord.hasCustomPassword || false,
      customPassword: userRecord.customPassword || memNo,
      createdAt: userRecord.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const safeData = cleanDocForFirestore(cleanUser);

    // Write directly to Firestore Users/{memNo}
    try {
      await setDoc(doc(db, 'Users', memNo), safeData, { merge: true });
    } catch (err: any) {
      console.error('Firestore Users write error in addUser:', err);
      throw new Error(`Failed to save member to database: ${err.message || 'Unknown error'}`);
    }

    // Update local state and localStorage cache immediately
    setUsers((prev) => {
      const exists = prev.some((u) => u.membershipNumber === memNo);
      const next = exists
        ? prev.map((u) => (u.membershipNumber === memNo ? (safeData as NMOUserRecord) : u))
        : [safeData as NMOUserRecord, ...prev];
      try {
        localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    await logAudit(
      'USER_CREATE',
      'USER',
      memNo,
      `Saved member record for ${safeData.name || memNo} (${memNo})`
    );
  };

  const updateUser = async (userRecord: NMOUserRecord) => {
    const cleanNo = userRecord.membershipNumber?.trim().toUpperCase();
    if (!cleanNo) {
      throw new Error('Membership Number is required');
    }

    const updated: NMOUserRecord = {
      ...userRecord,
      membershipNumber: cleanNo,
      accountStatus: userRecord.accountStatus || userRecord.status || 'Active',
      status: userRecord.status || userRecord.accountStatus || 'Active',
      updatedAt: new Date().toISOString()
    };

    const safeData = cleanDocForFirestore(updated);

    try {
      await setDoc(doc(db, 'Users', cleanNo), safeData, { merge: true });
    } catch (err: any) {
      console.error('Firestore User update error in updateUser:', err);
      throw new Error(`Failed to update member in database: ${err.message || 'Unknown error'}`);
    }

    setUsers((prev) => {
      const next = prev.map((u) => (u.membershipNumber === cleanNo ? (safeData as NMOUserRecord) : u));
      try {
        localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    if (currentUser?.membershipNumber === cleanNo) {
      setCurrentUser(safeData as NMOUserRecord);
    }

    await logAudit(
      'USER_UPDATE',
      'USER',
      cleanNo,
      `Updated user profile: ${safeData.name || cleanNo}`
    );
  };

  const deleteUser = async (membershipNumber: string) => {
    const cleanNo = membershipNumber.trim().toUpperCase();
    setUsers((prev) => {
      const next = prev.filter((u) => u.membershipNumber !== cleanNo);
      try {
        localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      await deleteDoc(doc(db, 'Users', cleanNo));
    } catch {}

    await logAudit('USER_DELETE', 'USER', cleanNo, `Deleted user ${cleanNo}`);
  };

  // Clear all regular member users except administrators and superadmin
  const clearNonAdminUsers = async (): Promise<{
    deletedCount: number;
    preservedCount: number;
    success: boolean;
    error?: string;
  }> => {
    const checkIsAdmin = (u: Partial<NMOUserRecord>) => isProtectedAdminUser(u, currentUser);

    const preserved = users.filter(checkIsAdmin);
    const toDeleteLocal = users.filter((u) => !checkIsAdmin(u));

    // Automatically trigger backup before purge
    createUsersBackup();

    // Update local state immediately
    setUsers(preserved);
    try {
      localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(preserved));
    } catch {}

    const CHUNK_SIZE = 400;
    try {
      // Direct query to Firestore to purge all non-admin user documents
      const querySnap = await getDocs(collection(db, 'Users'));
      const refsToDelete: { id: string; ref: any }[] = [];
      let firestorePreserved = 0;

      querySnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as Partial<NMOUserRecord>;
        const record = { ...data, membershipNumber: data.membershipNumber || docSnap.id };
        if (checkIsAdmin(record)) {
          firestorePreserved++;
        } else {
          refsToDelete.push({ id: docSnap.id, ref: docSnap.ref });
        }
      });

      // Also ensure any non-admin users in local state that may not have appeared in snap are deleted
      for (const u of toDeleteLocal) {
        const key = u.membershipNumber.trim().toUpperCase();
        if (!refsToDelete.some((r) => r.id === key)) {
          refsToDelete.push({ id: key, ref: doc(db, 'Users', key) });
        }
      }

      if (refsToDelete.length > 0) {
        for (let i = 0; i < refsToDelete.length; i += CHUNK_SIZE) {
          const chunk = refsToDelete.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          for (const item of chunk) {
            batch.delete(item.ref);
          }
          await batch.commit();
        }
      }

      await logAudit(
        'PURGE_NON_ADMIN_USERS',
        'USERS',
        `PURGE-${Date.now()}`,
        `Cleared ${refsToDelete.length} non-admin members from Firestore Users collection. Preserved ${Math.max(preserved.length, firestorePreserved)} administrator accounts.`
      );

      return {
        deletedCount: refsToDelete.length,
        preservedCount: Math.max(preserved.length, firestorePreserved),
        success: true
      };
    } catch (err: any) {
      console.warn('Error clearing non-admin users:', err);
      return {
        deletedCount: toDeleteLocal.length,
        preservedCount: preserved.length,
        success: false,
        error: err.message || 'Batch delete failed'
      };
    }
  };

  // Wipe all member records completely, strictly preserving only the active Super Administrator
  const clearAllMembers = async (): Promise<{
    deletedCount: number;
    preservedCount: number;
    success: boolean;
    error?: string;
  }> => {
    // 1. Trigger automated JSON backup
    createUsersBackup();

    const masterAdmin: NMOUserRecord = {
      membershipNumber: 'NMO-ADMIN-001',
      name: currentUser?.name || 'Dr. Devansh Shah',
      email: currentUser?.email || 'devanshshah768@gmail.com',
      role: 'super_admin',
      accountStatus: 'Active',
      status: 'Active',
      prant: 'All',
      nmoState: 'Gujarat',
      uid: currentUser?.uid || 'super-admin-uid',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };

    setUsers([masterAdmin]);
    try {
      localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify([masterAdmin]));
    } catch {}

    const CHUNK_SIZE = 400;
    try {
      const querySnap = await getDocs(collection(db, 'Users'));
      const refsToDelete: { id: string; ref: any }[] = [];

      querySnap.docs.forEach((docSnap) => {
        const docId = docSnap.id.toUpperCase();
        const data = docSnap.data() as Partial<NMOUserRecord>;
        const email = (data.email || '').toLowerCase();
        if (
          docId === 'NMO-ADMIN-001' ||
          email === 'devanshshah768@gmail.com' ||
          email === 'superadmin@nmogujarat.org'
        ) {
          // preserve primary superadmin
        } else {
          refsToDelete.push({ id: docSnap.id, ref: docSnap.ref });
        }
      });

      if (refsToDelete.length > 0) {
        for (let i = 0; i < refsToDelete.length; i += CHUNK_SIZE) {
          const chunk = refsToDelete.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          for (const item of chunk) {
            batch.delete(item.ref);
          }
          await batch.commit();
        }
      }

      try {
        await setDoc(doc(db, 'Users', 'NMO-ADMIN-001'), cleanDocForFirestore(masterAdmin), { merge: true });
      } catch {}

      await logAudit(
        'WIPE_ALL_MEMBERS',
        'USERS',
        `WIPE-${Date.now()}`,
        `Wiped all ${refsToDelete.length} member records from database. Preserved master super administrator.`
      );

      return {
        deletedCount: refsToDelete.length,
        preservedCount: 1,
        success: true
      };
    } catch (err: any) {
      console.warn('Error wiping all members:', err);
      return {
        deletedCount: 0,
        preservedCount: 1,
        success: false,
        error: err.message || 'Wipe failed'
      };
    }
  };

  // Delete multiple selected users from Firestore and local cache
  const deleteMultipleUsers = async (membershipNumbers: string[]): Promise<number> => {
    if (!membershipNumbers || membershipNumbers.length === 0) return 0;
    const cleanSet = new Set(membershipNumbers.map((n) => n.trim().toUpperCase()));
    cleanSet.delete('NMO-ADMIN-001'); // Never delete master admin

    setUsers((prev) => {
      const next = prev.filter((u) => !cleanSet.has(u.membershipNumber.trim().toUpperCase()));
      try {
        localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    const CHUNK_SIZE = 400;
    const arrayKeys = Array.from(cleanSet);
    for (let i = 0; i < arrayKeys.length; i += CHUNK_SIZE) {
      const chunk = arrayKeys.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const key of chunk) {
        batch.delete(doc(db, 'Users', key));
      }
      await batch.commit();
    }

    await logAudit(
      'BULK_USER_DELETE',
      'USERS',
      `BULK-${Date.now()}`,
      `Deleted ${arrayKeys.length} selected member records from Firestore.`
    );

    return arrayKeys.length;
  };

  const updateUserRole = async (
    membershipNumber: string,
    newRole: UserRole,
    newPrant?: PrantType
  ) => {
    const cleanNo = membershipNumber.trim().toUpperCase();
    const target = users.find((u) => u.membershipNumber === cleanNo);
    if (!target) return;

    const updated: NMOUserRecord = {
      ...target,
      role: newRole,
      prant: (newPrant || target.prant) as any,
      updatedAt: new Date().toISOString()
    };

    await updateUser(updated);
    await logAudit(
      'ROLE_CHANGE',
      'USER',
      cleanNo,
      `Changed role of ${target.name} to "${newRole}" (Prant: ${updated.prant})`
    );
  };

  // Create recoverable backup of Users collection before major synchronization
  const createUsersBackup = (): { jsonContent: string; filename: string } => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `NMO_Users_Master_Backup_${timestamp}`;
    const jsonContent = JSON.stringify(users, null, 2);

    try {
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Auto-download backup note:', e);
    }

    return { jsonContent, filename };
  };

  // Safe Chunked Firestore Batch Import into "Users" Collection
  const batchImportUsers = async (
    newUsers: NMOUserRecord[],
    filename: string,
    options?: {
      mode?: 'add_update' | 'replace_sync' | 'validate_only';
      onProgress?: (processed: number, total: number) => void;
      unchangedCount?: number;
      invalidCount?: number;
      duplicateCount?: number;
      missingUsers?: NMOUserRecord[];
    }
  ): Promise<{
    added: number;
    updated: number;
    duplicates: number;
    deactivated: number;
    success: boolean;
    error?: string;
  }> => {
    const mode = options?.mode || 'add_update';

    // If Validate Only mode, do not write to Firestore
    if (mode === 'validate_only') {
      const logItem: NMOImportLog = {
        id: `VAL-${Date.now()}`,
        filename,
        totalRecords: newUsers.length,
        newRecords: 0,
        updatedRecords: 0,
        unchangedRecords: options?.unchangedCount || 0,
        duplicateRecords: options?.duplicateCount || 0,
        invalidRecords: options?.invalidCount || 0,
        deactivatedRecords: 0,
        importedBy: currentUser?.name || currentUser?.email || 'Admin',
        importedAt: new Date().toISOString(),
        mode: 'validate_only',
        result: 'Validated',
        reportDetails: `Validated ${newUsers.length} records. Dry-run without database modification.`
      };

      setImportLogs((prev) => [logItem, ...prev]);

      await logAudit(
        'CSV_VALIDATION',
        'USERS',
        logItem.id,
        `Validated ${newUsers.length} records in file "${filename}". Dry run complete.`
      );

      return {
        added: 0,
        updated: 0,
        duplicates: options?.duplicateCount || 0,
        deactivated: 0,
        success: true
      };
    }

    let added = 0;
    let updated = 0;
    let duplicates = options?.duplicateCount || 0;
    let deactivated = 0;

    const existingMap = new Map(users.map((u) => [u.membershipNumber.toUpperCase(), u]));
    const nextList = [...users];

    // Build the list of writes: { key: string, data: NMOUserRecord }
    interface BatchOp {
      key: string;
      data: NMOUserRecord;
    }
    const operations: BatchOp[] = [];

    for (const item of newUsers) {
      const key = item.membershipNumber.trim().toUpperCase();
      const existing = existingMap.get(key);

      // Enforce protected fields: NEVER overwrite role, uid, createdAt, lastLogin from CSV!
      const sanitized: NMOUserRecord = {
        ...item,
        membershipNumber: key,
        role: existing?.role || item.role || 'member', // Never elevate role from CSV
        accountStatus: existing?.accountStatus || item.accountStatus || 'Active',
        createdAt: existing?.createdAt || item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const finalUid = existing?.uid || item.uid;
      if (finalUid && typeof finalUid === 'string' && finalUid.trim() !== '') {
        sanitized.uid = finalUid.trim();
      } else {
        delete (sanitized as any).uid;
      }

      const finalLastLogin = existing?.lastLogin || item.lastLogin;
      if (finalLastLogin) sanitized.lastLogin = finalLastLogin;

      const finalProfilePhoto = existing?.profilePhoto || item.profilePhoto;
      if (finalProfilePhoto) sanitized.profilePhoto = finalProfilePhoto;

      // Strip any undefined keys so Firestore doesn't reject with "Unsupported field value: undefined"
      const cleanRecord: any = {};
      Object.entries(sanitized).forEach(([k, v]) => {
        if (v !== undefined && v !== null && k !== 'undefined') cleanRecord[k] = v;
      });
      if (!cleanRecord.uid || typeof cleanRecord.uid !== 'string' || cleanRecord.uid.trim() === '') {
        delete cleanRecord.uid;
      }

      if (existing) {
        const idx = nextList.findIndex((u) => u.membershipNumber.toUpperCase() === key);
        if (idx >= 0) {
          nextList[idx] = { ...existing, ...cleanRecord };
          updated++;
        }
      } else {
        nextList.push(cleanRecord);
        existingMap.set(key, cleanRecord);
        added++;
      }

      operations.push({ key, data: cleanRecord });
    }

    // In Replace/Synchronize mode, mark missing users as Inactive (never delete them)
    if (mode === 'replace_sync') {
      const missingList = options?.missingUsers || [];
      for (const missing of missingList) {
        const key = missing.membershipNumber.trim().toUpperCase();
        const existing = existingMap.get(key);
        if (existing) {
          const deactivatedRecord: NMOUserRecord = {
            ...existing,
            accountStatus: 'Inactive',
            updatedAt: new Date().toISOString()
          };
          const cleanDeactivated: any = {};
          Object.entries(deactivatedRecord).forEach(([k, v]) => {
            if (v !== undefined) cleanDeactivated[k] = v;
          });
          const idx = nextList.findIndex((u) => u.membershipNumber.toUpperCase() === key);
          if (idx >= 0) {
            nextList[idx] = cleanDeactivated;
          }
          operations.push({ key, data: cleanDeactivated });
          deactivated++;
        }
      }
    }

    // Update local state immediately for seamless responsiveness
    setUsers(nextList);

    // Commit writes in safe batches of 400 operations (under Firestore's 500 limit)
    const CHUNK_SIZE = 400;
    let processedOps = 0;
    const totalOps = operations.length;

    try {
      for (let i = 0; i < totalOps; i += CHUNK_SIZE) {
        const chunk = operations.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const op of chunk) {
          const ref = doc(db, 'Users', op.key);
          const safeData: any = {};
          Object.entries(op.data).forEach(([k, v]) => {
            if (v !== undefined && v !== null && k !== 'undefined') safeData[k] = v;
          });
          if (!safeData.uid || typeof safeData.uid !== 'string' || safeData.uid.trim() === '') {
            delete safeData.uid;
          }
          batch.set(ref, safeData, { merge: true });
        }

        await batch.commit();
        processedOps += chunk.length;
        if (options?.onProgress) {
          options.onProgress(processedOps, totalOps);
        }
      }
    } catch (err: any) {
      console.warn('Batch write encountered error:', err);
      return {
        added,
        updated,
        duplicates,
        deactivated,
        success: false,
        error: err.message || 'Firestore batch write failed halfway'
      };
    }

    const logItem: NMOImportLog = {
      id: `IMP-${Date.now()}`,
      filename,
      totalRecords: newUsers.length,
      newRecords: added,
      updatedRecords: updated,
      unchangedRecords: options?.unchangedCount || 0,
      duplicateRecords: duplicates,
      invalidRecords: options?.invalidCount || 0,
      deactivatedRecords: deactivated,
      importedBy: currentUser?.name || currentUser?.email || 'Admin',
      importedAt: new Date().toISOString(),
      mode: mode,
      result: 'Success',
      reportDetails:
        mode === 'replace_sync'
          ? `Master dataset synchronized: ${added} added, ${updated} updated, ${deactivated} deactivated (set to Inactive).`
          : `Batch import complete: ${added} added, ${updated} updated.`
    };

    setImportLogs((prev) => [logItem, ...prev]);

    await logAudit(
      mode === 'replace_sync' ? 'REPLACE_SYNC_CSV' : 'CSV_IMPORT',
      'USERS',
      logItem.id,
      `Master Users sync from "${filename}" (${mode}). Added: ${added}, Updated: ${updated}, Deactivated: ${deactivated}`
    );

    return { added, updated, duplicates, deactivated, success: true };
  };

  // Synchronize / Replace CSV (Marks missing users as Inactive with backup)
  const syncReplaceUsers = async (
    newUsers: NMOUserRecord[],
    filename: string,
    options?: {
      onProgress?: (processed: number, total: number) => void;
      missingUsers?: NMOUserRecord[];
    }
  ): Promise<{ added: number; updated: number; deactivated: number; success: boolean; error?: string }> => {
    // Automatically trigger pre-replace backup
    createUsersBackup();

    const existingMap = new Map(users.map((u) => [u.membershipNumber.toUpperCase(), u]));
    const newKeys = new Set(newUsers.map((u) => u.membershipNumber.trim().toUpperCase()));

    // Detect missing members from current Users that are absent in uploaded dataset
    const missing: NMOUserRecord[] = [];
    for (const [key, oldRec] of existingMap.entries()) {
      if (!newKeys.has(key)) {
        missing.push(oldRec);
      }
    }

    const result = await batchImportUsers(newUsers, filename, {
      mode: 'replace_sync',
      onProgress: options?.onProgress,
      missingUsers: options?.missingUsers || missing
    });

    return {
      added: result.added,
      updated: result.updated,
      deactivated: result.deactivated,
      success: result.success,
      error: result.error
    };
  };

  // --- Collection 2 ("Events") Operations ---
  const addEvent = async (
    eventData: Omit<NMOEvent, 'eventId' | 'createdAt' | 'updatedAt' | 'participants'>
  ): Promise<string> => {
    const newId = `EVT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const fullEvent: NMOEvent = {
      ...eventData,
      eventId: newId,
      participants: [], // embedded array as specified
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: currentUser?.name || currentUser?.email || 'Admin'
    };

    // If Google Drive is connected, auto-generate subfolder under NMO Gujarat Mega Folder
    if (getDriveAccessToken()) {
      try {
        const subfolder = await createEventSubfolderInDrive(eventData.title);
        if (subfolder?.id) {
          fullEvent.driveFolderId = subfolder.id;
          fullEvent.driveFolderLink = subfolder.webViewLink;
        }
      } catch (err) {
        console.warn('Auto create event Drive subfolder notice:', err);
      }
    }

    setEvents((prev) => [fullEvent, ...prev]);

    try {
      await setDoc(doc(db, 'Events', newId), fullEvent);
    } catch (err) {
      console.warn('Firestore Events write notice:', err);
    }

    await logAudit(
      'EVENT_CREATE',
      'EVENT',
      newId,
      `Created event: "${fullEvent.title}" (${fullEvent.prant})`
    );

    return newId;
  };

  const createEventDriveSubfolder = async (
    eventId: string,
    eventTitle: string
  ): Promise<{ id: string; name: string; webViewLink?: string } | null> => {
    try {
      const folder = await createEventSubfolderInDrive(eventTitle);
      if (folder?.id) {
        setEvents((prev) =>
          prev.map((e) =>
            e.eventId === eventId
              ? { ...e, driveFolderId: folder.id, driveFolderLink: folder.webViewLink }
              : e
          )
        );
        try {
          await updateDoc(doc(db, 'Events', eventId), {
            driveFolderId: folder.id,
            driveFolderLink: folder.webViewLink
          });
        } catch (err) {
          console.warn('Notice saving Drive folder ID to Firestore:', err);
        }
        await logAudit(
          'EVENT_UPDATE',
          'EVENT',
          eventId,
          `Created Google Drive subfolder "${folder.name}" in NMO Gujarat Mega Folder`
        );
        return folder;
      }
    } catch (err) {
      console.warn('Error creating event Drive subfolder:', err);
      throw err;
    }
    return null;
  };

  const updateEvent = async (event: NMOEvent) => {
    const updated: NMOEvent = {
      ...event,
      updatedAt: new Date().toISOString()
    };

    setEvents((prev) => prev.map((e) => (e.eventId === event.eventId ? updated : e)));

    try {
      await updateDoc(doc(db, 'Events', event.eventId), updated as any);
    } catch (err) {
      console.warn('Firestore Events update notice:', err);
    }

    await logAudit('EVENT_UPDATE', 'EVENT', event.eventId, `Updated event: "${event.title}"`);
  };

  const deleteEvent = async (eventId: string) => {
    const target = events.find((e) => e.eventId === eventId);
    setEvents((prev) => prev.filter((e) => e.eventId !== eventId));

    try {
      await deleteDoc(doc(db, 'Events', eventId));
    } catch {}

    await logAudit(
      'EVENT_DELETE',
      'EVENT',
      eventId,
      `Deleted event: "${target?.title || eventId}"`
    );
  };

  const toggleEventDynamicField = async (
    eventId: string,
    isDynamic: boolean,
    fieldName?: string,
    fieldType?: string
  ) => {
    const target = events.find((e) => e.eventId === eventId);
    if (!target) return;

    const updated: NMOEvent = {
      ...target,
      isDynamicMemberField: isDynamic,
      fieldDisplayName: fieldName || target.fieldDisplayName || target.title,
      fieldType: fieldType || target.fieldType || 'Attended/Not Attended',
      updatedAt: new Date().toISOString()
    };

    await updateEvent(updated);
  };

  // --- Embedded Participants Workflow ---
  // All users are allowed to register for events directly. No approval needed from backend;
  // they are allowed and registered immediately. No presence/absence required for registration.
  const registerForEvent = async (
    eventId: string,
    membershipNumber: string,
    memberName: string
  ) => {
    const targetEvent = events.find((e) => e.eventId === eventId);
    if (!targetEvent) throw new Error('Event not found');

    const cleanNo = membershipNumber.trim().toUpperCase();
    const existing = (targetEvent.participants || []).find(
      (p) => p.membershipNumber.toUpperCase() === cleanNo
    );

    if (existing) {
      throw new Error('You are already registered for this event.');
    }

    const memberRec = users.find((u) => u.membershipNumber.toUpperCase() === cleanNo);

    // Immediate confirmed registration: no pending approval needed
    const newParticipant: EventParticipant = {
      membershipNumber: cleanNo,
      uid: currentUser?.uid,
      name: memberName || memberRec?.name || 'Registered Medico',
      email: currentUser?.email || memberRec?.email || '',
      phone: memberRec?.phone || '',
      medicalCollege: memberRec?.medicalCollege || '',
      prant: (memberRec?.prant || targetEvent.prant) as any,
      registrationDate: new Date().toISOString().split('T')[0],
      approvalStatus: 'Approved',
      attendanceStatus: 'Pending'
    };

    const updatedParticipants = [...(targetEvent.participants || []), newParticipant];
    const updatedEvent: NMOEvent = {
      ...targetEvent,
      participants: updatedParticipants,
      updatedAt: new Date().toISOString()
    };

    await updateEvent(updatedEvent);

    // Save membership ID in cookie for strict verification
    setMemberIdCookie(cleanNo);

    // Automatically store status in the Firestore 'event_registrations' collection
    const regDocId = `${eventId}_${cleanNo}`;
    const registrationRecord = {
      id: regDocId,
      registrationId: regDocId,
      eventId: eventId,
      eventTitle: targetEvent.title,
      eventDate: targetEvent.date,
      eventVenue: targetEvent.venue,
      eventCity: targetEvent.city,
      eventPrant: targetEvent.prant,
      membershipNumber: cleanNo,
      name: newParticipant.name,
      email: newParticipant.email,
      phone: newParticipant.phone,
      medicalCollege: newParticipant.medicalCollege,
      prant: newParticipant.prant,
      registrationDate: newParticipant.registrationDate,
      status: 'Registered',
      registrationStatus: 'Approved',
      approvalStatus: 'Approved',
      attendanceStatus: 'Pending',
      rsvpStatus: 'Attending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'event_registrations', regDocId), registrationRecord, { merge: true });
    } catch (err) {
      console.warn('Firestore event_registrations write notice:', err);
    }

    await logAudit(
      'EVENT_REGISTRATION',
      'EVENT',
      eventId,
      `Member ${newParticipant.name} (${cleanNo}) registered for "${targetEvent.title}". Status: Registered & Confirmed.`
    );
  };

  const cancelEventRegistration = async (eventId: string, membershipNumber: string) => {
    const targetEvent = events.find((e) => e.eventId === eventId);
    if (!targetEvent) throw new Error('Event not found');

    const cleanNo = membershipNumber.trim().toUpperCase();
    const existing = (targetEvent.participants || []).find(
      (p) => p.membershipNumber.toUpperCase() === cleanNo
    );
    if (!existing) {
      throw new Error('Registration not found');
    }

    const updatedParticipants = (targetEvent.participants || []).filter(
      (p) => p.membershipNumber.toUpperCase() !== cleanNo
    );

    const updatedEvent: NMOEvent = {
      ...targetEvent,
      participants: updatedParticipants,
      updatedAt: new Date().toISOString()
    };

    await updateEvent(updatedEvent);

    // Delete document from Firestore 'event_registrations'
    try {
      const regDocId = `${eventId}_${cleanNo}`;
      await deleteDoc(doc(db, 'event_registrations', regDocId));
    } catch (err) {
      console.warn('Firestore event_registrations delete notice:', err);
    }

    await logAudit(
      'CANCEL_REGISTRATION',
      'EVENT',
      eventId,
      `Cancelled registration for member ${existing.name} (${cleanNo}) from "${targetEvent.title}"`
    );
  };

  const deleteParticipantFromEvent = cancelEventRegistration;

  const updateParticipantApproval = async (
    eventId: string,
    membershipNumber: string,
    approvalStatus: ApprovalStatus
  ) => {
    const targetEvent = events.find((e) => e.eventId === eventId);
    if (!targetEvent) return;

    const cleanNo = membershipNumber.trim().toUpperCase();
    const updatedParticipants = (targetEvent.participants || []).map((p) => {
      if (p.membershipNumber.toUpperCase() === cleanNo) {
        return {
          ...p,
          approvalStatus,
          approvedBy: currentUser?.name || currentUser?.email || 'Committee',
          approvedAt: new Date().toISOString()
        };
      }
      return p;
    });

    const updatedEvent: NMOEvent = {
      ...targetEvent,
      participants: updatedParticipants,
      updatedAt: new Date().toISOString()
    };

    await updateEvent(updatedEvent);

    // Update status in Firestore 'event_registrations' collection
    try {
      await updateDoc(doc(db, 'event_registrations', `${eventId}_${cleanNo}`), {
        registrationStatus: approvalStatus,
        status: approvalStatus,
        approvedBy: currentUser?.name || currentUser?.email || 'Committee',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('Firestore event_registrations approval update notice:', err);
    }

    await logAudit(
      'PARTICIPANT_APPROVAL',
      'EVENT',
      eventId,
      `Updated registration approval for ${cleanNo} in "${targetEvent.title}" to ${approvalStatus}`
    );
  };

  const updateParticipantAttendance = async (
    eventId: string,
    membershipNumber: string,
    attendanceStatus: AttendanceStatus
  ) => {
    const targetEvent = events.find((e) => e.eventId === eventId);
    if (!targetEvent) return;

    const cleanNo = membershipNumber.trim().toUpperCase();
    const updatedParticipants = (targetEvent.participants || []).map((p) => {
      if (p.membershipNumber.toUpperCase() === cleanNo) {
        return {
          ...p,
          attendanceStatus,
          attendanceMarkedBy: currentUser?.name || currentUser?.email || 'Admin',
          attendanceMarkedAt: new Date().toISOString()
        };
      }
      return p;
    });

    const updatedEvent: NMOEvent = {
      ...targetEvent,
      participants: updatedParticipants,
      updatedAt: new Date().toISOString()
    };

    await updateEvent(updatedEvent);

    // Update attendance in Firestore 'event_registrations' collection
    try {
      await updateDoc(doc(db, 'event_registrations', `${eventId}_${cleanNo}`), {
        attendanceStatus,
        attendanceMarkedBy: currentUser?.name || currentUser?.email || 'Admin',
        attendanceMarkedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('Firestore event_registrations attendance update notice:', err);
    }

    await logAudit(
      'ATTENDANCE_UPDATE',
      'EVENT',
      eventId,
      `Marked attendance for ${cleanNo} in "${targetEvent.title}" as ${attendanceStatus}`
    );
  };

  const getEventParticipants = (eventId: string): EventParticipant[] => {
    const found = events.find((e) => e.eventId === eventId);
    return found?.participants || [];
  };

  const getMemberRegistrations = (membershipNumber: string) => {
    const cleanNo = membershipNumber.trim().toUpperCase();
    const list: any[] = [];

    events.forEach((evt) => {
      const part = (evt.participants || []).find((p) => p.membershipNumber.toUpperCase() === cleanNo);
      if (part) {
        list.push({
          ...part,
          registrationId: `${evt.eventId}-${part.membershipNumber}`,
          eventId: evt.eventId,
          eventTitle: evt.title,
          eventDate: evt.date,
          eventVenue: evt.venue,
          eventCity: evt.city,
          registrationStatus: part.approvalStatus
        });
      }
    });

    return list;
  };

  // Compatibility helper: computed eventRegistrations list
  const eventRegistrations = events.flatMap((evt) =>
    (evt.participants || []).map((p) => ({
      ...p,
      registrationId: `${evt.eventId}-${p.membershipNumber}`,
      eventId: evt.eventId,
      registrationStatus: p.approvalStatus,
      customFieldValue: p.approvalStatus
    }))
  );

  const updateRegistrationStatus = async (registrationId: string, status: any) => {
    const [evtId, memNo] = registrationId.split('-');
    if (evtId && memNo) {
      await updateParticipantApproval(evtId, memNo, status);
    }
  };

  const updateAttendanceStatus = async (registrationId: string, status: any) => {
    const [evtId, memNo] = registrationId.split('-');
    if (evtId && memNo) {
      await updateParticipantAttendance(evtId, memNo, status);
    }
  };

  // Manual RSVP addition by Administrator
  const addEventRSVPManually = async (eventId: string, participantData: Partial<EventParticipant>) => {
    const targetEvent = events.find((e) => e.eventId === eventId);
    if (!targetEvent) throw new Error('Event not found');

    const cleanNo = (participantData.membershipNumber || '').trim().toUpperCase();
    if (!cleanNo) throw new Error('Membership Number is required');

    const memberRec = users.find((u) => u.membershipNumber.toUpperCase() === cleanNo);

    const newParticipant: EventParticipant = {
      membershipNumber: cleanNo,
      uid: participantData.uid || memberRec?.uid,
      name: participantData.name || memberRec?.name || 'Registered Medico',
      email: participantData.email || memberRec?.email || '',
      phone: participantData.phone || memberRec?.phone || '',
      medicalCollege: participantData.medicalCollege || memberRec?.medicalCollege || '',
      prant: (participantData.prant || memberRec?.prant || targetEvent.prant) as any,
      registrationDate: participantData.registrationDate || new Date().toISOString().split('T')[0],
      approvalStatus: participantData.approvalStatus || 'Approved',
      attendanceStatus: participantData.attendanceStatus || 'Pending'
    };

    const existingIdx = (targetEvent.participants || []).findIndex(
      (p) => p.membershipNumber.toUpperCase() === cleanNo
    );

    let updatedParticipants: EventParticipant[];
    if (existingIdx >= 0) {
      updatedParticipants = [...(targetEvent.participants || [])];
      updatedParticipants[existingIdx] = { ...updatedParticipants[existingIdx], ...newParticipant };
    } else {
      updatedParticipants = [...(targetEvent.participants || []), newParticipant];
    }

    const updatedEvent: NMOEvent = {
      ...targetEvent,
      participants: updatedParticipants,
      updatedAt: new Date().toISOString()
    };

    await updateEvent(updatedEvent);

    // Also persist in event_registrations collection
    const regDocId = `${eventId}_${cleanNo}`;
    const registrationRecord = {
      id: regDocId,
      registrationId: regDocId,
      eventId: eventId,
      eventTitle: targetEvent.title,
      eventDate: targetEvent.date,
      eventVenue: targetEvent.venue,
      eventCity: targetEvent.city,
      eventPrant: targetEvent.prant,
      membershipNumber: cleanNo,
      name: newParticipant.name,
      email: newParticipant.email,
      phone: newParticipant.phone,
      medicalCollege: newParticipant.medicalCollege,
      prant: newParticipant.prant,
      registrationDate: newParticipant.registrationDate,
      status: newParticipant.approvalStatus,
      registrationStatus: newParticipant.approvalStatus,
      attendanceStatus: newParticipant.attendanceStatus,
      rsvpStatus: 'Attending',
      updatedAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'event_registrations', regDocId), registrationRecord, { merge: true });
    } catch (e) {
      console.debug('Notice saving to event_registrations:', e);
    }
  };

  // Announcements CRUD
  const addAnnouncement = async (announcement: any) => {
    const id = `ANN-${Date.now()}`;
    const item = { ...announcement, id, createdAt: new Date().toISOString() };
    setAnnouncements((prev) => [item, ...prev]);
  };

  const toggleAnnouncement = async (id: string, active: boolean) => {
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, active } : a)));
  };

  const deleteAnnouncement = async (id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  const logAudit = async (
    action: string,
    targetType: string,
    targetId: string,
    details: string
  ) => {
    const newLog: NMOAuditLog = {
      id: `LOG-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      action,
      performedBy: currentUser?.name || currentUser?.email || 'System',
      targetType,
      targetId,
      details,
      timestamp: new Date().toISOString()
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // CSV Export utility for Users
  const exportUsersToCSV = (filterPrant?: PrantType, selectedOnly?: string[]) => {
    let dataset = [...users];

    if (filterPrant && filterPrant !== 'All') {
      dataset = dataset.filter((u) => u.prant === filterPrant);
    }

    if (selectedOnly && selectedOnly.length > 0) {
      const set = new Set(selectedOnly.map((s) => s.toUpperCase()));
      dataset = dataset.filter((u) => set.has(u.membershipNumber.toUpperCase()));
    }

    const headers = [
      'Membership Number',
      'Name',
      'Role',
      'Account Status',
      'Prant',
      'Email',
      'Phone',
      'Medical College',
      'Qualifications',
      'Registration Number',
      'Blood Group',
      'DOB',
      'Gender',
      'Member On',
      'Student Membership Valid Till',
      'Address',
      'Pincode',
      'NMO State',
      'Specialization',
      'Ref. Membership Number',
      'Ref. Person',
      'Ref. Person Phone',
      'State Secretary Email',
      'Application Fee'
    ];

    const rows = dataset.map((u) => [
      `"${u.membershipNumber || ''}"`,
      `"${(u.name || '').replace(/"/g, '""')}"`,
      `"${u.role || 'member'}"`,
      `"${u.accountStatus || 'Active'}"`,
      `"${u.prant || ''}"`,
      `"${u.email || ''}"`,
      `"${u.phone || ''}"`,
      `"${(u.medicalCollege || '').replace(/"/g, '""')}"`,
      `"${(u.qualifications || '').replace(/"/g, '""')}"`,
      `"${u.registrationNumber || ''}"`,
      `"${u.bloodGroup || ''}"`,
      `"${u.dob || ''}"`,
      `"${u.gender || ''}"`,
      `"${u.memberOn || ''}"`,
      `"${u.studentMembershipValidTill || ''}"`,
      `"${(u.address || '').replace(/"/g, '""')}"`,
      `"${u.pincode || ''}"`,
      `"${u.nmoState || ''}"`,
      `"${(u.specialization || '').replace(/"/g, '""')}"`,
      `"${u.refMembershipNumber || ''}"`,
      `"${(u.refPerson || '').replace(/"/g, '""')}"`,
      `"${u.refPersonPhone || ''}"`,
      `"${u.stateSecretaryEmail || ''}"`,
      `"${u.applicationFee || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `NMO_Gujarat_Users_${filterPrant || 'All'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Export utility for Event Participants
  const exportEventParticipantsToCSV = (eventId: string) => {
    const targetEvent = events.find((e) => e.eventId === eventId);
    if (!targetEvent) return;

    const headers = [
      'Membership Number',
      'Name',
      'Email',
      'Phone',
      'Medical College',
      'Prant',
      'Registration Date',
      'Approval Status',
      'Attendance Status',
      'Approved By',
      'Approved At',
      'Attendance Marked By',
      'Attendance Marked At'
    ];

    const rows = (targetEvent.participants || []).map((p) => [
      `"${p.membershipNumber || ''}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${p.email || ''}"`,
      `"${p.phone || ''}"`,
      `"${(p.medicalCollege || '').replace(/"/g, '""')}"`,
      `"${p.prant || ''}"`,
      `"${p.registrationDate || ''}"`,
      `"${p.approvalStatus || 'Pending'}"`,
      `"${p.attendanceStatus || 'Pending'}"`,
      `"${p.approvedBy || ''}"`,
      `"${p.approvedAt || ''}"`,
      `"${p.attendanceMarkedBy || ''}"`,
      `"${p.attendanceMarkedAt || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const safeTitle = targetEvent.title.replace(/[^a-zA-Z0-9]/g, '_');
    link.setAttribute('download', `${safeTitle}_Participants_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <NMOContext.Provider
      value={{
        firebaseUser,
        currentUser,
        currentMember: currentUser,
        isLoadingAuth,
        activeRole: currentUser?.role || 'member',
        activePrant: currentUser?.prant || 'All',
        loginWithEmail,
        registerWithEmail,
        logout,
        resetPassword,
        changeUserPassword,
        switchDemoRole,
        linkMembershipNumber,
        users,
        setUsers,
        members: users,
        getUserByMembershipNumber,
        getMemberByNumber: getUserByMembershipNumber,
        addUser,
        addMember: addUser,
        updateUser,
        updateMember: updateUser,
        deleteUser,
        deleteMember: deleteUser,
        clearNonAdminUsers,
        clearAllMembers,
        deleteMultipleUsers,
        updateUserRole,
        batchImportUsers,
        batchImportMembers: batchImportUsers,
        syncReplaceUsers,
        replaceMembersDataset: syncReplaceUsers,
        createUsersBackup,
        events,
        eventRegistrations,
        addEvent,
        updateEvent,
        deleteEvent,
        createEventDriveSubfolder,
        toggleEventDynamicField,
        registerForEvent,
        cancelEventRegistration,
        deleteParticipantFromEvent,
        updateParticipantApproval,
        updateRegistrationStatus,
        updateParticipantAttendance,
        updateAttendanceStatus,
        getEventParticipants,
        getMemberRegistrations,
        announcements,
        addAnnouncement,
        toggleAnnouncement,
        deleteAnnouncement,
        importLogs,
        auditLogs,
        logAudit,
        exportUsersToCSV,
        exportEventParticipantsToCSV,
        refreshFromDatabase,
        isSyncing,
        lastSyncTime,
        addEventRSVPManually,
        cities,
        addCityToDatabase
      }}
    >
      {children}
    </NMOContext.Provider>
  );
};

export const useNMO = () => {
  const context = useContext(NMOContext);
  if (!context) {
    throw new Error('useNMO must be used within an NMOProvider');
  }
  return context;
};
