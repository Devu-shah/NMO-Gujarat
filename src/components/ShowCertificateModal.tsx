import React, { useState, useEffect, useMemo } from 'react';
import { useNMO } from '../context/NMOContext';
import {
  fetchCertificatesByMembershipNumber,
  downloadDriveCertificate,
  getDriveDirectImageUrl,
  NMO_ROOT_DRIVE_FOLDER_NAME,
  DriveCertificateFile,
  getCertificateEventName
} from '../lib/googleDrive';
import { setMemberIdCookie, isCertificateMatchingCookie } from '../lib/memberCookie';
import { apiUrl } from '../lib/api';
import {
  Award,
  X,
  Download,
  ExternalLink,
  Printer,
  RefreshCw,
  Eye,
  Calendar,
  AlertCircle,
  Upload,
  Maximize2,
  FileImage,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface ShowCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  membershipNumber?: string;
  memberName?: string;
  onOpenUpload?: () => void;
  selectedCert?: DriveCertificateFile | null;
  initialCertificates?: DriveCertificateFile[];
}

export const ShowCertificateModal: React.FC<ShowCertificateModalProps> = ({
  isOpen,
  onClose,
  membershipNumber,
  memberName,
  onOpenUpload,
  selectedCert,
  initialCertificates
}) => {
  const { currentMember, currentUser } = useNMO();

  const targetMemberNo = (
    membershipNumber ||
    selectedCert?.membershipNumber ||
    currentMember?.membershipNumber ||
    currentUser?.membershipNumber ||
    ''
  ).trim().toUpperCase();

  const displayName = memberName || selectedCert?.memberName || currentMember?.name || currentUser?.name || 'NMO Member';

  const [certificates, setCertificates] = useState<DriveCertificateFile[]>(initialCertificates || (selectedCert ? [selectedCert] : []));
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      if (initialCertificates && initialCertificates.length > 0) {
        setCertificates(initialCertificates);
        if (selectedCert) {
          const idx = initialCertificates.findIndex((c) => c.id === selectedCert.id);
          setSelectedIndex(idx >= 0 ? idx : 0);
        } else {
          setSelectedIndex(0);
        }
      } else if (selectedCert) {
        setCertificates([selectedCert]);
        setSelectedIndex(0);
      } else if (targetMemberNo) {
        loadMemberCertificates();
      }
    }
  }, [isOpen, targetMemberNo, selectedCert, initialCertificates]);

  const loadMemberCertificates = async () => {
    if (!targetMemberNo) return;
    setIsLoading(true);
    setImageLoaded(false);
    setImageError(false);
    try {
      // Save membership ID in persistent cookie and compare
      setMemberIdCookie(targetMemberNo);
      // Mechanism: Call the membership ID to retrieve only this member's certificates
      const results = await fetchCertificatesByMembershipNumber(targetMemberNo);
      // Filter certificates that belong to this member
      const memberCerts = results.filter((c) => isCertificateMatchingCookie(c, targetMemberNo));
      setCertificates(memberCerts);
      if (selectedCert) {
        const foundIdx = memberCerts.findIndex((c) => c.id === selectedCert.id);
        setSelectedIndex(foundIdx >= 0 ? foundIdx : 0);
      } else {
        setSelectedIndex(0);
      }
    } catch (err) {
      console.warn('Error fetching member certificates for modal:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentCert = certificates[selectedIndex] || null;

  const handleDownload = async () => {
    if (!currentCert) return;
    setIsDownloading(true);
    try {
      const cleanMem = encodeURIComponent(targetMemberNo);
      let targetUrl = currentCert.proxyDownloadUrl;
      if (!targetUrl) {
        targetUrl = `/api/drive/file/${currentCert.id}?download=true`;
      }
      const fullUrl = targetUrl.startsWith('http') ? targetUrl : apiUrl(targetUrl);
      const sep = fullUrl.includes('?') ? '&' : '?';
      const params: string[] = [];
      if (cleanMem && !fullUrl.includes('memberId=')) params.push(`memberId=${cleanMem}`);
      const isAdminUser = ['super_admin', 'state_admin', 'prant_admin', 'city_admin'].includes(currentUser?.role || '');
      if (isAdminUser && !fullUrl.includes('admin=')) {
        params.push('admin=true');
        if (currentUser?.role) params.push(`adminRole=${encodeURIComponent(currentUser.role)}`);
        if (currentUser?.email) params.push(`adminEmail=${encodeURIComponent(currentUser.email)}`);
      }
      const finalDownloadUrl = params.length > 0 ? `${fullUrl}${sep}${params.join('&')}` : fullUrl;
      await downloadDriveCertificate(currentCert.id, currentCert.name, targetMemberNo, finalDownloadUrl);
    } catch (err: any) {
      alert(err.message || 'Could not download certificate.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    if (!currentCert) return;
    window.print();
  };

  const isPdf = Boolean(
    currentCert &&
      (currentCert.mimeType === 'application/pdf' ||
        currentCert.name.toLowerCase().endsWith('.pdf'))
  );

  const previewSource = useMemo(() => {
    if (!currentCert) return '';
    const cleanMem = encodeURIComponent(targetMemberNo);
    const isAdminUser = ['super_admin', 'state_admin', 'prant_admin', 'city_admin'].includes(currentUser?.role || '');
    let url = currentCert.proxyViewUrl || '';
    if (!url) {
      url = `/api/drive/file/${currentCert.id}`;
    }
    const fullUrl = url.startsWith('http') ? url : apiUrl(url);
    const sep = fullUrl.includes('?') ? '&' : '?';
    const params: string[] = [];
    if (cleanMem && !fullUrl.includes('memberId=')) params.push(`memberId=${cleanMem}`);
    if (isAdminUser && !fullUrl.includes('admin=')) {
      params.push('admin=true');
      if (currentUser?.role) params.push(`adminRole=${encodeURIComponent(currentUser.role)}`);
      if (currentUser?.email) params.push(`adminEmail=${encodeURIComponent(currentUser.email)}`);
    }
    return params.length > 0 ? `${fullUrl}${sep}${params.join('&')}` : fullUrl;
  }, [currentCert, targetMemberNo, currentUser]);

  const imageUrl = previewSource;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden text-slate-900 my-4 flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-red-700 via-red-800 to-blue-900 text-white p-5 sm:p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-amber-300 shadow-inner">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  Official Member Certificate
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
                  Google Drive Verified
                </span>
              </div>
              <p className="text-xs text-amber-200 flex items-center gap-2 mt-0.5">
                <span>Member: <strong>{displayName}</strong></span>
                <span>·</span>
                <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-[11px] font-bold text-white">
                  ID: {targetMemberNo}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadMemberCertificates}
              disabled={isLoading}
              title="Refresh certificate from Drive"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col justify-between space-y-4">
          {isLoading ? (
            <div className="py-24 text-center text-slate-500 space-y-3">
              <div className="w-10 h-10 border-3 border-red-700 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-800">
                Searching Google Drive for Membership ID: {targetMemberNo}...
              </p>
              <p className="text-xs text-slate-400">
                Querying {NMO_ROOT_DRIVE_FOLDER_NAME} repository
              </p>
            </div>
          ) : certificates.length === 0 ? (
            /* Empty State */
            <div className="py-16 text-center space-y-4 my-auto">
              <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto border border-amber-200 shadow-inner">
                <FileImage className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h4 className="text-base font-bold text-slate-900">
                  No Certificate Issued Yet for ID: <span className="font-mono text-red-700">{targetMemberNo}</span>
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  When event organizers or you upload a certificate tagged with this Membership ID to the central Google Drive, it will appear here automatically for preview and instant download.
                </p>
              </div>

              {onOpenUpload && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenUpload();
                    }}
                    className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold transition-all shadow-md inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload JPG / PNG Certificate</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Certificate Displayed */
            <div className="space-y-4">
              {/* Multi-certificate selector tabs if more than 1 */}
              {certificates.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                    Certificates ({certificates.length}):
                  </span>
                  {certificates.map((cert, idx) => (
                    <button
                      key={cert.id}
                      onClick={() => {
                        setSelectedIndex(idx);
                        setImageLoaded(false);
                        setImageError(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                        selectedIndex === idx
                          ? 'bg-red-700 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        cert.approvalStatus === 'rejected' ? 'bg-red-400' :
                        (cert.approvalStatus === 'pending' || cert.approvalStatus === 'pending_approval') ? 'bg-amber-400' :
                        'bg-emerald-400'
                      }`} />
                      <span>#{idx + 1} {getCertificateEventName(cert)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Status Alert Banners for Pending or Rejected */}
              {currentCert && currentCert.approvalStatus === 'rejected' && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold text-red-900">Certificate Submission Rejected by Administrator</p>
                      <p className="text-red-700 mt-0.5">
                        <strong>Reason:</strong> {currentCert.rejectionReason || 'Event participation details require correction.'}
                      </p>
                    </div>
                  </div>
                  {onOpenUpload && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenUpload();
                      }}
                      className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold text-xs shrink-0 flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Re-Upload / Fix</span>
                    </button>
                  )}
                </div>
              )}

              {currentCert && (currentCert.approvalStatus === 'pending' || currentCert.approvalStatus === 'pending_approval') && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 flex items-center gap-2.5 text-xs shadow-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <p>
                    <strong>Awaiting Administrator Approval:</strong> This certificate is saved in Google Drive and under review by NMO Gujarat admins.
                  </p>
                </div>
              )}

              {/* Certificate Image Frame */}
              {currentCert && (
                <div className="space-y-3">
                  <div className="bg-slate-950 rounded-2xl p-2 sm:p-4 border-2 border-slate-200 shadow-inner flex flex-col items-center justify-center relative min-h-[320px] max-h-[500px] overflow-hidden">
                    {/* Image Loading Spinner */}
                    {!imageLoaded && !imageError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 z-10 text-white text-xs gap-2">
                        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        <span>Rendering Certificate Image...</span>
                      </div>
                    )}

                    {/* Image / PDF Display */}
                    {isPdf ? (
                      <div className="w-full h-[460px] flex flex-col items-center justify-center">
                        <iframe
                          src={imageUrl}
                          title={`PDF Certificate for ${targetMemberNo}`}
                          className="w-full h-full rounded-xl border border-slate-700 bg-white"
                          onLoad={() => setImageLoaded(true)}
                        />
                      </div>
                    ) : imageError ? (
                      <div className="w-full flex flex-col items-center justify-center p-2">
                        <iframe
                          src={`https://drive.google.com/file/d/${currentCert.id}/preview`}
                          title={`Certificate for ${targetMemberNo}`}
                          className="w-full h-[400px] rounded-xl border border-slate-700 bg-white"
                          onLoad={() => setImageLoaded(true)}
                        />
                        <div className="mt-3 flex items-center justify-center gap-3">
                          <a
                            href={currentCert.webViewLink || `https://drive.google.com/file/d/${currentCert.id}/view`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-slate-900 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors shadow-xs"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span>Open in Google Drive ↗</span>
                          </a>
                        </div>
                      </div>
                    ) : (
                      /* Main Certificate High-Res Image */
                      <img
                        src={imageUrl}
                        alt={`NMO Certificate for ${targetMemberNo}`}
                        onLoad={() => setImageLoaded(true)}
                        onError={() => setImageError(true)}
                        className={`max-h-[460px] w-auto object-contain rounded-xl shadow-2xl transition-opacity duration-300 ${
                          imageLoaded ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                    )}
                  </div>

                  {/* Certificate Metadata Bar */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">
                          {getCertificateEventName(currentCert)}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-100 text-red-800">
                          ID: {targetMemberNo}
                        </span>
                        {currentCert.approvalStatus === 'rejected' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                            Rejected Submission
                          </span>
                        ) : (currentCert.approvalStatus === 'pending' || currentCert.approvalStatus === 'pending_approval') ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Pending Verification
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Verified & Approved
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3">
                        <span className="font-mono text-slate-600">{currentCert.name}</span>
                        <span>·</span>
                        <span>Format: {isPdf ? 'PDF' : 'JPG/PNG'}</span>
                        <span>·</span>
                        <span>{currentCert.createdTime ? new Date(currentCert.createdTime).toLocaleDateString() : 'Verified Record'}</span>
                        {currentCert.size && (
                          <>
                            <span>·</span>
                            <span>{currentCert.size}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {imageUrl && (
                        <a
                          href={imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Open certificate preview in new tab"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-700" />
                          <span>Preview</span>
                        </a>
                      )}

                      {currentCert.webViewLink && (
                        <a
                          href={currentCert.webViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Open original file in Google Drive"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Google Drive</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{isDownloading ? 'Downloading...' : 'Download Image'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
            <span className="text-[11px]">
              Stored securely in Google Drive folder: <strong>{NMO_ROOT_DRIVE_FOLDER_NAME}</strong>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
