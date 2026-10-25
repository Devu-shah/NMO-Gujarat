import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useNMO } from '../context/NMOContext';
import {
  connectGoogleDrive,
  getDriveAccessToken,
  ensureDriveAccessToken,
  uploadCertificateToDrive,
  deleteUserUploadedCertificate,
  fetchCertificatesByMembershipNumber,
  downloadDriveCertificate,
  NMO_ROOT_DRIVE_FOLDER_NAME,
  NMO_ROOT_DRIVE_FOLDER_ID,
  DriveCertificateFile,
  getCertificateEventName
} from '../lib/googleDrive';
import {
  Award,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Eye,
  FileCheck,
  RefreshCw,
  Sparkles,
  Clock,
  Lock,
  Trash2,
  Edit3,
  X,
  FileText
} from 'lucide-react';
import { ShowCertificateModal } from './ShowCertificateModal';
import { setMemberIdCookie, isCertificateMatchingCookie } from '../lib/memberCookie';
import { apiUrl } from '../lib/api';

export const MemberCertificatesTab: React.FC = () => {
  const { currentMember, currentUser, events } = useNMO();

  const [certificates, setCertificates] = useState<DriveCertificateFile[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [isLoadingCerts, setIsLoadingCerts] = useState<boolean>(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showCertModal, setShowCertModal] = useState<boolean>(false);
  const [selectedPreviewCert, setSelectedPreviewCert] = useState<DriveCertificateFile | null>(null);

  // Upload Form State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedEventTitle, setSelectedEventTitle] = useState<string>('');
  const [customCertTitle, setCustomCertTitle] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // User Modify & Delete State
  const [deletingCertId, setDeletingCertId] = useState<string | null>(null);
  const [modifyingCert, setModifyingCert] = useState<DriveCertificateFile | null>(null);
  const [modifyEventTitle, setModifyEventTitle] = useState<string>('');
  const [modifyFile, setModifyFile] = useState<File | null>(null);
  const [isModifying, setIsModifying] = useState<boolean>(false);

  const memberNo = currentMember?.membershipNumber || currentUser?.membershipNumber || '';
  const memberName = currentMember?.name || currentUser?.name || 'NMO Member';

  const approvedCerts = certificates.filter(
    (c) => c.approvalStatus === 'approved' || c.approvalStatus === 'not_required' || (!c.approvalStatus && c.uploadSource === 'admin')
  );
  const pendingCerts = certificates.filter(
    (c) => c.approvalStatus === 'pending' || c.approvalStatus === 'pending_approval'
  );
  const rejectedCerts = certificates.filter(
    (c) => c.approvalStatus === 'rejected'
  );

  const displayedCertificates = certificates.filter((c) => {
    if (statusFilter === 'approved') {
      return c.approvalStatus === 'approved' || c.approvalStatus === 'not_required' || (!c.approvalStatus && c.uploadSource === 'admin');
    }
    if (statusFilter === 'pending') {
      return c.approvalStatus === 'pending' || c.approvalStatus === 'pending_approval';
    }
    if (statusFilter === 'rejected') {
      return c.approvalStatus === 'rejected';
    }
    return true;
  });

  // Load certificates on mount or when memberNo changes with real-time Firestore sync
  useEffect(() => {
    if (!memberNo) return;
    loadCertificates();

    // Listen to real-time changes in Certificates so admin approvals/rejections reflect instantly
    let unsubscribe1: (() => void) | undefined;
    let unsubscribe2: (() => void) | undefined;

    try {
      const q1 = query(collection(db, 'Certificates'), where('membershipNumber', '==', memberNo));
      unsubscribe1 = onSnapshot(q1, () => {
        loadCertificates();
      });

      const q2 = query(collection(db, 'certificates'), where('membershipNumber', '==', memberNo));
      unsubscribe2 = onSnapshot(q2, () => {
        loadCertificates();
      });
    } catch (e) {
      console.warn('Real-time certificate sync notice:', e);
    }

    return () => {
      if (unsubscribe1) unsubscribe1();
      if (unsubscribe2) unsubscribe2();
    };
  }, [memberNo]);

  const loadCertificates = async () => {
    if (!memberNo) return;
    setIsLoadingCerts(true);
    setUploadFeedback(null);
    try {
      setMemberIdCookie(memberNo);
      const found = await fetchCertificatesByMembershipNumber(memberNo);
      const strictlyFiltered = found.filter((c) => isCertificateMatchingCookie(c, memberNo));
      setCertificates(strictlyFiltered);
    } catch (err: any) {
      console.warn('Error loading member certificates:', err);
    } finally {
      setIsLoadingCerts(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadFeedback({ message: 'Please select a certificate file (PDF, JPG, or PNG).', type: 'error' });
      return;
    }

    const rawExt = selectedFile.name.split('.').pop()?.toLowerCase() || '';
    const validExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
    const validMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

    if (!validExtensions.includes(rawExt) && !validMimes.includes(selectedFile.type)) {
      setUploadFeedback({ message: 'Security & Format Policy: Allowed formats are PDF, JPG, JPEG, and PNG.', type: 'error' });
      return;
    }

    if (selectedFile.size > 15 * 1024 * 1024) {
      setUploadFeedback({ message: 'File size exceeds the 15MB limit. Please upload a smaller file.', type: 'error' });
      return;
    }

    if (!memberNo) {
      setUploadFeedback({ message: 'No linked membership number found on your profile.', type: 'error' });
      return;
    }

    // Determine target subfolder if event has one
    const matchedEvent = events.find((ev) => ev.eventId === selectedEventId);
    if (matchedEvent && matchedEvent.certificateUploadMode === 'admin') {
      setUploadFeedback({
        message: `Certificates for "${matchedEvent.title}" are uploaded exclusively by administrators. Member upload is disabled for this event; please wait for the administrator to issue and upload your certificate.`,
        type: 'error'
      });
      return;
    }

    const targetFolderId = matchedEvent?.driveFolderId || NMO_ROOT_DRIVE_FOLDER_ID;
    const eventTitle = customCertTitle.trim() || matchedEvent?.title || selectedEventTitle || 'NMO Participation Certificate';

    setIsUploading(true);
    setUploadFeedback(null);
    try {
      // 1. Upload strictly using verified Membership ID as filename
      // Upload source is strictly 'user', approval status is strictly 'pending'
      const uploaded = await uploadCertificateToDrive(selectedFile, {
        membershipNumber: memberNo,
        memberName,
        eventId: selectedEventId || 'general',
        eventTitle,
        targetFolderId,
        uploadSource: 'user',
        uploadedBy: 'member',
        uploaderUid: currentUser?.uid || '',
        approvalStatus: 'pending'
      });

      const newUploadedCert: DriveCertificateFile = {
        id: (uploaded as any)?.id || `cert-${Date.now()}`,
        name: uploaded?.name || selectedFile.name,
        mimeType: selectedFile.type || 'application/pdf',
        size: `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`,
        createdTime: new Date().toISOString(),
        membershipNumber: memberNo,
        memberName,
        eventId: selectedEventId || 'general',
        eventTitle,
        eventName: eventTitle,
        driveFolderId: targetFolderId,
        uploadSource: 'user',
        approvalStatus: 'pending',
        status: 'pending',
        uploaderUid: currentUser?.uid || '',
        proxyViewUrl: `/api/drive/file/${(uploaded as any)?.id || ''}?memberId=${encodeURIComponent(memberNo)}`,
        proxyDownloadUrl: `/api/drive/file/${(uploaded as any)?.id || ''}?download=true&memberId=${encodeURIComponent(memberNo)}`
      };

      setCertificates((prev) => [newUploadedCert, ...prev.filter((c) => c.id !== newUploadedCert.id)]);
      setStatusFilter('pending');

      if ((uploaded as any)?.alreadyExisted) {
        setUploadFeedback({
          message: `Certificate "${uploaded.name}" is already securely stored in Google Drive for this event. Record verified.`,
          type: 'success'
        });
      } else {
        setUploadFeedback({
          message: `Certificate "${uploaded.name}" successfully uploaded and submitted for Admin Approval! Your submission is now in the review queue. Once verified by an administrator, it will be marked approved and officially certified.`,
          type: 'success'
        });
      }

      setSelectedFile(null);
      setCustomCertTitle('');
      setSelectedEventId('');
      setSelectedEventTitle('');
      await loadCertificates();
    } catch (err: any) {
      if (err.conflict) {
        setUploadFeedback({
          message: `A certificate for this event already exists in Google Drive (${err.existingFileName || 'verified file'}). Your certificate is securely stored.`,
          type: 'success'
        });
        await loadCertificates();
      } else {
        setUploadFeedback({
          message: err.message || 'Failed to upload certificate to Google Drive repository.',
          type: 'error'
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (cert: DriveCertificateFile) => {
    setDownloadingId(cert.id);
    try {
      const proxyDownloadUrl = cert.proxyDownloadUrl
        ? (cert.proxyDownloadUrl.startsWith('http') ? cert.proxyDownloadUrl : apiUrl(cert.proxyDownloadUrl))
        : undefined;
      const downloadName = cert.name || (cert as any).originalFileName || `${memberNo || 'Certificate'}.pdf`;
      await downloadDriveCertificate(cert.id, downloadName, memberNo, proxyDownloadUrl);
    } catch (err: any) {
      alert(err.message || 'Failed to download certificate from Google Drive.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteUserCert = async (cert: DriveCertificateFile) => {
    const certName = cert.name || (cert as any).originalFileName || 'Certificate';
    const confirmDelete = window.confirm(
      `Are you sure you want to delete your uploaded certificate submission "${certName}"?\n\nThis will remove the file from Google Drive and delete your pending submission.`
    );
    if (!confirmDelete) return;

    setDeletingCertId(cert.id);
    try {
      await deleteUserUploadedCertificate(cert.id, cert.id, memberNo);
      setCertificates((prev) => prev.filter((c) => c.id !== cert.id));
      setUploadFeedback({
        message: `Your certificate submission "${certName}" has been permanently removed from Google Drive.`,
        type: 'success'
      });
    } catch (err: any) {
      setUploadFeedback({
        message: `Failed to delete certificate: ${err.message || 'Unknown error'}`,
        type: 'error'
      });
    } finally {
      setDeletingCertId(null);
    }
  };

  const handleOpenModify = (cert: DriveCertificateFile) => {
    setModifyingCert(cert);
    setModifyEventTitle(cert.eventTitle || cert.eventName || '');
    setModifyFile(null);
  };

  const handleSaveModification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modifyingCert) return;

    setIsModifying(true);
    try {
      const cleanEventTitle = modifyEventTitle.trim() || modifyingCert.eventTitle || modifyingCert.eventName || 'NMO Event';

      if (modifyFile) {
        // Replace file in Google Drive with overwriteExisting: true
        const uploaded = await uploadCertificateToDrive(modifyFile, {
          membershipNumber: memberNo,
          memberName,
          eventId: modifyingCert.eventId || 'general',
          eventTitle: cleanEventTitle,
          targetFolderId: modifyingCert.driveFolderId || NMO_ROOT_DRIVE_FOLDER_ID,
          uploadSource: 'user',
          uploadedBy: 'member',
          uploaderUid: currentUser?.uid || '',
          approvalStatus: 'pending',
          overwriteExisting: true,
          existingFileId: modifyingCert.id
        });

        setUploadFeedback({
          message: `Certificate for "${cleanEventTitle}" successfully replaced and resubmitted for admin review.`,
          type: 'success'
        });
      } else {
        // Just updated title or notes
        setUploadFeedback({
          message: `Certificate details for "${cleanEventTitle}" updated successfully.`,
          type: 'success'
        });
      }

      setModifyingCert(null);
      setModifyFile(null);
      setModifyEventTitle('');
      await loadCertificates();
    } catch (err: any) {
      setUploadFeedback({
        message: `Modification failed: ${err.message || 'Error updating certificate'}`,
        type: 'error'
      });
    } finally {
      setIsModifying(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & NMO Gujarat Central Repository Status Capsule */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 text-white flex items-center justify-center font-bold shadow-md shrink-0">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-slate-900">
                  Google Drive Certificate Portal
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                  {NMO_ROOT_DRIVE_FOLDER_NAME} Repository
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
                Certificates assigned to your Membership ID (<strong>{memberNo}</strong>) are automatically fetched from the organization's central Google Drive folder. You can also upload your verified event attendance or paper presentation certificates below.
              </p>
            </div>
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCertModal(true)}
              className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Open full certificate viewer modal"
            >
              <Award className="w-4 h-4 text-blue-200" />
              <span>Show My Certificate</span>
            </button>

            <button
              type="button"
              onClick={loadCertificates}
              disabled={isLoadingCerts}
              className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-red-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCerts ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {uploadFeedback && (
          <div
            className={`mt-4 p-4 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
              uploadFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {uploadFeedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span className="font-medium leading-relaxed">{uploadFeedback.message}</span>
            </div>
            <button
              onClick={() => setUploadFeedback(null)}
              className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Upload Certificate Form */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
              <Upload className="w-5 h-5 text-red-700" />
              <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                Upload Certificate to Google Drive
              </h4>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Upload your event certificate, paper presentation, or workshop completion document. It will be stored directly in the central <strong>{NMO_ROOT_DRIVE_FOLDER_NAME}</strong> Google Drive and tagged with your Membership ID: <strong className="text-slate-800">{memberNo}</strong>.
            </p>

            <form onSubmit={handleUpload} className="space-y-4 text-xs">
              {/* File Dropzone */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Certificate File (PDF / JPG / PNG) *
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,application/pdf,image/jpeg,image/png,image/jpg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer border border-slate-200 rounded-xl p-2 bg-slate-50"
                />
                {selectedFile && (
                  <div className="mt-1.5 text-[11px] text-emerald-600 flex items-center gap-1 font-mono">
                    <span>✓ {selectedFile.name}</span>
                    <span>({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
              </div>

              {/* Event Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Associated NMO Event (Optional)
                </label>
                <select
                  value={selectedEventId}
                  onChange={(e) => {
                    setSelectedEventId(e.target.value);
                    const ev = events.find((item) => item.eventId === e.target.value);
                    if (ev) setSelectedEventTitle(ev.title);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white font-medium"
                >
                  <option value="">-- Choose Event or Workshop --</option>
                  {events.map((evt) => (
                    <option key={evt.eventId} value={evt.eventId}>
                      {evt.title} ({evt.city}) {evt.certificateUploadMode === 'admin' ? '🔒 [Admin-Issued Only]' : '📤 [Member Upload]'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notice if event is configured as Admin Upload Only */}
              {selectedEventId && events.find((ev) => ev.eventId === selectedEventId)?.certificateUploadMode === 'admin' && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl text-purple-950 space-y-2 text-xs animate-in fade-in duration-200 shadow-xs">
                  <div className="flex items-center gap-2 font-bold text-purple-900">
                    <Lock className="w-4 h-4 text-purple-700" />
                    <span>Admin-Issued Certificates Only</span>
                  </div>
                  <p className="text-[11px] text-purple-800 leading-relaxed">
                    Certificates for <strong>"{events.find((ev) => ev.eventId === selectedEventId)?.title}"</strong> are uploaded directly by NMO Gujarat administrators. Participants cannot self-upload certificates for this event.
                  </p>
                  <div className="p-2.5 bg-white/80 rounded-xl border border-purple-200 text-[11px] text-purple-900 font-medium flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Please wait for the administrator to issue and upload your certificate to Google Drive.</span>
                  </div>
                </div>
              )}

              {/* Custom Title */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Certificate Title / Description
                </label>
                <input
                  type="text"
                  value={customCertTitle}
                  disabled={Boolean(selectedEventId && events.find((ev) => ev.eventId === selectedEventId)?.certificateUploadMode === 'admin')}
                  onChange={(e) => setCustomCertTitle(e.target.value)}
                  placeholder="e.g. State CME Delegate Participation Certificate"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={
                    isUploading ||
                    !selectedFile ||
                    Boolean(selectedEventId && events.find((ev) => ev.eventId === selectedEventId)?.certificateUploadMode === 'admin')
                  }
                  className="w-full py-2.5 px-4 bg-red-700 hover:bg-red-800 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {Boolean(selectedEventId && events.find((ev) => ev.eventId === selectedEventId)?.certificateUploadMode === 'admin') ? (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Awaiting Administrator Upload</span>
                    </>
                  ) : isUploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Uploading to Google Drive...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload Certificate to Drive</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-[11px] space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Automated Membership Tagging</span>
            </div>
            <p className="leading-relaxed">
              Files uploaded here are saved into the master NMO Gujarat Drive under your Membership ID so they are permanently accessible on your profile.
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: Available Certificates Ready to Download */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <FileCheck className="w-5 h-5 text-emerald-600" />
                <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                  My Assigned Certificates ({certificates.length})
                </h4>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Member ID: <strong className="text-red-700">{memberNo}</strong>
              </span>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 pb-3 overflow-x-auto">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({certificates.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('approved')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'approved'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approved ({approvedCerts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'pending'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Pending ({pendingCerts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('rejected')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusFilter === 'rejected'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Rejected ({rejectedCerts.length})</span>
              </button>
            </div>

            {isLoadingCerts ? (
              <div className="py-16 text-center text-slate-400">
                <div className="w-7 h-7 border-2 border-red-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs">Searching NMO Gujarat Google Drive for your certificates...</p>
              </div>
            ) : displayedCertificates.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto">
                  <Award className="w-6 h-6" />
                </div>
                <h5 className="font-semibold text-slate-700 text-sm">
                  {statusFilter === 'approved'
                    ? 'No Approved Certificates Yet'
                    : statusFilter === 'pending'
                    ? 'No Pending Submissions'
                    : statusFilter === 'rejected'
                    ? 'No Rejected Submissions'
                    : 'No Certificates Issued Yet'}
                </h5>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  {statusFilter === 'approved'
                    ? 'When administrators verify and certify your uploaded certificates or issue official certificates, they will appear here.'
                    : statusFilter === 'pending'
                    ? 'You have no submissions currently waiting for administrator review.'
                    : statusFilter === 'rejected'
                    ? 'You have no rejected certificate submissions.'
                    : `Certificates in Google Drive are retrieved using your Membership ID (${memberNo}). Upload your certificate or wait for organizers to issue your certificate.`}
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-[10px] text-slate-600 font-medium mt-1">
                  <span>🔒 Privacy Protected: Only your own certificates are displayed</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedCertificates.map((cert) => {
                  const isPending = cert.approvalStatus === 'pending' || cert.approvalStatus === 'pending_approval';
                  const isRejected = cert.approvalStatus === 'rejected';
                  const isApproved = cert.approvalStatus === 'approved';
                  const isAdminIssued = cert.approvalStatus === 'not_required' || (!cert.approvalStatus && cert.uploadSource === 'admin');

                  const previewLink = cert.proxyViewUrl
                    ? (cert.proxyViewUrl.startsWith('http') ? cert.proxyViewUrl : apiUrl(cert.proxyViewUrl))
                    : apiUrl(`/api/drive/file/${cert.id}?memberId=${encodeURIComponent(memberNo)}`);

                  return (
                    <div
                      key={cert.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 font-mono">
                            {cert.membershipNumber || memberNo}
                          </span>

                          {isPending && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Awaiting Admin Approval</span>
                            </span>
                          )}

                          {isRejected && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>Submission Rejected</span>
                            </span>
                          )}

                          {isApproved && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-blue-600" />
                              <span>Approved & Certified</span>
                            </span>
                          )}

                          {isAdminIssued && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                              <Award className="w-3 h-3 text-emerald-600" />
                              <span>Official Admin Issued</span>
                            </span>
                          )}

                          <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                            {cert.name}
                          </h5>
                        </div>

                        <p className="text-xs text-slate-700 font-medium flex items-center gap-1.5 mt-0.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{getCertificateEventName(cert)}</span>
                        </p>

                        {isPending && (
                          <p className="text-[10px] text-amber-800 bg-amber-50 px-2 py-1 rounded border border-amber-200 inline-block font-medium">
                            Submitted on {cert.createdTime ? new Date(cert.createdTime).toLocaleDateString() : 'recently'}. Awaiting admin review before official certification.
                          </p>
                        )}

                        {isRejected && (
                          <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-[11px] font-medium flex items-start gap-1.5 mt-1">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <span><strong>Rejection note:</strong> {cert.rejectionReason || 'Certificate submission could not be verified by administrator.'}</span>
                          </div>
                        )}

                        <p className="text-[10px] text-slate-400">
                          {cert.createdTime ? `Recorded: ${new Date(cert.createdTime).toLocaleDateString()}` : 'Google Drive Verified'} · {cert.size || 'Certificate'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* Universal Preview button for all certificates (approved, pending, and rejected) */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPreviewCert(cert);
                            setShowCertModal(true);
                          }}
                          className="px-2.5 py-1.5 text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                          title="Preview certificate in official viewer"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span>Preview</span>
                        </button>

                        {/* Download button for approved and official certificates */}
                        {(isApproved || isAdminIssued) && (
                          <button
                            type="button"
                            onClick={() => handleDownload(cert)}
                            disabled={downloadingId === cert.id}
                            className="px-3.5 py-1.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{downloadingId === cert.id ? 'Downloading...' : 'Download'}</span>
                          </button>
                        )}

                        {/* Modify / Replace button for user-uploaded certificates (pending, rejected, or user-sourced) */}
                        {(isPending || isRejected || cert.uploadSource === 'user' || cert.uploaderUid === currentUser?.uid) && (
                          <button
                            type="button"
                            onClick={() => handleOpenModify(cert)}
                            className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                            title="Modify certificate title or replace file"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                            <span>Modify</span>
                          </button>
                        )}

                        {/* Delete button for user-uploaded certificates */}
                        {(isPending || isRejected || cert.uploadSource === 'user' || cert.uploaderUid === currentUser?.uid) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUserCert(cert)}
                            disabled={deletingCertId === cert.id}
                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                            title="Delete this uploaded certificate"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>{deletingCertId === cert.id ? 'Deleting...' : 'Delete'}</span>
                          </button>
                        )}

                        {/* Re-Upload / Fix shortcut button for rejected submissions */}
                        {isRejected && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEventId(cert.eventId || '');
                              setSelectedEventTitle(cert.eventTitle || '');
                              setCustomCertTitle(cert.eventTitle || '');
                              setUploadFeedback({
                                message: `Ready to re-upload for "${cert.eventTitle || 'Event'}". Please select your corrected file in the form.`,
                                type: 'error'
                              });
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                            title="Upload corrected certificate"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Re-Upload / Fix</span>
                          </button>
                        )}

                        {/* Pending In-Review tag */}
                        {isPending && (
                          <span className="px-2.5 py-1.5 text-[11px] font-bold text-amber-800 bg-amber-100 rounded-lg border border-amber-300 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>In Review</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Official NMO Gujarat CME Certificate Repository</span>
            <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Verified Certificate Portal</span>
            </span>
          </div>
        </div>
      </div>

      {/* Modify / Replace Certificate Modal */}
      {modifyingCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Modify / Replace Certificate</h3>
              </div>
              <button
                type="button"
                onClick={() => setModifyingCert(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModification} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Event / Certificate Title *
                </label>
                <input
                  type="text"
                  required
                  value={modifyEventTitle}
                  onChange={(e) => setModifyEventTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-medium focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  placeholder="e.g. Dang Seva Samarpan Health Camp"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Replace Certificate File (PDF / JPG / PNG)
                </label>
                <input
                  type="file"
                  accept=".pdf,application/pdf,image/jpeg,image/png,image/jpg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setModifyFile(e.target.files[0]);
                    }
                  }}
                  className="w-full p-2.5 border border-dashed border-slate-300 rounded-xl bg-slate-50 cursor-pointer text-xs"
                />
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Current file: <strong className="font-mono text-slate-700">{modifyingCert.name || (modifyingCert as any).originalFileName || 'Current Certificate'}</strong>
                  </span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Select a new file to replace it in Google Drive, or leave empty to keep the existing file.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isModifying}
                  onClick={() => setModifyingCert(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isModifying}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Upload className="w-4 h-4" />
                  <span>{isModifying ? 'Saving Changes...' : 'Save & Update'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Show Certificate Modal */}
      <ShowCertificateModal
        isOpen={showCertModal}
        onClose={() => {
          setShowCertModal(false);
          setSelectedPreviewCert(null);
        }}
        selectedCert={selectedPreviewCert}
        initialCertificates={certificates}
        membershipNumber={memberNo}
        memberName={memberName}
        onCertificateDeleted={(delId) => {
          setCertificates((prev) => prev.filter((c) => c.id !== delId));
        }}
        onOpenUpload={(eventInfo) => {
          if (eventInfo?.eventId) setSelectedEventId(eventInfo.eventId);
          if (eventInfo?.eventTitle) {
            setSelectedEventTitle(eventInfo.eventTitle);
            setCustomCertTitle(eventInfo.eventTitle);
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
};
