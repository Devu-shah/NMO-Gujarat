import React, { useState } from 'react';
import { useNMO } from '../context/NMOContext';
import {
  connectGoogleDrive,
  getDriveAccessToken,
  ensureDriveAccessToken,
  uploadCertificateToDrive,
  NMO_ROOT_DRIVE_FOLDER_ID,
  NMO_ROOT_DRIVE_FOLDER_NAME,
  DriveCertificateFile
} from '../lib/googleDrive';
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  FolderOpen,
  Sparkles,
  Award,
  Lock,
  Clock
} from 'lucide-react';

interface UploadCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (cert: DriveCertificateFile) => void;
  defaultEventId?: string;
  defaultEventTitle?: string;
}

export const UploadCertificateModal: React.FC<UploadCertificateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultEventId,
  defaultEventTitle
}) => {
  const { currentMember, currentUser, events } = useNMO();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>(defaultEventId || '');
  const [customCertTitle, setCustomCertTitle] = useState<string>(defaultEventTitle || '');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const memberNo = currentMember?.membershipNumber || currentUser?.membershipNumber || '';
  const memberName = currentMember?.name || currentUser?.name || 'NMO Member';

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Valid file formats: PDF, JPG, JPEG, PNG
    const rawExt = file.name.split('.').pop()?.toLowerCase() || '';
    const validExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
    const validMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

    if (!validExtensions.includes(rawExt) && !validMimes.includes(file.type)) {
      setErrorMessage('Security & Format Policy: Only PDF, JPG, JPEG, and PNG files are supported for certificate upload.');
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 15MB limit. Please upload a smaller certificate file.');
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!selectedFile) {
      setErrorMessage('Please select a PDF, JPG, or PNG certificate file.');
      return;
    }

    // Ensure memberNo is obtained from verified authenticated user profile only
    if (!memberNo) {
      setErrorMessage('Authentication error: No linked membership ID found on your current session. Please verify your member profile.');
      return;
    }

    setIsUploading(true);
    try {
      // 1. Validate selected event if provided
      const matchedEvent = selectedEventId ? events.find((ev) => ev.eventId === selectedEventId) : null;
      if (matchedEvent && matchedEvent.certificateUploadMode === 'admin') {
        setErrorMessage(`Certificates for "${matchedEvent.title}" are uploaded exclusively by administrators. Member upload is not allowed; please wait for the administrator to issue and upload your certificate.`);
        setIsUploading(false);
        return;
      }
      let targetFolderId = matchedEvent?.driveFolderId || NMO_ROOT_DRIVE_FOLDER_ID;
      const eventTitle = customCertTitle.trim() || matchedEvent?.title || defaultEventTitle || 'NMO Certificate';

      // 2. Upload strictly with user's verified Membership ID as filename
      // uploadSource is strictly 'user', approvalStatus is strictly 'pending'
      const certResult = await uploadCertificateToDrive(selectedFile, {
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

      setSuccessMessage(`Certificate uploaded successfully! Your submission for ${eventTitle} is now pending admin approval. You can track its status in the Certificate Portal.`);
      if (onSuccess) {
        onSuccess(certResult);
      }

      // Reset form after short delay
      setTimeout(() => {
        setSelectedFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setCustomCertTitle('');
        setSelectedEventId('');
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Certificate upload error:', err);
      setErrorMessage(err.message || 'Failed to upload certificate to Google Drive. Please retry.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden text-slate-900 my-8">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-red-700 via-red-800 to-blue-900 text-white p-5 sm:p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Upload className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">Upload Certificate to Google Drive</h3>
              <p className="text-xs text-amber-200">
                Official JPG / PNG format · Tagged to Membership ID
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Tagged Membership ID Capsule */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 block text-[11px] font-semibold">
                Designated Membership ID
              </span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {memberNo || 'Unassigned'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block text-[11px] font-semibold">
                Member Name
              </span>
              <span className="font-bold text-slate-800 text-xs">
                {memberName}
              </span>
            </div>
          </div>

          {/* Alert Banners */}
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
            {/* File Dropzone - Strictly JPG/PNG */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[11px]">
                Certificate Image File (JPG / PNG Only) *
              </label>
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center hover:border-red-600 bg-slate-50/60 transition-colors">
                <input
                  type="file"
                  id="cert-file-input"
                  required
                  accept=".pdf,application/pdf,image/jpeg,image/png,image/jpg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="cert-file-input"
                  className="flex flex-col items-center justify-center cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-red-50 text-red-700 flex items-center justify-center mb-2">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-slate-800 text-xs">
                    {selectedFile ? selectedFile.name : 'Click to select certificate file'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    Accepted formats: .PDF, .JPG, .JPEG, .PNG (Max: 15MB)
                  </span>
                </label>
              </div>
            </div>

            {/* Live Image Preview */}
            {previewUrl && (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 block mb-2">
                  Selected Certificate Image Preview:
                </span>
                <div className="relative max-h-48 overflow-hidden rounded-xl border border-slate-200 bg-black/5 flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Certificate Preview"
                    className="max-h-44 w-auto object-contain rounded-lg shadow-xs"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>Size: {((selectedFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB</span>
                  <span className="text-emerald-700 font-bold uppercase">Format: {selectedFile?.type.split('/')[1]}</span>
                </div>
              </div>
            )}

            {/* Associated Event Selector */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[11px]">
                Associated NMO Event (Optional)
              </label>
              <select
                value={selectedEventId}
                onChange={(e) => {
                  setSelectedEventId(e.target.value);
                  const ev = events.find((item) => item.eventId === e.target.value);
                  if (ev) setCustomCertTitle(ev.title);
                }}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white font-medium focus:ring-2 focus:ring-red-600 focus:outline-hidden"
              >
                <option value="">-- General Certificate / Independent CME --</option>
                {events.map((evt) => (
                  <option key={evt.eventId} value={evt.eventId}>
                    {evt.title} ({evt.city}) {evt.certificateUploadMode === 'admin' ? '🔒 [Admin-Issued Only]' : '📤 [Member Upload]'}
                  </option>
                ))}
              </select>
            </div>

            {/* Admin-Issued Warning / Notice */}
            {(() => {
              const selectedEvt = events.find((ev) => ev.eventId === selectedEventId);
              const isAdminOnly = selectedEvt?.certificateUploadMode === 'admin';
              if (!isAdminOnly) return null;
              return (
                <div className="p-3 bg-purple-50/90 border border-purple-200 rounded-xl text-[11px] text-purple-950 flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-purple-900">Admin-Issued Event: Upload Restricted</span>
                    <p className="mt-0.5 text-purple-800 leading-relaxed">
                      Certificates for <strong>{selectedEvt?.title}</strong> are uploaded directly by the NMO Gujarat Admin team. Members cannot submit certificates for this event. Please wait for administrators to upload and issue your verified certificate.
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Certificate Title / Description */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider text-[11px]">
                Certificate Title
              </label>
              <input
                type="text"
                value={customCertTitle}
                onChange={(e) => setCustomCertTitle(e.target.value)}
                placeholder="e.g. State Conference CME Participation Certificate"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600 focus:outline-hidden font-medium"
              />
            </div>

            {/* Storage Mechanism Note */}
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Storage Policy:</strong> The certificate will be saved using your Membership ID only (<code>{memberNo ? `${memberNo}.${selectedFile?.name.split('.').pop()?.toLowerCase() || 'jpg'}` : 'MEMBERSHIP_ID'}</code>) directly into Google Drive and linked for instant retrieval in your Show Certificate modal.
              </p>
            </div>

            {/* Action Buttons */}
            {(() => {
              const selectedEvt = events.find((ev) => ev.eventId === selectedEventId);
              const isAdminOnly = selectedEvt?.certificateUploadMode === 'admin';
              return (
                <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isUploading}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading || !selectedFile || isAdminOnly}
                    className={`px-5 py-2.5 font-bold rounded-xl transition-all shadow-md flex items-center gap-2 ${
                      isAdminOnly
                        ? 'bg-purple-200 text-purple-700 border border-purple-300 cursor-not-allowed shadow-none'
                        : 'bg-red-700 hover:bg-red-800 disabled:bg-slate-300 text-white cursor-pointer'
                    }`}
                  >
                    {isAdminOnly ? (
                      <>
                        <Lock className="w-4 h-4 text-purple-600" />
                        <span>Awaiting Administrator Upload</span>
                      </>
                    ) : isUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Uploading to Google Drive...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Upload to Drive</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })()}
          </form>
        </div>
      </div>
    </div>
  );
};
