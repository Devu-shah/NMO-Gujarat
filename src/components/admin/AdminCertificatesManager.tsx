import React, { useState, useEffect, useMemo } from 'react';
import { useNMO } from '../../context/NMOContext';
import {
  connectGoogleDrive,
  connectGoogleDriveViaServerOAuth,
  getDriveAccessToken,
  getSavedDriveAccount,
  checkDriveTokenHealth,
  disconnectGoogleDrive,
  ensureDriveAccessToken,
  restoreDriveSessionFromBackend,
  testServerTokenRefresh,
  uploadCertificateToDrive,
  listCertificatesInFolder,
  downloadDriveCertificate,
  createEventSubfolderInDrive,
  listEventSubfoldersInDrive,
  resolveDriveHierarchy,
  resolveEventDriveFolder,
  listEventFolderCertificates,
  checkCertificateDuplicate,
  NMO_ROOT_DRIVE_FOLDER_ID,
  NMO_ROOT_DRIVE_FOLDER_NAME,
  NMO_ROOT_DRIVE_URL,
  DriveCertificateFile,
  DriveFolderInfo,
  SavedDriveSession,
  restoreDriveSessionFromFirestore,
  saveDriveSessionToBackend,
  fetchPendingCertificates,
  approveCertificate,
  rejectAndDeleteCertificate
} from '../../lib/googleDrive';
import { apiUrl } from '../../lib/api';
import {
  Award,
  Upload,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FolderOpen,
  Search,
  Sparkles,
  FolderPlus,
  Calendar,
  X,
  Eye,
  ShieldCheck,
  LogOut,
  Zap,
  HelpCircle,
  Copy,
  Check,
  Key,
  Trash2,
  Clock,
  Layers,
  FileText,
  AlertTriangle,
  UserCheck,
  Filter,
  ArrowRight
} from 'lucide-react';
import { auth, firebaseConfig } from '../../lib/firebase';
import { DriveIntegrationGuideModal, GuideTab } from './DriveIntegrationGuideModal';
import { BulkCertificateUploadModal } from './BulkCertificateUploadModal';
import { NMOEvent, NMOMember } from '../../types/nmo';

type SubTab = 'event_desk' | 'pending_approvals' | 'drive_explorer';

