import React, { useState, useEffect } from 'react';
import { useNMO } from '../context/NMOContext';
import {
  connectGoogleDrive,
  getDriveAccessToken,
  ensureDriveAccessToken,
  uploadCertificateToDrive,
  fetchCertificatesByMembershipNumber,
  downloadDriveCertificate,
  NMO_ROOT_DRIVE_FOLDER_ID,
  NMO_ROOT_DRIVE_FOLDER_NAME,
  NMO_ROOT_DRIVE_URL,
  DriveCertificateFile
} from '../lib/googleDrive';
import {
  Award,
  Upload,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Calendar,
  Eye,
  FileCheck,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { ShowCertificateModal } from './ShowCertificateModal';

export const MemberCertificatesTab: React.FC = () => {
  const { currentMember, currentUser, events } = useNMO();

  const [certificates, setCertificates] = useState<DriveCertificateFile[]>([]);
  const [isLoadingCerts, setIsLoadingCerts] = useState<boolean>(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showCertModal, setShowCertModal] = useState<boolean>(false);

  // Upload Form State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedEventTitle, setSelectedEventTitle] = useState<string>('');
  const [customCertTitle, setCustomCertTitle] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const memberNo = currentMember?.membershipNumber || currentUser?.membershipNumber || '';
  const memberName = currentMember?.name || currentUser?.name || 'NMO Member';

  // Load certificates on mount or when memberNo changes
  useEffect(() => {
    if (memberNo) {
      loadCertificates();
    }
  }, [memberNo]);

  const loadCertificates = async () => {
    if (!memberNo) return;
    setIsLoadingCerts(true);
    setUploadFeedback(null);
    try {
      const found = await fetchCertificatesByMembershipNumber(memberNo);
      setCertificates(found);
    } catch (err: any) {
      console.warn('Error loading member certificates:', err);
    } finally {
      setIsLoadingCerts(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadFeedback({ message: 'Please select a certificate file (JPG or PNG only).', type: 'error' });
      return;
    }

    const validMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    const lowerName = selectedFile.name.toLowerCase();
    const hasValidExt = lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png');

    if (!validMimes.includes(selectedFile.type) && !hasValidExt) {
      setUploadFeedback({ message: 'Security & Format Policy: Only JPG and PNG image files are supported.', type: 'error' });
      return;
    }

    if (!memberNo) {
      setUploadFeedback({ message: 'No linked membership number found on your profile.', type: 'error' });
      return;
    }

    // Determine target subfolder if event has one
    const matchedEvent = events.find((ev) => ev.eventId === selectedEventId);
    const targetFolderId = matchedEvent?.driveFolderId || NMO_ROOT_DRIVE_FOLDER_ID;
    const eventTitle = customCertTitle.trim() || matchedEvent?.title || selectedEventTitle || 'NMO Participation Certificate';

    setIsUploading(true);
    setUploadFeedback(null);
    try {
      // Check if saved Drive token exists in memory or Firestore
      let token = getDriveAccessToken();
      if (!token) {
        token = await ensureDriveAccessToken();
      }
      if (!token) {
        await connectGoogleDrive();
      }

      const uploaded = await uploadCertificateToDrive(selectedFile, {
        membershipNumber: memberNo,
        memberName,
        eventId: selectedEventId || undefined,
        eventTitle,
        targetFolderId
      });

      setUploadFeedback({
        message: `Certificate "${uploaded.name}" successfully uploaded to ${NMO_ROOT_DRIVE_FOLDER_NAME} Google Drive!`,
        type: 'success'
      });

      setSelectedFile(null);
      setCustomCertTitle('');
      setSelectedEventId('');
      setSelectedEventTitle('');
      await loadCertificates();
    } catch (err: any) {
      setUploadFeedback({
        message: err.message || 'Failed to upload certificate to Google Drive repository.',
        type: 'error'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (cert: DriveCertificateFile) => {
    setDownloadingId(cert.id);
    try {
      await downloadDriveCertificate(cert.id, cert.name);
    } catch (err: any) {
      alert(err.message || 'Failed to download certificate from Google Drive.');
    } finally {
      setDownloadingId(null);
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

            <a
              href={NMO_ROOT_DRIVE_URL}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            >
              <FolderOpen className="w-4 h-4 text-amber-600" />
              <span>Drive Repository</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

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
                  Select Certificate Image (JPG / PNG Only) *
                </label>
                <input
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/jpg"
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
                      {evt.title} ({evt.city}) {evt.driveFolderId ? '📁' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Title */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Certificate Title / Description
                </label>
                <input
                  type="text"
                  value={customCertTitle}
                  onChange={(e) => setCustomCertTitle(e.target.value)}
                  placeholder="e.g. State CME Delegate Participation Certificate"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="w-full py-2.5 px-4 bg-red-700 hover:bg-red-800 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isUploading ? (
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
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <FileCheck className="w-5 h-5 text-emerald-600" />
                <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                  My Assigned Certificates ({certificates.length})
                </h4>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                ID: {memberNo}
              </span>
            </div>

            {isLoadingCerts ? (
              <div className="py-16 text-center text-slate-400">
                <div className="w-7 h-7 border-2 border-red-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs">Searching NMO Gujarat Google Drive for your certificates...</p>
              </div>
            ) : certificates.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto">
                  <Award className="w-6 h-6" />
                </div>
                <h5 className="font-semibold text-slate-700 text-sm">
                  No Certificates Issued Yet
                </h5>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  When organizers upload or assign certificates for events you attended, they will appear here automatically for one-click download.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {certificates.map((cert) => (
                  <div
                    key={cert.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 font-mono">
                          {cert.membershipNumber || memberNo}
                        </span>
                        <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                          {cert.name}
                        </h5>
                      </div>
                      {cert.eventTitle && (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{cert.eventTitle}</span>
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400">
                        {cert.createdTime ? `Issued: ${new Date(cert.createdTime).toLocaleDateString()}` : 'Google Drive Verified'} · {cert.size || 'PDF'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {cert.webViewLink && (
                        <a
                          href={cert.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                          title="Preview in Google Drive"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDownload(cert)}
                        disabled={downloadingId === cert.id}
                        className="px-3.5 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{downloadingId === cert.id ? 'Downloading...' : 'Download'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Powered by NMO Gujarat Google Drive</span>
            <span className="font-mono text-[10px] text-slate-400">Folder ID: {NMO_ROOT_DRIVE_FOLDER_ID}</span>
          </div>
        </div>
      </div>

      {/* Show Certificate Modal */}
      <ShowCertificateModal
        isOpen={showCertModal}
        onClose={() => setShowCertModal(false)}
      />
    </div>
  );
};
