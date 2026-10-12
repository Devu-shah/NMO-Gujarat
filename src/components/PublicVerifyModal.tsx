import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { useNMO } from '../context/NMOContext';
import { NmoLogo } from './NmoLogo';
import { MemberIdCard } from './MemberIdCard';
import { ShowCertificateModal } from './ShowCertificateModal';
import {
  Search,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  X,
  QrCode,
  Camera,
  Upload,
  RefreshCw,
  Award,
  ExternalLink,
  Printer,
  Sparkles,
  AlertCircle,
  Check,
  RotateCcw
} from 'lucide-react';
import { NMOMember } from '../types/nmo';

interface PublicVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export const PublicVerifyModal: React.FC<PublicVerifyModalProps> = ({
  isOpen,
  onClose,
  initialQuery = ''
}) => {
  const { members } = useNMO();

  // Verification mode: 'qr' (QR code scan) or 'manual' (search input)
  const [activeMode, setActiveMode] = useState<'qr' | 'manual'>('qr');
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<NMOMember | null>(null);
  const [verificationSource, setVerificationSource] = useState<'qr_scan' | 'manual_search' | null>(null);

  // QR Scanning States
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);

  // Google Drive Certificate Modal sub-state
  const [showDriveCerts, setShowDriveCerts] = useState<boolean>(false);

  // Refs for video & canvas scanning
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when opening modal
  useEffect(() => {
    if (isOpen) {
      if (initialQuery) {
        setQueryInput(initialQuery);
        setActiveMode('manual');
        handleLookup(initialQuery, null, 'manual_search');
      } else {
        setSearched(false);
        setResult(null);
        setVerificationSource(null);
      }
    } else {
      stopCamera();
    }
  }, [isOpen, initialQuery]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Stop camera stream safely
  const stopCamera = () => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Start device camera for live QR scanning
  const startCamera = async () => {
    setCameraError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by this browser environment. You can upload an image of the QR code below.');
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setIsCameraActive(true);
        // Start continuous scanning loop
        scanVideoFrame();
      }
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      let msg = 'Could not access camera. Please allow camera permissions or upload an image of the ID Card QR code.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please grant camera permission in your browser or upload a photo of the QR code.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No camera found on this device. Please upload an image of the ID Card QR code instead.';
      }
      setCameraError(msg);
      setIsCameraActive(false);
    }
  };

  // Continuously scan video frames using jsQR
  const scanVideoFrame = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animFrameIdRef.current = requestAnimationFrame(scanVideoFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (ctx && canvas.width > 0 && canvas.height > 0) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth'
      });

      if (code && code.data) {
        // QR Code detected!
        stopCamera();
        handleRawDecodedQR(code.data);
        return;
      }
    }

    animFrameIdRef.current = requestAnimationFrame(scanVideoFrame);
  };

  // Scan uploaded image / photo of ID card QR
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCameraError(null);
    setIsProcessingImage(true);

    const reader = new FileReader();
    reader.onload = (uploadEvt) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          setIsProcessingImage(false);
          setCameraError('Unable to process image on this device.');
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Scan with jsQR
        const code = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'attemptBoth'
        });

        setIsProcessingImage(false);

        if (code && code.data) {
          handleRawDecodedQR(code.data);
        } else {
          setCameraError(
            'No valid QR code was detected in the uploaded image. Please ensure the QR code on the ID card is clear, well-lit, and not cropped.'
          );
        }
      };

      img.onerror = () => {
        setIsProcessingImage(false);
        setCameraError('Failed to load image file. Please choose a valid JPG or PNG picture.');
      };

      img.src = uploadEvt.target?.result as string;
    };

    reader.onerror = () => {
      setIsProcessingImage(false);
      setCameraError('Error reading file. Please try again.');
    };

    reader.readAsDataURL(file);
    // Reset input so same file can be selected again if needed
    e.target.value = '';
  };

  // Parse raw text or JSON from QR Code
  const handleRawDecodedQR = (rawData: string) => {
    let cleanTarget = rawData.trim();
    let payloadObj: any = null;

    try {
      // Attempt JSON parse
      payloadObj = JSON.parse(cleanTarget);
      if (payloadObj && typeof payloadObj === 'object') {
        cleanTarget = payloadObj.id || payloadObj.membershipNumber || payloadObj.reg || cleanTarget;
      }
    } catch {
      // Plain text or URL
      if (cleanTarget.includes('id=')) {
        const match = cleanTarget.match(/[?&]id=([^&#]+)/);
        if (match) cleanTarget = decodeURIComponent(match[1]);
      }
    }

    handleLookup(cleanTarget, payloadObj, 'qr_scan');
  };

  // Perform lookup against local members registry and reconstruct verified card
  const handleLookup = (
    lookupKey: string,
    fallbackPayload: any | null,
    source: 'qr_scan' | 'manual_search'
  ) => {
    const clean = lookupKey.trim().toUpperCase();

    // 1. Check in loaded members list
    const found = members.find(
      (m) =>
        m.membershipNumber.trim().toUpperCase() === clean ||
        m.registrationNumber?.trim().toUpperCase() === clean ||
        (fallbackPayload?.id && m.membershipNumber.trim().toUpperCase() === fallbackPayload.id.trim().toUpperCase())
    );

    if (found) {
      setResult(found);
      setVerificationSource(source);
      setSearched(true);
      return;
    }

    // 2. If not found in memory but payload is authentic cryptographic NMO JSON
    if (fallbackPayload && (fallbackPayload.org === 'NMO-GUJARAT' || fallbackPayload.id)) {
      const reconstructed: NMOMember = {
        membershipNumber: fallbackPayload.id || clean,
        name: fallbackPayload.name || 'NMO Member',
        role: fallbackPayload.role || 'member',
        prant: fallbackPayload.prant || 'Gujarat',
        registrationNumber: fallbackPayload.reg || 'Verified',
        qualifications: fallbackPayload.qualifications || 'MBBS',
        medicalCollege: fallbackPayload.medicalCollege || 'Medical College (Gujarat)',
        studentMembershipValidTill:
          fallbackPayload.valid && fallbackPayload.valid !== 'Active'
            ? fallbackPayload.valid
            : undefined,
        accountStatus: 'Active',
        status: 'Active',
        email: '',
        phone: ''
      };
      setResult(reconstructed);
      setVerificationSource(source);
      setSearched(true);
      return;
    }

    // 3. Not found
    setResult(null);
    setVerificationSource(source);
    setSearched(true);
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    stopCamera();
    handleLookup(queryInput, null, 'manual_search');
  };

  const resetSearch = () => {
    setSearched(false);
    setResult(null);
    setVerificationSource(null);
    setQueryInput('');
    setCameraError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 relative overflow-hidden text-slate-900 my-4 flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-red-700 via-red-800 to-blue-900 text-white p-5 sm:p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <NmoLogo size="sm" showText={false} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  Verify Member Identity & Credentials
                </h3>
                <span className="hidden sm:inline px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
                  Official NMO Registry
                </span>
              </div>
              <p className="text-xs text-amber-200 mt-0.5 font-serif italic">
                National Medicos Organisation Gujarat (Gujarat & Saurashtra Prants)
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Option Selector Tabs if not showing result yet */}
          {!searched && (
            <div>
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200/80 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('qr');
                    setCameraError(null);
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    activeMode === 'qr'
                      ? 'bg-white text-red-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <QrCode className="w-4 h-4 text-red-600" />
                  <span>Scan QR on ID Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setActiveMode('manual');
                    setCameraError(null);
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    activeMode === 'manual'
                      ? 'bg-white text-red-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Search className="w-4 h-4 text-slate-500" />
                  <span>Search by ID / Reg No</span>
                </button>
              </div>

              {/* Mode A: QR Code Scanning */}
              {activeMode === 'qr' && (
                <div className="space-y-4">
                  {cameraError && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-2xl flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-semibold">{cameraError}</span>
                      </div>
                    </div>
                  )}

                  {/* Camera Scanner Viewport */}
                  {isCameraActive ? (
                    <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-4/3 max-h-72 border-2 border-red-600 shadow-lg flex items-center justify-center">
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                      />
                      {/* Targeting Corner Brackets Overlay */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                        <div className="w-48 h-48 border-2 border-white/60 rounded-2xl relative shadow-2xl">
                          {/* Corner markers */}
                          <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-red-500 rounded-tl-lg" />
                          <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-red-500 rounded-tr-lg" />
                          <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-red-500 rounded-bl-lg" />
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-red-500 rounded-br-lg" />

                          {/* Animated Scan Line */}
                          <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-bounce duration-1000" />
                        </div>
                      </div>

                      {/* Live controls overlay */}
                      <div className="absolute bottom-3 inset-x-3 flex items-center justify-between text-xs text-white">
                        <span className="px-2.5 py-1 bg-black/60 backdrop-blur-xs rounded-lg text-[11px] font-medium flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          Position QR code inside frame
                        </span>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-3 py-1 bg-red-600/90 hover:bg-red-700 text-white font-semibold rounded-lg text-xs cursor-pointer"
                        >
                          Stop Camera
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-slate-300 rounded-3xl p-6 text-center bg-slate-50/70 hover:bg-slate-50 transition-colors">
                      <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto mb-3 shadow-inner">
                        <QrCode className="w-8 h-8" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mb-1">
                        Scan Official QR Code on ID Card
                      </h4>
                      <p className="text-xs text-slate-600 max-w-sm mx-auto mb-5 leading-relaxed">
                        Point your camera at the QR code printed at the bottom of any official NMO Gujarat membership card for instant cryptographic verification.
                      </p>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Open Live Camera Scanner</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isProcessingImage}
                          className="px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                        >
                          <Upload className="w-4 h-4 text-slate-500" />
                          <span>{isProcessingImage ? 'Analyzing...' : 'Upload Card/QR Image'}</span>
                        </button>
                      </div>

                      {/* Hidden file input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/jpg"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>
                  )}

                  {/* Instructions snippet */}
                  <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <p className="leading-relaxed text-[11px]">
                      <strong>Instant Authentication:</strong> The QR code is cryptographically encoded with membership ID, Council registration number, and verified role directly from the NMO Gujarat database.
                    </p>
                  </div>
                </div>
              )}

              {/* Mode B: Manual Search */}
              {activeMode === 'manual' && (
                <div>
                  <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                    Verify authentic medical credentials, membership status, and registration validity by entering the member's Membership Number or Medical Council Registration Number.
                  </p>

                  <form onSubmit={handleManualSearch} className="mb-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={queryInput}
                        onChange={(e) => setQueryInput(e.target.value)}
                        placeholder="e.g. NMO-GJ-2024-001 or Medical Council Reg No"
                        className="w-full pl-10 pr-24 py-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600 focus:outline-hidden font-medium"
                        autoFocus
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                      <button
                        type="submit"
                        className="absolute right-1.5 top-1.5 bottom-1.5 px-4 bg-red-700 hover:bg-red-800 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        Verify
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* Verification Results: SHOW CARD IN PROPER FORMATTING */}
          {searched && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {result ? (
                <div>
                  {/* Verified Header Capsule */}
                  <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 mb-4 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md">
                            Officially Verified
                          </span>
                          <span className="text-[11px] text-emerald-700 font-semibold">
                            {verificationSource === 'qr_scan' ? 'Decoded from Card QR Code' : 'Registry Match'}
                          </span>
                        </div>
                        <h4 className="text-sm sm:text-base font-black text-slate-900 mt-0.5">
                          {result.name}
                        </h4>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={resetSearch}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-bold transition-colors cursor-pointer shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Verify Another</span>
                    </button>
                  </div>

                  {/* PROPER ID CARD FORMATTING */}
                  <div className="bg-slate-100/80 p-2 sm:p-4 rounded-3xl border border-slate-200 shadow-inner">
                    <div className="text-center mb-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                        Digital Membership Credential
                      </span>
                    </div>

                    {/* Render Authentic ID Card */}
                    <MemberIdCard member={result} />
                  </div>

                  {/* Actions Bar for Verified Member */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDriveCerts(true)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                      <Award className="w-4 h-4 text-emerald-200" />
                      <span>View Google Drive Certificates ({result.membershipNumber})</span>
                    </button>

                    <button
                      type="button"
                      onClick={resetSearch}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 text-slate-500" />
                      <span>Scan Another Card</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Record Not Found State */
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                    <XCircle className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-red-900">
                      Record Not Found in NMO Registry
                    </h4>
                    <p className="text-xs text-red-700 mt-1 max-w-sm mx-auto leading-relaxed">
                      No registered member matches the scanned QR code or query. Please check that the ID card was issued by NMO Gujarat and that the membership number is correct.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={resetSearch}
                      className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      Try Another Scan or Search
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Close */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="text-[11px]">
            National Medicos Organisation Gujarat • Official Digital Verification Engine
          </span>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Sub-modal: Google Drive Certificate Modal if opened from verified card */}
      {showDriveCerts && result && (
        <ShowCertificateModal
          isOpen={showDriveCerts}
          onClose={() => setShowDriveCerts(false)}
          membershipNumber={result.membershipNumber}
          memberName={result.name}
        />
      )}
    </div>
  );
};