export const AdminCertificatesManager: React.FC = () => {
  const {
    users,
    events,
    currentUser,
    eventRegistrations,
    createEventDriveSubfolder,
    updateParticipantAttendance,
    addEventRSVPManually
  } = useNMO();

  const [activeSubTab, setActiveSubTab] = useState<SubTab>('event_desk');
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [guideInitialTab, setGuideInitialTab] = useState<GuideTab>('invalid_secret');
  const [savedAccount, setSavedAccount] = useState<SavedDriveSession | null>(getSavedDriveAccount());
  const [tokenHealth, setTokenHealth] = useState<'checking' | 'valid' | 'expired' | 'none'>('checking');
  const [isConnected, setIsConnected] = useState<boolean>(Boolean(getDriveAccessToken()));
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error'; isInvalidSecret?: boolean } | null>(null);
  const [copiedDomain, setCopiedDomain] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // TAB 1: Event Certificate Desk State
  // ---------------------------------------------------------------------------
  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    return events.length > 0 ? events[0].eventId : '';
  });
  const [isResolvingFolder, setIsResolvingFolder] = useState<boolean>(false);
  const [eventFolderInfo, setEventFolderInfo] = useState<{
    resolved: boolean;
    folder?: DriveFolderInfo;
    eventsFolder?: DriveFolderInfo;
    error?: string;
    isAmbiguous?: boolean;
    matchingFolders?: DriveFolderInfo[];
  }>({ resolved: false });

  const [eventDriveFiles, setEventDriveFiles] = useState<DriveCertificateFile[]>([]);
  const [isLoadingEventFiles, setIsLoadingEventFiles] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'missing' | 'pending'>('all');

  // Bulk Upload Modal State
  const [showBulkUploadModal, setShowBulkUploadModal] = useState<boolean>(false);

  // Single Upload Modal State
  const [showSingleUploadModal, setShowSingleUploadModal] = useState<boolean>(false);
  const [singleUploadTargetMember, setSingleUploadTargetMember] = useState<{
    membershipNumber: string;
    name: string;
  } | null>(null);
  const [singleUploadFile, setSingleUploadFile] = useState<File | null>(null);
  const [isSingleUploading, setIsSingleUploading] = useState<boolean>(false);
  const [singleOverwriteConfirmed, setSingleOverwriteConfirmed] = useState<boolean>(false);
  const [singleUploadConflict, setSingleUploadConflict] = useState<{
    conflict: boolean;
    existingFileId?: string;
    existingFileName?: string;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // TAB 2: Pending User Submissions State
  // ---------------------------------------------------------------------------
  const [pendingCertificates, setPendingCertificates] = useState<DriveCertificateFile[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState<boolean>(false);
  const [processingPendingId, setProcessingPendingId] = useState<string | null>(null);
  const [rejectModalCert, setRejectModalCert] = useState<DriveCertificateFile | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState<string>('');

  // ---------------------------------------------------------------------------
  // TAB 3: Google Drive Explorer State
  // ---------------------------------------------------------------------------
  const [activeFolderId, setActiveFolderId] = useState<string>(NMO_ROOT_DRIVE_FOLDER_ID);
  const [eventSubfolders, setEventSubfolders] = useState<DriveFolderInfo[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveCertificateFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const selectedEvent = useMemo(() => {
    return events.find((e) => e.eventId === selectedEventId) || events[0] || null;
  }, [events, selectedEventId]);

  // Load pending submissions
  const loadPendingCertificates = async () => {
    setIsLoadingPending(true);
    try {
      const pending = await fetchPendingCertificates();
      setPendingCertificates(pending);
    } catch (err) {
      console.warn('Notice loading pending member certificates:', err);
    } finally {
      setIsLoadingPending(false);
    }
  };

  // Initialize Drive session and token
  useEffect(() => {
    const initDrive = async () => {
      let session = await restoreDriveSessionFromBackend();
      if (!session || session.status === 'disconnected') {
        const firestoreSession = await restoreDriveSessionFromFirestore();
        if (firestoreSession && firestoreSession.status !== 'disconnected') {
          session = firestoreSession;
          await saveDriveSessionToBackend(firestoreSession).catch(() => {});
        }
      }

      const active = Boolean((session && session.status === 'active') || session?.hasRefreshToken || getDriveAccessToken());
      const saved = session || getSavedDriveAccount();

      setSavedAccount(saved);
      setIsConnected(active);

      if (active) {
        setTokenHealth('checking');
        const health = await checkDriveTokenHealth();
        if (health.valid) {
          setTokenHealth('valid');
        } else {
          setTokenHealth('expired');
        }
      } else {
        setTokenHealth('none');
      }

      await loadPendingCertificates();
    };

    initDrive();
  }, []);

  // Whenever selectedEventId changes, resolve its folder inside "NMO Gujarat → Events"
  useEffect(() => {
    if (!selectedEvent) return;

    let isCancelled = false;

    const resolveFolder = async () => {
      setIsResolvingFolder(true);
      setEventFolderInfo({ resolved: false });
      setEventDriveFiles([]);

      try {
        const result = await resolveEventDriveFolder(
          selectedEvent.eventId,
          selectedEvent.title,
          selectedEvent.driveFolderId
        );

        if (isCancelled) return;

        if (result.success && result.eventFolder) {
          setEventFolderInfo({
            resolved: true,
            folder: result.eventFolder,
            eventsFolder: result.eventsFolder
          });
          // Load files in the resolved folder
          await loadEventFolderFiles(result.eventFolder.id);
        } else {
          setEventFolderInfo({
            resolved: false,
            error:
              result.error ||
              `Event folder for "${selectedEvent.title}" was not found inside "NMO Gujarat → Events". As per safety policy, duplicate event folders are never created automatically. Please create or assign this event's folder in Google Drive.`,
            isAmbiguous: result.code === 'EVENT_FOLDER_AMBIGUOUS',
            matchingFolders: (result as any).matchingFolders
          });
        }
      } catch (err: any) {
        if (isCancelled) return;
        setEventFolderInfo({
          resolved: false,
          error: err.message || 'Failed to resolve event folder in Google Drive'
        });
      } finally {
        if (!isCancelled) setIsResolvingFolder(false);
      }
    };

    resolveFolder();

    return () => {
      isCancelled = true;
    };
  }, [selectedEvent?.eventId]);

  const loadEventFolderFiles = async (folderId: string) => {
    setIsLoadingEventFiles(true);
    try {
      const res = await listEventFolderCertificates(folderId);
      if (res && res.files) {
        setEventDriveFiles(res.files);
      }
    } catch (err) {
      console.warn('Notice loading event folder files:', err);
    } finally {
      setIsLoadingEventFiles(false);
    }
  };

  const handleScanFolder = async (folderIdToScan = activeFolderId) => {
    setIsLoadingFiles(true);
    try {
      const files = await listCertificatesInFolder(
        folderIdToScan === NMO_ROOT_DRIVE_FOLDER_ID ? undefined : folderIdToScan
      );
      setDriveFiles(files);
      if (getDriveAccessToken()) {
        const folders = await listEventSubfoldersInDrive().catch(() => []);
        setEventSubfolders(folders);
      }
    } catch (err: any) {
      console.warn('Scan drive files notice:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setFeedback(null);
    try {
      const driveResult = await connectGoogleDrive();
      setIsConnected(true);
      setSavedAccount(driveResult.session);
      setTokenHealth('valid');
      setFeedback({
        message: `Successfully connected Google Drive account (${driveResult.session.accountEmail})!`,
        type: 'success'
      });
      if (eventFolderInfo.folder) {
        await loadEventFolderFiles(eventFolderInfo.folder.id);
      }
      await loadPendingCertificates();
    } catch (err: any) {
      console.warn('Google Drive authorization notice:', err);
      const isDomainErr = err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized-domain');
      const isInvalidSecret =
        err.message?.includes('invalid_client') ||
        err.message?.includes('client secret is invalid') ||
        err.message?.includes('OAuth2TokenResponse');

      if (isInvalidSecret) {
        setGuideInitialTab('invalid_secret');
        setShowGuideModal(true);
      }

      setFeedback({
        message:
          err.message ||
          'Failed to authorize Google Drive. Please ensure your popup blocker is disabled or update tokens.',
        type: 'error',
        isInvalidSecret
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    disconnectGoogleDrive();
    setIsConnected(false);
    setSavedAccount(null);
    setTokenHealth('none');
    setDriveFiles([]);
    setEventDriveFiles([]);
    setFeedback({
      message: 'Google Drive repository disconnected.',
      type: 'success'
    });
  };

  // ---------------------------------------------------------------------------
  // PARTICIPANTS & CERTIFICATES AGGREGATION FOR SELECTED EVENT
  // ---------------------------------------------------------------------------
  const eventParticipants = useMemo(() => {
    if (!selectedEvent) return [];

    const list: Array<{
      membershipNumber: string;
      name: string;
      email?: string;
      medicalCollege?: string;
      prant?: string;
      attendanceStatus?: string;
      approvalStatus?: string;
    }> = [];

    const seenIds = new Set<string>();

    // 1. From event.participants
    (selectedEvent.participants || []).forEach((p) => {
      const cleanNo = String(p.membershipNumber || '').trim().toUpperCase();
      if (cleanNo && !seenIds.has(cleanNo)) {
        seenIds.add(cleanNo);
        list.push({
          membershipNumber: cleanNo,
          name: p.name || 'Member',
          email: p.email,
          medicalCollege: p.medicalCollege,
          prant: p.prant,
          attendanceStatus: p.attendanceStatus || 'Registered',
          approvalStatus: p.approvalStatus || 'Approved'
        });
      }
    });

    // 2. From eventRegistrations
    (eventRegistrations || [])
      .filter((r) => r.eventId === selectedEvent.eventId)
      .forEach((r) => {
        const cleanNo = String(r.membershipNumber || '').trim().toUpperCase();
        if (cleanNo && !seenIds.has(cleanNo)) {
          seenIds.add(cleanNo);
          list.push({
            membershipNumber: cleanNo,
            name: r.name || 'Registrant',
            email: r.email,
            medicalCollege: r.medicalCollege,
            prant: r.prant,
            attendanceStatus: r.attendanceStatus || (r.attended ? 'Attended' : 'Registered'),
            approvalStatus: r.registrationStatus || r.status || 'Approved'
          });
        }
      });

    return list;
  }, [selectedEvent, eventRegistrations]);

  // Group files in event folder by membership ID (treating ID as string to preserve leading zeros)
  const eventFilesMap = useMemo(() => {
    const map = new Map<string, DriveCertificateFile[]>();
    eventDriveFiles.forEach((file) => {
      const cleanNo = String(file.membershipNumber || '').trim().toUpperCase();
      if (cleanNo) {
        const existing = map.get(cleanNo) || [];
        existing.push(file);
        map.set(cleanNo, existing);
      }
    });
    return map;
  }, [eventDriveFiles]);

  // Aggregated participant rows with certificate status
  const aggregatedParticipantRows = useMemo(() => {
    return eventParticipants.map((participant) => {
      const files = eventFilesMap.get(participant.membershipNumber) || [];
      const primaryFile = files.length > 0 ? files[0] : null;
      const isAmbiguous = files.length > 1;

      // Check if user submission is pending
      const pendingSub = pendingCertificates.find(
        (c) =>
          c.eventId === selectedEvent?.eventId &&
          String(c.membershipNumber).trim().toUpperCase() === participant.membershipNumber
      );

      let statusType: 'admin_issued' | 'user_approved' | 'pending' | 'missing' = 'missing';

      if (pendingSub) {
        statusType = 'pending';
      } else if (primaryFile) {
        if (primaryFile.uploadSource === 'user' && primaryFile.approvalStatus === 'approved') {
          statusType = 'user_approved';
        } else {
          statusType = 'admin_issued';
        }
      }

      return {
        ...participant,
        files,
        primaryFile,
        isAmbiguous,
        statusType,
        pendingSubmission: pendingSub
      };
    });
  }, [eventParticipants, eventFilesMap, pendingCertificates, selectedEvent]);

  // Filtered rows based on search and status filter
  const filteredParticipantRows = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();

    return aggregatedParticipantRows.filter((row) => {
      // Status filter
      if (statusFilter === 'issued' && row.statusType !== 'admin_issued' && row.statusType !== 'user_approved') {
        return false;
      }
      if (statusFilter === 'missing' && row.statusType !== 'missing') {
        return false;
      }
      if (statusFilter === 'pending' && row.statusType !== 'pending') {
        return false;
      }

      // Search query filter (matches name or exact membership ID string)
      if (q) {
        const memMatch = row.membershipNumber.includes(q);
        const nameMatch = row.name.toUpperCase().includes(q);
        const collegeMatch = (row.medicalCollege || '').toUpperCase().includes(q);
        return memMatch || nameMatch || collegeMatch;
      }

      return true;
    });
  }, [aggregatedParticipantRows, searchQuery, statusFilter]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    const total = aggregatedParticipantRows.length;
    const issued = aggregatedParticipantRows.filter(
      (r) => r.statusType === 'admin_issued' || r.statusType === 'user_approved'
    ).length;
    const pending = aggregatedParticipantRows.filter((r) => r.statusType === 'pending').length;
    const missing = aggregatedParticipantRows.filter((r) => r.statusType === 'missing').length;
    const ambiguities = aggregatedParticipantRows.filter((r) => r.isAmbiguous).length;
    return { total, issued, pending, missing, ambiguities };
  }, [aggregatedParticipantRows]);

  // ---------------------------------------------------------------------------
  // SINGLE CERTIFICATE UPLOAD (ADMIN WORKFLOW)
  // ---------------------------------------------------------------------------
  const handleOpenSingleUpload = (member?: { membershipNumber: string; name: string }) => {
    if (!eventFolderInfo.resolved || !eventFolderInfo.folder) {
      setFeedback({
        message: 'Cannot upload certificate: Event folder inside "NMO Gujarat → Events" has not been resolved.',
        type: 'error'
      });
      return;
    }

    setSingleUploadTargetMember(member || null);
    setSingleUploadFile(null);
    setSingleOverwriteConfirmed(false);
    setSingleUploadConflict(null);
    setShowSingleUploadModal(true);
  };

  const handleExecuteSingleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleUploadFile || !singleUploadTargetMember || !eventFolderInfo.folder || !selectedEvent) {
      return;
    }

    const cleanNo = String(singleUploadTargetMember.membershipNumber).trim().toUpperCase();
    setIsSingleUploading(true);
    setFeedback(null);

    try {
      // Check duplicate conflict first
      if (!singleOverwriteConfirmed) {
        const dupCheck = await checkCertificateDuplicate(eventFolderInfo.folder.id, cleanNo);
        if (dupCheck.exists && dupCheck.existingFiles.length > 0) {
          setSingleUploadConflict({
            conflict: true,
            existingFileId: dupCheck.existingFiles[0].id,
            existingFileName: dupCheck.existingFiles[0].name
          });
          setIsSingleUploading(false);
          return;
        }
      }

      // Admin upload: uploadSource is strictly 'admin', approvalStatus is strictly 'not_required'
      const uploaded = await uploadCertificateToDrive(singleUploadFile, {
        membershipNumber: cleanNo,
        memberName: singleUploadTargetMember.name,
        eventId: selectedEvent.eventId,
        eventTitle: selectedEvent.title,
        targetFolderId: eventFolderInfo.folder.id,
        uploadSource: 'admin',
        uploadedBy: 'admin',
        approvalStatus: 'not_required',
        overwriteExisting: singleOverwriteConfirmed,
        existingFileId: singleUploadConflict?.existingFileId,
        assignedAttendance: true
      });

      setFeedback({
        message: `Admin certificate "${uploaded.name}" directly uploaded to Google Drive folder "${eventFolderInfo.folder.name}" for member ${cleanNo}! Approval not required.`,
        type: 'success'
      });

      setShowSingleUploadModal(false);
      setSingleUploadFile(null);
      setSingleUploadTargetMember(null);
      setSingleUploadConflict(null);

      // Re-scan event folder
      await loadEventFolderFiles(eventFolderInfo.folder.id);
    } catch (err: any) {
      if (err.conflict) {
        setSingleUploadConflict({
          conflict: true,
          existingFileId: err.existingFileId,
          existingFileName: err.existingFileName
        });
      } else {
        setFeedback({
          message: err.message || 'Failed to upload certificate to Google Drive.',
          type: 'error'
        });
      }
    } finally {
      setIsSingleUploading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // APPROVE & REJECT USER SUBMISSIONS (ADMIN WORKFLOW)
  // ---------------------------------------------------------------------------
  const handleApproveSubmission = async (cert: DriveCertificateFile) => {
    // Role permission check
    const userRole = currentUser?.role || 'member';
    const isSuperOrState = userRole === 'super_admin' || userRole === 'state_admin';
    const evt = events.find((e) => e.eventId === cert.eventId);

    if (!isSuperOrState) {
      if (userRole === 'city_admin' && evt?.city !== currentUser?.city) {
        alert(`Access Denied: As City Admin of ${currentUser?.city}, you cannot approve submissions for events in ${evt?.city || 'other cities'}.`);
        return;
      }
      if (userRole === 'prant_admin' && evt?.prant !== currentUser?.prant && currentUser?.prant !== 'All') {
        alert(`Access Denied: As Prant Admin of ${currentUser?.prant}, you cannot approve submissions for events in ${evt?.prant || 'other prants'}.`);
        return;
      }
    }

    setProcessingPendingId(cert.id);
    try {
      await approveCertificate(
        cert.id,
        { uid: currentUser?.uid, name: currentUser?.name || 'Administrator' },
        cert.id
      );

      setFeedback({
        message: `Approved certificate for member ${cert.membershipNumber} (${cert.memberName})! Certified in Google Drive.`,
        type: 'success'
      });

      await loadPendingCertificates();
      if (eventFolderInfo.folder && cert.eventId === selectedEvent?.eventId) {
        await loadEventFolderFiles(eventFolderInfo.folder.id);
      }
    } catch (err: any) {
      setFeedback({
        message: err.message || 'Failed to approve certificate.',
        type: 'error'
      });
    } finally {
      setProcessingPendingId(null);
    }
  };

  const handleOpenRejectModal = (cert: DriveCertificateFile) => {
    // Role permission check
    const userRole = currentUser?.role || 'member';
    const isSuperOrState = userRole === 'super_admin' || userRole === 'state_admin';
    const evt = events.find((e) => e.eventId === cert.eventId);

    if (!isSuperOrState) {
      if (userRole === 'city_admin' && evt?.city !== currentUser?.city) {
        alert(`Access Denied: As City Admin of ${currentUser?.city}, you cannot reject submissions for events in ${evt?.city || 'other cities'}.`);
        return;
      }
      if (userRole === 'prant_admin' && evt?.prant !== currentUser?.prant && currentUser?.prant !== 'All') {
        alert(`Access Denied: As Prant Admin of ${currentUser?.prant}, you cannot reject submissions for events in ${evt?.prant || 'other prants'}.`);
        return;
      }
    }

    setRejectModalCert(cert);
    setRejectionReasonText('');
  };

  const handleConfirmRejection = async () => {
    if (!rejectModalCert) return;

    setProcessingPendingId(rejectModalCert.id);
    try {
      await rejectAndDeleteCertificate(
        rejectModalCert.id,
        rejectModalCert.id,
        rejectionReasonText.trim() || 'Certificate submission could not be verified by administrator.',
        { uid: currentUser?.uid, name: currentUser?.name || 'Administrator' }
      );

      setFeedback({
        message: `Rejected certificate for member ${rejectModalCert.membershipNumber}. Unapproved file permanently deleted from Google Drive.`,
        type: 'success'
      });

      setRejectModalCert(null);
      await loadPendingCertificates();
      if (eventFolderInfo.folder && rejectModalCert.eventId === selectedEvent?.eventId) {
        await loadEventFolderFiles(eventFolderInfo.folder.id);
      }
    } catch (err: any) {
      setFeedback({
        message: err.message || 'Failed to reject certificate.',
        type: 'error'
      });
    } finally {
      setProcessingPendingId(null);
    }
  };

  const handleDownload = async (file: DriveCertificateFile) => {
    setDownloadingId(file.id);
    try {
      await downloadDriveCertificate(file.id, file.name);
    } catch (err: any) {
      alert(err.message || 'Failed to download certificate from Google Drive.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Capsule */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-amber-600 text-white flex items-center justify-center font-bold shadow-md shrink-0">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Certificate Management Module
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  Google Drive Integrated
                </span>
                {tokenHealth === 'valid' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Drive Active</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Manages official participation certificates organized under the required logical Drive hierarchy:{' '}
                <strong className="text-slate-800">NMO Gujarat → Events → [Event Folder] → [Certificate Files]</strong>.
                Admin-uploaded certificates are saved directly to Google Drive without requiring approval, while user submissions are routed to the Pending Approvals review queue.
              </p>
            </div>
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setGuideInitialTab('manual_token');
                setShowGuideModal(true);
              }}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Key className="w-4 h-4 text-emerald-700" />
              <span>Drive Tokens</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setGuideInitialTab('quick_guide');
                setShowGuideModal(true);
              }}
              className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <HelpCircle className="w-4 h-4 text-amber-700" />
              <span>Drive Setup</span>
            </button>

            <a
              href={NMO_ROOT_DRIVE_URL}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            >
              <FolderOpen className="w-4 h-4 text-amber-600" />
              <span>Open Root Drive</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            {isConnected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-3 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer border border-slate-200"
                title="Disconnect Google Drive"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isConnecting ? 'Connecting...' : 'Authorize Drive'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`mt-4 p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span className="font-medium leading-relaxed">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Sub-Tab Navigation */}
        <div className="flex items-center gap-2 pt-6 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('event_desk')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'event_desk'
                ? 'bg-red-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Event Certificate Desk (Admin Upload Workflow)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('pending_approvals')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer relative ${
              activeSubTab === 'pending_approvals'
                ? 'bg-red-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-500" />
            <span>Pending Certificate Approvals</span>
            {pendingCertificates.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 shadow-xs">
                {pendingCertificates.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('drive_explorer')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSubTab === 'drive_explorer'
                ? 'bg-red-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FolderOpen className="w-4 h-4 text-amber-600" />
            <span>Google Drive Explorer</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: EVENT CERTIFICATE DESK (ADMIN UPLOAD WORKFLOW) */}
      {/* ========================================================================= */}
      {activeSubTab === 'event_desk' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Event Selector & Drive Folder Mapping Section */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex-1 max-w-xl">
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Select NMO Event to Manage Certificates:
                </label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold border border-slate-300 rounded-xl bg-white shadow-2xs focus:ring-2 focus:ring-red-600 focus:outline-hidden"
                >
                  {events.map((evt) => (
                    <option key={evt.eventId} value={evt.eventId}>
                      {evt.title} ({evt.city}) — {evt.date || 'Scheduled'} [ID: {evt.eventId}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons for Selected Event */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenSingleUpload()}
                  disabled={!eventFolderInfo.resolved}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5 text-red-700" />
                  <span>+ Single Upload</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowBulkUploadModal(true)}
                  disabled={!eventFolderInfo.resolved}
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <Layers className="w-4 h-4" />
                  <span>Bulk Upload (Auto-Match IDs)</span>
                </button>
              </div>
            </div>

            {/* Folder Resolution & Drive Safety Policy Status */}
            <div className="p-4 rounded-2xl border text-xs transition-all">
              {isResolvingFolder ? (
                <div className="flex items-center gap-2 text-slate-600">
                  <RefreshCw className="w-4 h-4 animate-spin text-red-700" />
                  <span>Resolving folder inside "NMO Gujarat → Events" in Google Drive...</span>
                </div>
              ) : eventFolderInfo.resolved && eventFolderInfo.folder ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-950 bg-emerald-50/70 p-1.5 rounded-xl">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Event Folder Successfully Resolved in Google Drive:</span>
                    </div>
                    <div className="text-[11px] text-emerald-800 flex items-center gap-2 flex-wrap">
                      <span className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300">
                        NMO Gujarat → Events → {eventFolderInfo.folder.name}
                      </span>
                      <span className="text-slate-500 font-mono text-[10px]">
                        ID: {eventFolderInfo.folder.id}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {eventFolderInfo.folder.webViewLink && (
                      <a
                        href={eventFolderInfo.folder.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
                        <span>Open Folder in Drive</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => loadEventFolderFiles(eventFolderInfo.folder!.id)}
                      disabled={isLoadingEventFiles}
                      className="p-1.5 text-emerald-800 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                      title="Re-scan folder"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEventFiles ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-950 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-sm text-red-900 block">
                        Folder Resolution Error — Operation Paused
                      </span>
                      <p className="text-xs text-red-800 mt-0.5 leading-relaxed">
                        {eventFolderInfo.error}
                      </p>
                    </div>
                  </div>
                  {eventFolderInfo.isAmbiguous && eventFolderInfo.matchingFolders && (
                    <div className="pl-7 text-[11px] text-red-700">
                      <span>Conflicting folders detected in Drive:</span>
                      <ul className="list-disc list-inside mt-1 font-mono">
                        {eventFolderInfo.matchingFolders.map((f) => (
                          <li key={f.id}>{f.name} (ID: {f.id})</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Metrics & Filter Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-slate-500 font-semibold block text-[11px]">Total Event Participants</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">{summaryCounts.total}</span>
            </div>
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 shadow-xs text-emerald-950">
              <span className="font-semibold block text-[11px] text-emerald-800">Certificates Issued & Active</span>
              <span className="text-xl font-black text-emerald-900 mt-1 block">{summaryCounts.issued}</span>
            </div>
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 shadow-xs text-amber-950">
              <span className="font-semibold block text-[11px] text-amber-800">Pending User Submissions</span>
              <span className="text-xl font-black text-amber-900 mt-1 block">{summaryCounts.pending}</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-xs text-slate-700">
              <span className="font-semibold block text-[11px] text-slate-500">Missing Certificates</span>
              <span className="text-xl font-black text-slate-800 mt-1 block">{summaryCounts.missing}</span>
            </div>
          </div>

          {/* Search, Filter Tabs & Participants Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Search and Filters */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Membership ID (e.g. 001) or Participant Name..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600 focus:outline-hidden bg-white"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-red-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  All ({aggregatedParticipantRows.length})
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('issued')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    statusFilter === 'issued'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Issued ({summaryCounts.issued})
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('missing')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    statusFilter === 'missing'
                      ? 'bg-slate-800 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Missing ({summaryCounts.missing})
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    statusFilter === 'pending'
                      ? 'bg-amber-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Pending ({summaryCounts.pending})
                </button>
              </div>
            </div>

            {/* Participants & Certificates Table */}
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-left text-xs min-w-[900px] border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">Participant Details</th>
                    <th className="p-3.5">Membership ID</th>
                    <th className="p-3.5">Attendance</th>
                    <th className="p-3.5">Certificate Status</th>
                    <th className="p-3.5">Drive File Details</th>
                    <th className="p-3.5 text-right sticky right-0 bg-slate-50 shadow-xs">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingEventFiles ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400">
                        <div className="w-6 h-6 border-2 border-red-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Scanning event folder in Google Drive...
                      </td>
                    </tr>
                  ) : filteredParticipantRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400">
                        No participants match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredParticipantRows.map((row) => {
                      return (
                        <tr key={row.membershipNumber} className="hover:bg-slate-50/80 transition-colors group">
                          {/* Participant Name & Details */}
                          <td className="p-3.5">
                            <div className="font-bold text-slate-900">{row.name}</div>
                            {row.medicalCollege && (
                              <div className="text-[11px] text-slate-500">{row.medicalCollege}</div>
                            )}
                            {row.email && (
                              <div className="text-[10px] text-slate-400 font-mono">{row.email}</div>
                            )}
                          </td>

                          {/* Membership ID String */}
                          <td className="p-3.5">
                            <span className="font-mono font-bold text-xs bg-red-50 text-red-800 border border-red-200 px-2.5 py-1 rounded-lg inline-block">
                              {row.membershipNumber}
                            </span>
                          </td>

                          {/* Attendance */}
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                                row.attendanceStatus === 'Attended'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {row.attendanceStatus === 'Attended' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                              <span>{row.attendanceStatus || 'Registered'}</span>
                            </span>
                          </td>

                          {/* Certificate Status */}
                          <td className="p-3.5">
                            {row.statusType === 'admin_issued' ? (
                              <div>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                                  <Award className="w-3 h-3 text-emerald-600" />
                                  <span>Admin Uploaded (Active)</span>
                                </span>
                                {row.isAmbiguous && (
                                  <span className="block text-[10px] text-amber-700 font-bold mt-1">
                                    ⚠️ {row.files.length} duplicate files in Drive
                                  </span>
                                )}
                              </div>
                            ) : row.statusType === 'user_approved' ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-blue-600" />
                                <span>User Uploaded (Approved)</span>
                              </span>
                            ) : row.statusType === 'pending' ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>User Submission Pending</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                                Missing Certificate
                              </span>
                            )}
                          </td>

                          {/* Drive File Details */}
                          <td className="p-3.5">
                            {row.primaryFile ? (
                              <div className="space-y-0.5">
                                <span className="font-mono text-slate-800 font-semibold block text-xs">
                                  {row.primaryFile.name}
                                </span>
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  {row.primaryFile.size || '--'} · {row.primaryFile.createdTime ? new Date(row.primaryFile.createdTime).toLocaleDateString() : 'In Drive'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">No Drive file mapped</span>
                            )}
                          </td>

                          {/* Action Buttons (Sticky Right) */}
                          <td className="p-3.5 text-right sticky right-0 bg-white group-hover:bg-slate-50 transition-colors shadow-xs whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {row.primaryFile && (
                                <>
                                  <a
                                    href={row.primaryFile.webViewLink || apiUrl(`/api/drive/file/${row.primaryFile.id}`)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                    title="Preview in Google Drive"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleDownload(row.primaryFile!)}
                                    disabled={downloadingId === row.primaryFile.id}
                                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                    title="Download Certificate"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                </>
                              )}

                              {/* Upload or Replace button */}
                              <button
                                type="button"
                                onClick={() => handleOpenSingleUpload({ membershipNumber: row.membershipNumber, name: row.name })}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <Upload className="w-3 h-3" />
                                <span>{row.primaryFile ? 'Replace' : 'Upload'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: PENDING CERTIFICATE APPROVALS (USER WORKFLOW) */}
      {/* ========================================================================= */}
      {activeSubTab === 'pending_approvals' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-amber-50/70 border border-amber-300 rounded-3xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-amber-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-amber-950 text-base sm:text-lg flex items-center gap-2">
                    <span>User-Uploaded Certificates Pending Admin Approval</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200 text-amber-900 border border-amber-300">
                      {pendingCertificates.length} Awaiting Review
                    </span>
                  </h3>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Strict separation enforced: Admin uploads are finalized directly. Only user-submitted certificates require review.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={loadPendingCertificates}
                disabled={isLoadingPending}
                className="px-3.5 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPending ? 'animate-spin' : ''}`} />
                <span>Refresh Review Queue</span>
              </button>
            </div>

            {pendingCertificates.length === 0 ? (
              <div className="py-12 text-center text-amber-800 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-slate-800 text-sm">No Pending Approvals</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  All user-uploaded certificate submissions have been processed. New submissions from members will appear here for verification.
                </p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto bg-white rounded-2xl border border-amber-200">
                <table className="w-full text-left text-xs min-w-[850px] border-collapse">
                  <thead className="bg-amber-100/70 text-amber-950 font-bold border-b border-amber-200">
                    <tr>
                      <th className="p-3.5">Member Details</th>
                      <th className="p-3.5">Event / Workshop</th>
                      <th className="p-3.5">Drive File (ID Convention)</th>
                      <th className="p-3.5">Submission Date</th>
                      <th className="p-3.5">File Size</th>
                      <th className="p-3.5 text-right">Approval Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {pendingCertificates.map((cert) => {
                      const isProcessing = processingPendingId === cert.id;

                      return (
                        <tr key={cert.id} className="hover:bg-amber-50/40 transition-colors">
                          {/* Member Details */}
                          <td className="p-3.5">
                            <span className="font-bold text-slate-900 block">{cert.memberName || 'NMO Member'}</span>
                            <span className="font-mono text-xs text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200 inline-block mt-0.5">
                              {cert.membershipNumber}
                            </span>
                          </td>

                          {/* Event */}
                          <td className="p-3.5">
                            <span className="text-slate-800 font-semibold block">{cert.eventTitle || 'General Certificate'}</span>
                            {cert.eventId && (
                              <span className="text-[10px] text-slate-400 font-mono">ID: {cert.eventId}</span>
                            )}
                          </td>

                          {/* File Name */}
                          <td className="p-3.5">
                            <span className="font-mono text-slate-800 font-medium block truncate max-w-[200px]" title={cert.name}>
                              {cert.name}
                            </span>
                            <span className="text-[10px] text-amber-700 font-semibold block mt-0.5">
                              User Submission
                            </span>
                          </td>

                          {/* Date */}
                          <td className="p-3.5 font-mono text-slate-500">
                            {cert.createdTime ? new Date(cert.createdTime).toLocaleString() : 'Recently'}
                          </td>

                          {/* Size */}
                          <td className="p-3.5 font-mono text-slate-600">
                            {cert.size || '--'}
                          </td>

                          {/* Actions */}
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {/* Preview */}
                              {(cert.webViewLink || cert.id) && (
                                <a
                                  href={cert.webViewLink || apiUrl(`/api/drive/file/${cert.id}`)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Preview certificate file"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Preview</span>
                                </a>
                              )}

                              {/* Approve Button */}
                              <button
                                type="button"
                                onClick={() => handleApproveSubmission(cert)}
                                disabled={isProcessing}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                                title="Approve certificate submission"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{isProcessing ? 'Approving...' : 'Approve'}</span>
                              </button>

                              {/* Reject Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenRejectModal(cert)}
                                disabled={isProcessing}
                                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
                                title="Reject and remove from Google Drive"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: GOOGLE DRIVE EXPLORER */}
      {/* ========================================================================= */}
      {activeSubTab === 'drive_explorer' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Google Drive Explorer & Hierarchy</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  View raw certificate repository files and subfolders under <strong>{NMO_ROOT_DRIVE_FOLDER_NAME}</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(true)}
                  className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FolderPlus className="w-4 h-4 text-amber-700" />
                  <span>+ Create Subfolder</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleScanFolder(activeFolderId);
                  }}
                  disabled={isLoadingFiles}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                  <span>Scan Drive Files</span>
                </button>
              </div>
            </div>

            {/* Subfolders list */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <button
                type="button"
                onClick={() => {
                  setActiveFolderId(NMO_ROOT_DRIVE_FOLDER_ID);
                  handleScanFolder(NMO_ROOT_DRIVE_FOLDER_ID);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors ${
                  activeFolderId === NMO_ROOT_DRIVE_FOLDER_ID
                    ? 'bg-red-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                📁 All Folders / Root
              </button>

              {eventSubfolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setActiveFolderId(f.id);
                    handleScanFolder(f.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors ${
                    activeFolderId === f.id
                      ? 'bg-red-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  ↳ {f.name}
                </button>
              ))}
            </div>

            {/* Files Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[450px]">
                <table className="w-full text-left text-xs min-w-[700px] border-collapse">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-3.5">Membership ID</th>
                      <th className="p-3.5">File Name & Event</th>
                      <th className="p-3.5">Size</th>
                      <th className="p-3.5">Source & Approval</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {driveFiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">
                          Click "Scan Drive Files" above to query Google Drive files.
                        </td>
                      </tr>
                    ) : (
                      driveFiles.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50">
                          <td className="p-3.5">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300">
                              {f.membershipNumber || 'Unassigned'}
                            </span>
                          </td>
                          <td className="p-3.5 font-semibold text-slate-900">{f.name}</td>
                          <td className="p-3.5 font-mono text-slate-500">{f.size || '--'}</td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {f.uploadSource === 'user' ? 'User Upload' : 'Admin Upload'}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {f.webViewLink && (
                                <a
                                  href={f.webViewLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                                >
                                  <Eye className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDownload(f)}
                                className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* BULK UPLOAD MODAL */}
      {/* ----------------------------------------------------------------------- */}
      {showBulkUploadModal && selectedEvent && eventFolderInfo.folder && (
        <BulkCertificateUploadModal
          isOpen={showBulkUploadModal}
          onClose={() => setShowBulkUploadModal(false)}
          event={selectedEvent}
          eventFolder={eventFolderInfo.folder}
          participants={eventParticipants}
          allMembers={users}
          existingFiles={eventDriveFiles.map((f) => ({
            id: f.id,
            name: f.name,
            membershipNumber: f.membershipNumber || ''
          }))}
          onUploadComplete={() => {
            if (eventFolderInfo.folder) {
              loadEventFolderFiles(eventFolderInfo.folder.id);
            }
          }}
        />
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* SINGLE CERTIFICATE UPLOAD MODAL */}
      {/* ----------------------------------------------------------------------- */}
      {showSingleUploadModal && selectedEvent && eventFolderInfo.folder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-red-700" />
                <h3 className="font-bold text-slate-900 text-base">
                  Upload Certificate for Member
                </h3>
              </div>
              <button
                onClick={() => setShowSingleUploadModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteSingleUpload} className="space-y-4 text-xs">
              {/* Event Folder Info */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950">
                <span className="font-bold block">Destination Google Drive Folder:</span>
                <span className="font-mono text-[11px] block mt-0.5">
                  NMO Gujarat → Events → {eventFolderInfo.folder.name}
                </span>
              </div>

              {/* Member Selector / Confirmation */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Target Member *
                </label>
                {singleUploadTargetMember ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 block">{singleUploadTargetMember.name}</span>
                      <span className="font-mono text-red-700 font-bold text-xs">{singleUploadTargetMember.membershipNumber}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSingleUploadTargetMember(null)}
                      className="text-xs text-slate-400 hover:text-slate-700 underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <select
                    onChange={(e) => {
                      const found = eventParticipants.find((p) => p.membershipNumber === e.target.value);
                      if (found) {
                        setSingleUploadTargetMember({
                          membershipNumber: found.membershipNumber,
                          name: found.name
                        });
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-medium"
                    defaultValue=""
                  >
                    <option value="" disabled>-- Select Event Participant --</option>
                    {eventParticipants.map((p) => (
                      <option key={p.membershipNumber} value={p.membershipNumber}>
                        {p.name} ({p.membershipNumber})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* File input */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Certificate File (PDF, JPG, PNG) *
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,application/pdf,image/jpeg,image/png,image/jpg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSingleUploadFile(e.target.files[0]);
                      setSingleUploadConflict(null);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer border border-slate-200 rounded-xl p-2 bg-slate-50"
                />
                {singleUploadFile && singleUploadTargetMember && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Will be saved as: <code className="font-mono font-bold text-slate-800">{singleUploadTargetMember.membershipNumber}.{singleUploadFile.name.split('.').pop()?.toLowerCase()}</code>
                  </p>
                )}
              </div>

              {/* Conflict warning & overwrite checkbox */}
              {singleUploadConflict?.conflict && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>File Already Exists in Drive:</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    A certificate named <strong>"{singleUploadConflict.existingFileName}"</strong> already exists in this event folder. To prevent accidental overwrite, please confirm below.
                  </p>
                  <label className="flex items-center gap-2 font-bold cursor-pointer text-xs pt-1">
                    <input
                      type="checkbox"
                      checked={singleOverwriteConfirmed}
                      onChange={(e) => setSingleOverwriteConfirmed(e.target.checked)}
                      className="rounded text-amber-700"
                    />
                    <span>Yes, overwrite existing certificate in Drive</span>
                  </label>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSingleUploadModal(false)}
                  disabled={isSingleUploading}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSingleUploading || !singleUploadFile || !singleUploadTargetMember || (singleUploadConflict?.conflict && !singleOverwriteConfirmed)}
                  className="px-5 py-2.5 bg-red-700 hover:bg-red-800 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isSingleUploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading to Drive...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>{singleUploadConflict?.conflict ? 'Confirm Overwrite & Upload' : 'Upload to Event Folder'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* REJECTION REASON MODAL */}
      {/* ----------------------------------------------------------------------- */}
      {rejectModalCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 text-rose-700 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-700 flex items-center justify-center font-bold">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Reject Certificate Submission</h3>
                <span className="text-xs text-slate-500">
                  Member: {rejectModalCert.memberName} ({rejectModalCert.membershipNumber})
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Rejecting this submission will permanently delete the unapproved file from Google Drive and mark the status as <strong>"rejected"</strong> in the member's portal.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rejection Reason (Optional, displayed to the member):
              </label>
              <textarea
                value={rejectionReasonText}
                onChange={(e) => setRejectionReasonText(e.target.value)}
                placeholder="e.g. Image unreadable, wrong event certificate, or signature missing..."
                rows={3}
                className="w-full p-3 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-rose-600 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRejectModalCert(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRejection}
                disabled={Boolean(processingPendingId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Rejection & Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* DRIVE INTEGRATION GUIDE MODAL */}
      {/* ----------------------------------------------------------------------- */}
      <DriveIntegrationGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        initialTab={guideInitialTab}
        onConnectNow={handleConnect}
      />
    </div>
  );
};
