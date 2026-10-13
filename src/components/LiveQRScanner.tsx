import React, { Component, ErrorInfo, ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  CreditCard,
  Upload,
  Zap,
  ZapOff,
  CheckCircle2,
  ShieldAlert,
  HelpCircle,
  Info
} from 'lucide-react';

// ==========================================
// 1. ROBUST REACT ERROR BOUNDARY FOR SCANNER
// ==========================================

interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
  onSwitchToIdMode?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class QRScannerErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('QR Scanner Uncaught Error Boundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-5 bg-red-50 border-2 border-red-200 rounded-2xl text-slate-900 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-red-950">
                Scanner Component Recovered from an Unexpected Error
              </h4>
              <p className="text-xs text-red-800 mt-1 leading-relaxed">
                The camera scanner encountered an unexpected rendering error. You can retry the scanner or switch directly to verifying with the Membership ID.
              </p>
              {this.state.error?.message && (
                <p className="text-[11px] font-mono bg-red-100/80 text-red-900 p-2 rounded-lg mt-2 break-all">
                  {this.state.error.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-red-200/80">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Scanner</span>
            </button>
            {this.props.onSwitchToIdMode && (
              <button
                type="button"
                onClick={this.props.onSwitchToIdMode}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                <span>Verify by Membership ID</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ==========================================
// 2. LIVE QR SCANNER COMPONENT WITH RETRY
// ==========================================

export type CameraErrorType =
  | 'permission_denied'
  | 'not_found'
  | 'hardware_busy'
  | 'unsupported'
  | 'scan_timeout'
  | 'general';

interface LiveQRScannerProps {
  onScanSuccess: (decodedData: string) => void;
  onSwitchToIdMode: () => void;
  isActive: boolean;
}

export const LiveQRScanner: React.FC<LiveQRScannerProps> = ({
  onScanSuccess,
  onSwitchToIdMode,
  isActive
}) => {
  // Scanner state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isStartingCamera, setIsStartingCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<CameraErrorType | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [showPermissionGuide, setShowPermissionGuide] = useState<boolean>(false);
  const [scanHelpTip, setScanHelpTip] = useState<boolean>(false);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const barcodeDetectorRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isScanningActiveRef = useRef<boolean>(false);

  // Initialize native BarcodeDetector if available
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetectorRef.current = new (window as any).BarcodeDetector({
          formats: ['qr_code']
        });
      } catch {
        barcodeDetectorRef.current = null;
      }
    }
  }, []);

  // Audio beep feedback on successful scan
  const playSuccessSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch {}
  }, []);

  // Stop camera stream cleanly
  const stopCamera = useCallback(() => {
    isScanningActiveRef.current = false;
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      } catch {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsStartingCamera(false);
    setTorchOn(false);
    setTorchSupported(false);
    setScanHelpTip(false);
  }, []);

  // Toggle Torch/Flashlight if supported
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    try {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack && 'applyConstraints' in videoTrack) {
        const nextTorch = !torchOn;
        await (videoTrack as any).applyConstraints({
          advanced: [{ torch: nextTorch }]
        });
        setTorchOn(nextTorch);
      }
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  }, [torchOn]);

  // Frame scanning loop
  const scanVideoFrame = useCallback(() => {
    if (!isScanningActiveRef.current || !videoRef.current || !streamRef.current) {
      return;
    }

    const video = videoRef.current;
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      try {
        // 1. Hardware accelerated BarcodeDetector
        if (barcodeDetectorRef.current) {
          barcodeDetectorRef.current
            .detect(video)
            .then((barcodes: any[]) => {
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                isScanningActiveRef.current = false;
                playSuccessSound();
                stopCamera();
                onScanSuccess(barcodes[0].rawValue);
                return;
              }
            })
            .catch(() => {});
        }

        // 2. jsQR offscreen canvas
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'attemptBoth'
          });

          if (code && code.data) {
            isScanningActiveRef.current = false;
            playSuccessSound();
            stopCamera();
            onScanSuccess(code.data);
            return;
          }
        }
      } catch (scanErr) {
        // Soft error: don't crash loop on single corrupted frame
        console.warn('Scan frame processing error caught:', scanErr);
      }
    }

    if (isScanningActiveRef.current) {
      animFrameIdRef.current = requestAnimationFrame(scanVideoFrame);
    }
  }, [onScanSuccess, playSuccessSound, stopCamera]);

  // Start Camera Stream with progressive fallback and full error diagnosis
  const startCamera = useCallback(
    async (targetFacing: 'environment' | 'user' = facingMode, manualRetry: boolean = false) => {
      setCameraError(null);
      setErrorType(null);
      setIsStartingCamera(true);
      setShowPermissionGuide(false);
      setScanHelpTip(false);

      if (manualRetry) {
        setRetryCount((prev) => prev + 1);
      }

      // Stop any existing stream before restarting
      stopCamera();

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setErrorType('unsupported');
          throw new Error(
            'Live camera access is not supported by your browser or environment. Please use the Membership ID option to verify.'
          );
        }

        // High-compatibility constraint fallbacks using ideal facingMode (never throws OverconstrainedError)
        const attempts: MediaStreamConstraints[] = [
          { video: { facingMode: { ideal: targetFacing } } },
          { video: { facingMode: { ideal: targetFacing === 'environment' ? 'user' : 'environment' } } },
          { video: true }
        ];

        let stream: MediaStream | null = null;
        let lastError: any = null;

        for (const constraints of attempts) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (stream) break;
          } catch (err: any) {
            lastError = err;
            if (
              err.name === 'NotAllowedError' ||
              err.name === 'PermissionDeniedError' ||
              err.name === 'SecurityError'
            ) {
              // Permission error is terminal for this attempt, don't spam getUserMedia
              throw err;
            }
          }
        }

        if (!stream) {
          throw lastError || new Error('Unable to initialize device camera.');
        }

        streamRef.current = stream;
        setFacingMode(targetFacing);
        setIsCameraActive(true);
        setIsStartingCamera(false);

        // Detect multiple camera devices safely after permission is granted
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          if (videoInputs.length > 1) {
            setHasMultipleCameras(true);
          }
        } catch {}
        isScanningActiveRef.current = true;

        // Check if track supports torch
        try {
          const track = stream.getVideoTracks()[0];
          if (track && 'getCapabilities' in track) {
            const caps = (track as any).getCapabilities();
            if (caps && caps.torch) {
              setTorchSupported(true);
            }
          }
        } catch {}

        // Bind stream to video element
        if (videoRef.current) {
          const video = videoRef.current;
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;

          video.onloadedmetadata = async () => {
            try {
              await video.play();
            } catch (playErr) {
              console.warn('Video play auto-start issue:', playErr);
            }
            if (isScanningActiveRef.current) {
              scanVideoFrame();
            }
          };

          video.play().catch(() => {});
        }

        // Start scanning timeout hint (if user is pointing camera for >12s without code detected)
        scanTimerRef.current = setTimeout(() => {
          if (isScanningActiveRef.current) {
            setScanHelpTip(true);
          }
        }, 12000);
      } catch (err: any) {
        console.warn('Camera stream error:', err);
        let msg = 'Could not access camera.';
        let type: CameraErrorType = 'general';

        if (
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError' ||
          err.name === 'SecurityError'
        ) {
          type = 'permission_denied';
          msg =
            'Camera permission was denied. Please allow camera access in your browser to scan the QR code live.';
          setShowPermissionGuide(true);
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          type = 'not_found';
          msg = 'No camera hardware found on this system.';
        } else if (
          err.name === 'NotReadableError' ||
          err.name === 'TrackStartError' ||
          err.name === 'AbortError'
        ) {
          type = 'hardware_busy';
          msg =
            'Camera is in use by another application (e.g. Zoom, Teams, Meet) or the operating system.';
        } else if (err.message && err.message.includes('not supported')) {
          type = 'unsupported';
          msg = err.message;
        } else if (err.message) {
          msg = err.message;
        }

        setErrorType(type);
        setCameraError(msg);
        setIsCameraActive(false);
        setIsStartingCamera(false);
      }
    },
    [facingMode, scanVideoFrame, stopCamera]
  );

  // Toggle front/back cameras
  const toggleFacingMode = useCallback(() => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    startCamera(nextFacing, false);
  }, [facingMode, startCamera]);

  // Decode QR code from an uploaded image file (fallback mechanism)
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsProcessingImage(true);
      setCameraError(null);

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              throw new Error('Could not create canvas context to decode image.');
            }
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imgData.data, imgData.width, imgData.height, {
              inversionAttempts: 'attemptBoth'
            });

            if (code && code.data) {
              playSuccessSound();
              stopCamera();
              onScanSuccess(code.data);
            } else {
              setCameraError(
                'No readable QR code found in the selected image. Please make sure the QR code on the NMO ID card is sharp and well-lit.'
              );
              setErrorType('general');
            }
          } catch (err: any) {
            setCameraError(err.message || 'Failed to decode image.');
            setErrorType('general');
          } finally {
            setIsProcessingImage(false);
          }
        };
        img.onerror = () => {
          setCameraError('Failed to load image file.');
          setErrorType('general');
          setIsProcessingImage(false);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
      // Reset input value so same file can be re-selected if desired
      e.target.value = '';
    },
    [onScanSuccess, playSuccessSound, stopCamera]
  );

  // Stop camera when modal becomes inactive or unmounts.
  // Camera permission is ONLY requested after the user clicks "Open Camera to Scan QR".
  useEffect(() => {
    if (!isActive) {
      stopCamera();
      setIsCameraActive(false);
      setIsStartingCamera(false);
    }
    return () => {
      stopCamera();
    };
  }, [isActive, stopCamera]);

  return (
    <div className="space-y-4">
      {/* Hidden file inputs: one for standard upload, one with native camera capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* ERROR BANNER WITH RETRY CONTROLS */}
      {cameraError && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs rounded-2xl space-y-3 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-900 text-xs uppercase tracking-wide">
                  {errorType === 'permission_denied'
                    ? 'Camera Permission Required'
                    : errorType === 'hardware_busy'
                    ? 'Camera Busy'
                    : errorType === 'not_found'
                    ? 'No Camera Found'
                    : 'Scanner Notice'}
                </span>
                {retryCount > 0 && (
                  <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded-md">
                    Retry #{retryCount}
                  </span>
                )}
              </div>
              <p className="font-semibold text-slate-800 leading-relaxed">{cameraError}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200">
            <button
              type="button"
              onClick={() => startCamera(facingMode, true)}
              disabled={isStartingCamera}
              className="px-3.5 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isStartingCamera ? 'animate-spin' : ''}`} />
              <span>{isStartingCamera ? 'Reconnecting...' : 'Retry Camera Scanner'}</span>
            </button>

            <button
              type="button"
              onClick={() => nativeCameraInputRef.current?.click()}
              disabled={isProcessingImage}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Open device camera directly without browser WebRTC permissions"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Snap Photo with Camera</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingImage}
              className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>{isProcessingImage ? 'Decoding Image...' : 'Upload ID Card Image'}</span>
            </button>

            <button
              type="button"
              onClick={onSwitchToIdMode}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs ml-auto"
            >
              <CreditCard className="w-3.5 h-3.5 text-blue-400" />
              <span>Enter Membership ID Instead</span>
            </button>
          </div>

          {/* Collapsible Permission Unlock Guide */}
          {showPermissionGuide && (
            <div className="bg-white/80 rounded-xl p-3 border border-amber-200 mt-2 text-[11px] text-slate-700 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>How to allow camera access:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-600">
                <li>Look for the camera icon 🎥 or lock icon 🔒 on the left side of your browser URL bar.</li>
                <li>Click it and change <strong>Camera</strong> from "Block" to <strong>"Allow"</strong>.</li>
                <li>Click the red <strong>"Retry Camera Scanner"</strong> button above.</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* SCANNING TIMEOUT TIP (HELPS USERS WITH DIFFICULT LIGHTING / ORIENTATION) */}
      {isCameraActive && scanHelpTip && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-[11px] leading-tight">
              Hold the ID card steady inside the red square. If blurry, move the card 15cm back or improve lighting.
            </span>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 bg-white border border-blue-300 text-blue-800 hover:bg-blue-100 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer"
          >
            Upload Photo
          </button>
        </div>
      )}

      {/* CAMERA VIEWPORT CONTAINER */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-4/3 max-h-80 border-2 border-red-600 shadow-xl flex items-center justify-center">
        {/* Video feed */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isCameraActive ? 'opacity-100' : 'opacity-20'
          }`}
          playsInline
          muted
          autoPlay
        />

        {/* Framing Overlay when camera active */}
        {isCameraActive && (
          <>
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
              <div className="w-48 h-48 sm:w-56 sm:h-56 border-2 border-white/70 rounded-2xl relative shadow-2xl">
                {/* Four Corner Marks */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-red-500 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-red-500 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-red-500 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-red-500 rounded-br-lg" />

                {/* Animated Scan Line */}
                <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_rgba(239,68,68,1)] animate-bounce duration-1000" />
              </div>
            </div>

            {/* Status bar & camera switch overlay */}
            <div className="absolute bottom-3 inset-x-3 flex items-center justify-between text-xs text-white">
              <span className="px-2.5 py-1.5 bg-black/70 backdrop-blur-xs rounded-lg text-[11px] font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Align ID Card QR in box
              </span>

              <div className="flex items-center gap-2">
                {/* Torch toggle button */}
                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 transition-colors ${
                      torchOn ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-white/20 hover:bg-white/30 text-white'
                    }`}
                    title={torchOn ? 'Turn Flash Off' : 'Turn Flash On'}
                  >
                    {torchOn ? <ZapOff className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                    <span>{torchOn ? 'Flash On' : 'Flash'}</span>
                  </button>
                )}

                {/* Flip camera */}
                {hasMultipleCameras && (
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1"
                    title="Flip Camera (Front/Back)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Flip</span>
                  </button>
                )}

                {/* Close Camera button */}
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-3 py-1.5 bg-red-600/90 hover:bg-red-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs"
                >
                  Close Camera
                </button>
              </div>
            </div>
          </>
        )}

        {/* Camera Activation / Standby Overlay */}
        {!isCameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 text-white">
            <div className="w-14 h-14 rounded-2xl bg-red-600/20 text-red-400 border border-red-500/40 flex items-center justify-center mb-3 shadow-inner">
              <Camera className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-white mb-1">
              {isStartingCamera ? 'Connecting to Camera...' : 'Camera Standby'}
            </h4>
            <p className="text-xs text-slate-300 max-w-xs mb-4 leading-relaxed">
              {isStartingCamera
                ? 'Requesting camera permission in browser...'
                : 'Click "Open Camera to Scan QR" below. Camera permission will only be requested after you click.'}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => startCamera('environment', false)}
                disabled={isStartingCamera}
                className="px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-lg flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-60"
              >
                <Camera className="w-4 h-4" />
                <span>{isStartingCamera ? 'Opening Camera...' : 'Open Camera to Scan QR'}</span>
              </button>

              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                disabled={isProcessingImage}
                className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                title="Open device camera directly"
              >
                <Camera className="w-4 h-4" />
                <span>Snap Photo with Camera</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingImage}
                className="px-3.5 py-2.5 bg-white/20 hover:bg-white/30 text-white text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Image</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Helpful bottom guide */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            <strong>Automatic Real-time Verification:</strong> Point your camera at the QR code printed on the official NMO Gujarat ID card. It instantly authenticates against the central membership database.
          </p>
        </div>
        <button
          type="button"
          onClick={onSwitchToIdMode}
          className="text-[11px] font-bold text-red-700 hover:text-red-800 hover:underline shrink-0 cursor-pointer pt-0.5"
        >
          Use ID Number →
        </button>
      </div>
    </div>
  );
};
