import React, { useState, useEffect } from 'react';
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
  NMO_ROOT_DRIVE_FOLDER_ID,
  NMO_ROOT_DRIVE_FOLDER_NAME,
  NMO_ROOT_DRIVE_URL,
  DriveCertificateFile,
  DriveFolderInfo,
  SavedDriveSession
} from '../../lib/googleDrive';
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
  Zap
} from 'lucide-react';

export const AdminCertificatesManager: React.FC = () => {
  const { users, events, createEventDriveSubfolder } = useNMO();

  const [savedAccount, setSavedAccount] = useState<SavedDriveSession | null>(getSavedDriveAccount());
  const [tokenHealth, setTokenHealth] = useState<'checking' | 'valid' | 'expired' | 'none'>('checking');
  const [isConnected, setIsConnected] = useState<boolean>(Boolean(getDriveAccessToken()));
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [activeFolderId, setActiveFolderId] = useState<string>(NMO_ROOT_DRIVE_FOLDER_ID);
  const [eventSubfolders, setEventSubfolders] = useState<DriveFolderInfo[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveCertificateFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [targetMemNo, setTargetMemNo] = useState('');
  const [targetEventId, setTargetEventId] = useState('');
  const [targetEventTitle, setTargetEventTitle] = useState('');
  const [targetUploadFolderId, setTargetUploadFolderId] = useState(NMO_ROOT_DRIVE_FOLDER_ID);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Create Subfolder Modal State
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  useEffect(() => {
    const initDrive = async () => {
      // 1. Attempt to restore persistent session from backend first
      const backendSession = await restoreDriveSessionFromBackend();
      const active = backendSession?.accessToken || getDriveAccessToken();
      const saved = backendSession || getSavedDriveAccount();

      setSavedAccount(saved);
      setIsConnected(Boolean(active));

      if (active) {
        setTokenHealth('checking');
        const health = await checkDriveTokenHealth(active);
        if (health.valid) {
          setTokenHealth('valid');
        } else {
          // Token info check failed, try auto-refreshing via backend
          const refreshed = await ensureDriveAccessToken(true);
          if (refreshed) {
            setTokenHealth('valid');
            setIsConnected(true);
          } else {
            setTokenHealth('expired');
          }
        }
      } else {
        setTokenHealth('none');
      }

      await handleScanFolder();
    };

    initDrive();
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    setFeedback(null);
    try {
      const res = await connectGoogleDrive();
      setIsConnected(true);
      setSavedAccount(res.session);
      setTokenHealth('valid');
      await loadSubfolders();
      await handleScanFolder();
      setFeedback({
        message: `Connected & saved Google Drive login for ${res.session.accountEmail}! All certificate data and event subfolders will be auto-stored in the ${NMO_ROOT_DRIVE_FOLDER_NAME} Mega Folder.`,
        type: 'success'
      });
    } catch (err: any) {
      setFeedback({
        message: err.message || 'Failed to connect with Google Drive.',
        type: 'error'
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect this Google Drive account?')) return;
    await disconnectGoogleDrive();
    setIsConnected(false);
    setSavedAccount(null);
    setTokenHealth('none');
    setFeedback({
      message: 'Google Drive account disconnected from this session.',
      type: 'success'
    });
  };

  const loadSubfolders = async () => {
    try {
      const folders = await listEventSubfoldersInDrive();
      setEventSubfolders(folders);
    } catch (err) {
      console.warn('Could not load subfolders:', err);
    }
  };

  const handleScanFolder = async (folderIdToScan = activeFolderId) => {
    setIsLoadingFiles(true);
    setFeedback(null);
    try {
      const files = await listCertificatesInFolder(
        folderIdToScan === NMO_ROOT_DRIVE_FOLDER_ID ? undefined : folderIdToScan
      );
      setDriveFiles(files);
      if (getDriveAccessToken()) {
        await loadSubfolders();
      }
      setFeedback({
        message: `Scanned NMO Gujarat repository. Located ${files.length} certificate file(s).`,
        type: 'success'
      });
    } catch (err: any) {
      setFeedback({
        message: err.message || 'Failed to scan files from Google Drive.',
        type: 'error'
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleCreateSubfolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    setFeedback(null);
    try {
      const folder = await createEventSubfolderInDrive(newFolderName.trim());
      setFeedback({
        message: `Created event subfolder "${folder.name}" inside NMO Gujarat Mega Folder!`,
        type: 'success'
      });
      setShowCreateFolderModal(false);
      setNewFolderName('');
      await loadSubfolders();
    } catch (err: any) {
      setFeedback({
        message: err.message || 'Failed to create subfolder.',
        type: 'error'
      });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleUploadForMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setFeedback({ message: 'Please select a certificate file to upload.', type: 'error' });
      return;
    }
    const cleanNo = targetMemNo.trim().toUpperCase();
    if (!cleanNo) {
      setFeedback({ message: 'Please provide a valid Membership Number.', type: 'error' });
      return;
    }

    const matchedUser = users.find((u) => u.membershipNumber.toUpperCase() === cleanNo);
    const chosenEvent = events.find((evt) => evt.eventId === targetEventId);
    const eventTitle = chosenEvent?.title || targetEventTitle || 'NMO Event Certificate';

    setIsUploading(true);
    setFeedback(null);
    try {
      const uploaded = await uploadCertificateToDrive(selectedFile, {
        membershipNumber: cleanNo,
        memberName: matchedUser?.name || 'NMO Member',
        eventId: targetEventId || undefined,
        eventTitle,
        targetFolderId: targetUploadFolderId || NMO_ROOT_DRIVE_FOLDER_ID
      });

      setFeedback({
        message: `Assigned and stored certificate "${uploaded.name}" for member ${cleanNo} into NMO Gujarat Drive!`,
        type: 'success'
      });
      setShowUploadModal(false);
      setSelectedFile(null);
      setTargetMemNo('');
      setTargetEventId('');
      setTargetEventTitle('');
      await handleScanFolder();
    } catch (err: any) {
      setFeedback({
        message: err.message || 'Failed to upload certificate to Google Drive.',
        type: 'error'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (file: DriveCertificateFile) => {
    setDownloadingId(file.id);
    try {
      await downloadDriveCertificate(file.id, file.name);
    } catch (err: any) {
      alert(err.message || 'Failed to download certificate.');
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredFiles = driveFiles.filter((f) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      (f.membershipNumber || '').toLowerCase().includes(q) ||
      (f.eventTitle || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Master Mega Folder Capsule */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-amber-600 text-white flex items-center justify-center font-bold shadow-md shrink-0">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-900">
                  Google Drive Certificate Vault
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                  {NMO_ROOT_DRIVE_FOLDER_NAME} Mega Folder
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Centralized Google Drive repository for all NMO Gujarat certificates. All member files and event subfolders are stored in your single root drive folder (ID: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono">{NMO_ROOT_DRIVE_FOLDER_ID}</code>).
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <a
              href={NMO_ROOT_DRIVE_URL}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            >
              <FolderOpen className="w-4 h-4 text-amber-600" />
              <span>Open Mega Folder in Drive</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            {isConnected ? (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Central Drive Connected</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="px-3.5 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload & Assign Certificate</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold text-xs rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isConnecting ? 'Connecting...' : 'Authorize Google Drive'}</span>
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 p-4 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
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

        {/* Persistent Saved Drive Login Status Capsule */}
        <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              tokenHealth === 'valid'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : tokenHealth === 'expired'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-slate-200 text-slate-700'
            }`}>
              {tokenHealth === 'valid' ? (
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
              ) : tokenHealth === 'expired' ? (
                <AlertCircle className="w-5 h-5 text-amber-700" />
              ) : (
                <FolderOpen className="w-5 h-5 text-slate-600" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-xs text-slate-900">
                  {savedAccount ? `Saved Drive Login: ${savedAccount.accountEmail}` : 'Central Google Drive Storage'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  tokenHealth === 'valid'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : tokenHealth === 'expired'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {tokenHealth === 'valid'
                    ? 'Active Session'
                    : tokenHealth === 'expired'
                    ? 'Session Expired (Needs Refresh)'
                    : 'Not Connected'}
                </span>

                {savedAccount && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    savedAccount.hasRefreshToken
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    {savedAccount.hasRefreshToken
                      ? '✓ Server Refresh Token Secured (Auto-Renews 24/7)'
                      : '⚠ Refresh Token Absent (Token Expires in ~1 hr)'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {savedAccount?.hasRefreshToken
                  ? 'Your long-lived Google OAuth refresh token is stored securely in backend server storage. Certificates will be uploaded seamlessly without re-prompting.'
                  : tokenHealth === 'valid'
                  ? 'Active session restored. For permanent 24/7 silent token auto-renewal, authorize offline access with the button to the right.'
                  : tokenHealth === 'expired'
                  ? 'The saved Google access token has timed out. Click Reconnect below to refresh credentials in one click.'
                  : 'Connect your administrator Google Drive account once to save it for all future certificate and event workflows.'}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-2">
            {savedAccount && !savedAccount.hasRefreshToken && (
              <button
                type="button"
                onClick={async () => {
                  setIsConnecting(true);
                  try {
                    const session = await connectGoogleDriveViaServerOAuth();
                    setSavedAccount(session);
                    setIsConnected(true);
                    setTokenHealth('valid');
                    setFeedback({
                      message: `Offline refresh token successfully secured on backend for ${session.accountEmail}!`,
                      type: 'success'
                    });
                  } catch (e: any) {
                    setFeedback({ message: e.message || 'OAuth authorization was cancelled.', type: 'error' });
                  } finally {
                    setIsConnecting(false);
                  }
                }}
                disabled={isConnecting}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                title="Request offline access and obtain long-lived refresh token"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Authorize Offline Refresh Token</span>
              </button>
            )}

            {savedAccount && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const check = await checkDriveTokenHealth();
                    if (check.valid) {
                      setTokenHealth('valid');
                      alert(`Google Drive token is active and valid for ${check.email}!`);
                    } else {
                      setTokenHealth('expired');
                      alert(`Token check failed: ${check.error}. Please click Reconnect.`);
                    }
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Verify token with Google TokenInfo"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Test Token</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const result = await testServerTokenRefresh();
                    if (result.success) {
                      setTokenHealth('valid');
                      alert(`Auto-Refresh Test Successful!\n${result.message}\nNew validity window: ${result.newExpiresInSeconds}s`);
                    } else {
                      alert(`Auto-Refresh Test Note:\n${result.message}`);
                    }
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Simulate token expiry and test backend refresh token auto-renewal"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Test Auto-Refresh</span>
                </button>
              </>
            )}

            {tokenHealth === 'expired' || !isConnected ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isConnecting ? 'Connecting...' : 'Authorize Google Drive'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-3 py-1.5 bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            )}
          </div>
        </div>

        {/* OAuth Callback Registration Capsule */}
        <div className="mt-3 px-4 py-2.5 rounded-xl bg-slate-100/80 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="font-bold text-slate-700 shrink-0">Exact OAuth Redirect URI:</span>
            <code className="bg-white px-2 py-0.5 rounded border border-slate-200 text-indigo-700 font-mono select-all truncate">
              {savedAccount?.redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/api/auth/google/callback` : '/api/auth/google/callback')}
            </code>
          </div>
          <button
            type="button"
            onClick={() => {
              const uri = savedAccount?.redirectUri || `${window.location.origin}/api/auth/google/callback`;
              navigator.clipboard?.writeText(uri);
              alert(`Copied Redirect URI to clipboard:\n${uri}`);
            }}
            className="shrink-0 text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer transition-colors"
          >
            Copy Redirect URI
          </button>
        </div>

        {/* Mega Folder & Subfolders Navigation Strip */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700">Subfolders in {NMO_ROOT_DRIVE_FOLDER_NAME}:</span>
            <button
              onClick={() => {
                setActiveFolderId(NMO_ROOT_DRIVE_FOLDER_ID);
                handleScanFolder(NMO_ROOT_DRIVE_FOLDER_ID);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                activeFolderId === NMO_ROOT_DRIVE_FOLDER_ID
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              All Certificates (Root + Subfolders)
            </button>
            {eventSubfolders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => {
                  setActiveFolderId(folder.id);
                  handleScanFolder(folder.id);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                  activeFolderId === folder.id
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
                }`}
              >
                <FolderOpen className="w-3 h-3 text-amber-600" />
                <span>{folder.name}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isConnected && (
              <button
                type="button"
                onClick={() => setShowCreateFolderModal(true)}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-amber-700" />
                <span>+ New Event Subfolder</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleScanFolder()}
              disabled={isLoadingFiles}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              <span>Scan Drive</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Files Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Search bar & filter info */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Membership ID (e.g. 231112001791), member name, event..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden bg-white"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing {filteredFiles.length} of {driveFiles.length} Certificate Files in Drive
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Assigned Membership ID</th>
                <th className="p-3.5">File Name & Event</th>
                <th className="p-3.5">Subfolder in Drive</th>
                <th className="p-3.5">File Size</th>
                <th className="p-3.5">Uploaded Date</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingFiles ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-red-700 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Scanning NMO Gujarat Google Drive repository...
                  </td>
                </tr>
              ) : filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    No certificates located in Google Drive yet. Use "Upload & Assign Certificate" above to upload certificates into NMO Gujarat folder.
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => {
                  return (
                    <tr key={file.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5">
                        {file.membershipNumber ? (
                          <span className="font-mono font-bold text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-md">
                            {file.membershipNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">Unassigned</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900">{file.name}</div>
                        {file.eventTitle && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{file.eventTitle}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-amber-50 text-amber-900 border border-amber-200">
                          <FolderOpen className="w-3 h-3 text-amber-600" />
                          <span>{file.driveFolderName || NMO_ROOT_DRIVE_FOLDER_NAME}</span>
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-600 font-mono">{file.size || '--'}</td>
                      <td className="p-3.5 text-slate-500">
                        {file.createdTime ? new Date(file.createdTime).toLocaleDateString() : '--'}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="Preview in Google Drive"
                            >
                              <Eye className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDownload(file)}
                            disabled={downloadingId === file.id}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                            title="Download Certificate File"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{downloadingId === file.id ? 'Downloading...' : 'Download'}</span>
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

      {/* Upload & Assign Certificate Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-red-700" />
                <h3 className="font-bold text-slate-900 text-base">
                  Upload Certificate to NMO Gujarat Drive
                </h3>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadForMember} className="space-y-4 text-xs">
              {/* Target Drive Folder */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Destination Google Drive Folder *
                </label>
                <select
                  value={targetUploadFolderId}
                  onChange={(e) => setTargetUploadFolderId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-medium"
                >
                  <option value={NMO_ROOT_DRIVE_FOLDER_ID}>
                    📁 {NMO_ROOT_DRIVE_FOLDER_NAME} (Root Mega Folder)
                  </option>
                  {eventSubfolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      ↳ Subfolder: {f.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Membership Number */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Member's Membership Number (Required) *
                </label>
                <input
                  type="text"
                  required
                  value={targetMemNo}
                  onChange={(e) => setTargetMemNo(e.target.value)}
                  placeholder="e.g. 231112001791"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono uppercase bg-slate-50"
                />
              </div>

              {/* Event Link */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Associated NMO Event (Optional)
                </label>
                <select
                  value={targetEventId}
                  onChange={(e) => {
                    setTargetEventId(e.target.value);
                    const selected = events.find((ev) => ev.eventId === e.target.value);
                    if (selected) {
                      setTargetEventTitle(selected.title);
                      if (selected.driveFolderId) {
                        setTargetUploadFolderId(selected.driveFolderId);
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-medium"
                >
                  <option value="">-- General / Non-Event Certificate --</option>
                  {events.map((evt) => (
                    <option key={evt.eventId} value={evt.eventId}>
                      {evt.title} ({evt.city})
                    </option>
                  ))}
                </select>
              </div>

              {/* File input */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Certificate File (PDF / Image) *
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer border border-slate-200 rounded-xl p-2 bg-slate-50"
                />
                {selectedFile && (
                  <p className="mt-1 text-[11px] text-emerald-600 font-mono">
                    ✓ {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Uploading to Drive...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload & Assign</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Event Subfolder Modal */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  New Event Subfolder in NMO Gujarat
                </h3>
              </div>
              <button
                onClick={() => setShowCreateFolderModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubfolder} className="space-y-4 text-xs">
              <p className="text-slate-500">
                This will generate a new subfolder under your Master Mega Folder (<strong>{NMO_ROOT_DRIVE_FOLDER_NAME}</strong>) in Google Drive.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Event Subfolder Name *
                </label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. State CME Conference 2026 - Ahmedabad"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-medium"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFolder}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isCreatingFolder ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creating in Drive...</span>
                    </>
                  ) : (
                    <>
                      <FolderPlus className="w-4 h-4" />
                      <span>Create Subfolder</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
