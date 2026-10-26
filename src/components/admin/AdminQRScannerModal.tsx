import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNMO } from '../../context/NMOContext';
import { LiveQRScanner, QRScannerErrorBoundary } from '../LiveQRScanner';
import { AttendanceStatus, ApprovalStatus } from '../../types/nmo';
import {
  ScanLine,
  X,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Users,
  RefreshCw,
  UserCheck,
  CreditCard,
  Sparkles,
  Volume2,
  VolumeX,
  Check,
  ShieldCheck,
  Clock,
  ArrowRight
} from 'lucide-react';

interface AdminQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEventId?: string | null;
}

interface ScanRecord {
  id: string;
  membershipNumber: string;
  name: string;
  timestamp: string;
  eventTitle: string;
  status: 'attended' | 'new_registered_attended';
}

/**
 * Robust ID Card QR data extractor supporting:
 * 1. JSON payload: {"org":"NMO-GUJARAT", "id":"9521", "name":"...", "role":"..."}
 * 2. Verification URL: https://.../verify?id=9521
 * 3. Text format: "ID: 9521 | Name: Dr. Devansh"
 * 4. Raw alphanumeric membership ID: "9521" or "NMO-001"
 */
export function parseIdCardQRData(data: string): {
  membershipNumber: string;
  name?: string;
  role?: string;
  college?: string;
  city?: string;
} | null {
  if (!data || typeof data !== 'string') return null;
  const clean = data.trim();

  // 1. Try parsing JSON
  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const parsed = JSON.parse(clean);
      const memId = (parsed.id || parsed.membershipNumber || parsed.membershipId || '').toString().trim().toUpperCase();
      if (memId) {
        return {
          membershipNumber: memId,
          name: parsed.name || parsed.memberName,
          role: parsed.role,
          college: parsed.college || parsed.medicalCollege,
          city: parsed.city
        };
      }
    } catch {}
  }

  // 2. Try parsing URL query params (e.g. ?id=9521 or ?mem=9521)
  if (clean.includes('?') || clean.includes('/')) {
    try {
      const url = new URL(clean.startsWith('http') ? clean : `https://example.com/${clean}`);
      const idParam = url.searchParams.get('id') || url.searchParams.get('membershipNumber') || url.searchParams.get('mem');
      if (idParam) {
        return {
          membershipNumber: idParam.trim().toUpperCase(),
          name: url.searchParams.get('name') || undefined
        };
      }
    } catch {}
  }

  // 3. Try parsing text with ID: or NMO-
  const idMatch = clean.match(/(?:ID[:\s]+|Membership\s*No[:\s]+)?(NMO-[A-Z0-9-]+|\d{3,})/i);
  if (idMatch && idMatch[1]) {
    const nameMatch = clean.match(/Name[:\s]+([^|\n,]+)/i);
    return {
      membershipNumber: idMatch[1].trim().toUpperCase(),
      name: nameMatch ? nameMatch[1].trim() : undefined
    };
  }

  // 4. Raw membership ID (e.g. 9521, NMO-ADMIN-001)
  if (/^[A-Z0-9-]{3,20}$/i.test(clean)) {
    return {
      membershipNumber: clean.toUpperCase()
    };
  }

  return null;
}

export const AdminQRScannerModal: React.FC<AdminQRScannerModalProps> = ({
  isOpen,
  onClose,
  defaultEventId
}) => {
  const {
    events,
    users,
    updateParticipantAttendance,
    updateParticipantApproval,
    addEventRSVPManually
  } = useNMO();

  // Selected event for attendance recording
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [lastScannedMember, setLastScannedMember] = useState<{
    membershipNumber: string;
    name: string;
    action: string;
    timestamp: string;
  } | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manualInputId, setManualInputId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Debounce ref to avoid scanning the exact same ID card twice within 3 seconds
  const lastScannedTimeMapRef = useRef<Map<string, number>>(new Map());

  // Set default event
  useEffect(() => {
    if (defaultEventId) {
      setSelectedEventId(defaultEventId);
    } else if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].eventId);
    }
  }, [defaultEventId, events]);

  // Audio chime feedback
  const playPositiveBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {}
  }, [soundEnabled]);

  const activeEvent = events.find((e) => e.eventId === selectedEventId);

  // Process extracted member ID and automatically mark attendance
  const processMemberAttendance = useCallback(
    async (extractedMemNo: string, extractedName?: string) => {
      const cleanNo = extractedMemNo.trim().toUpperCase();
      if (!cleanNo) return;

      if (!selectedEventId) {
        setScanError('Please select an event before scanning ID cards.');
        return;
      }

      // Debounce check: prevent double-scan within 3000ms
      const now = Date.now();
      const lastScanned = lastScannedTimeMapRef.current.get(cleanNo);
      if (lastScanned && now - lastScanned < 3000) {
        return;
      }
      lastScannedTimeMapRef.current.set(cleanNo, now);

      setIsProcessing(true);
      setScanError(null);

      try {
        // 1. Look up authoritative member from users database
        const matchedUser = users.find(
          (u) => u.membershipNumber.trim().toUpperCase() === cleanNo
        );
        const memberName = matchedUser?.name || extractedName || 'NMO Doctor / Student';

        const currentEvt = events.find((e) => e.eventId === selectedEventId);
        const eventTitle = currentEvt?.title || 'Selected Event';

        // 2. Check if already in participants list
        const existingParticipant = (currentEvt?.participants || []).find(
          (p) => p.membershipNumber.toUpperCase() === cleanNo
        );

        let actionType: 'attended' | 'new_registered_attended' = 'attended';

        if (existingParticipant) {
          // Participant already registered: update attendance & approval
          await updateParticipantAttendance(selectedEventId, cleanNo, 'Attended');
          await updateParticipantApproval(selectedEventId, cleanNo, 'Approved');
        } else {
          // Walk-in / new attendee: automatically register and mark attended
          actionType = 'new_registered_attended';
          await addEventRSVPManually(selectedEventId, {
            membershipNumber: cleanNo,
            name: memberName,
            email: matchedUser?.email || '',
            phone: matchedUser?.phone || '',
            medicalCollege: matchedUser?.medicalCollege || '',
            prant: matchedUser?.prant || currentEvt?.prant || 'Gujarat',
            approvalStatus: 'Approved',
            attendanceStatus: 'Attended'
          });
        }

        // 3. Audio & visual confirmation
        playPositiveBeep();

        const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        setLastScannedMember({
          membershipNumber: cleanNo,
          name: memberName,
          action: actionType === 'new_registered_attended' ? 'Registered & Marked Present' : 'Marked Present',
          timestamp: timestampStr
        });

        setScanHistory((prev) => [
          {
            id: `scan-${now}-${cleanNo}`,
            membershipNumber: cleanNo,
            name: memberName,
            timestamp: timestampStr,
            eventTitle,
            status: actionType
          },
          ...prev.slice(0, 19)
        ]);
      } catch (err: any) {
        setScanError(`Failed to mark attendance for ${cleanNo}: ${err.message || err}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [selectedEventId, events, users, updateParticipantAttendance, updateParticipantApproval, addEventRSVPManually, playPositiveBeep]
  );

  const handleScanSuccess = useCallback(
    (decodedData: string) => {
      const parsed = parseIdCardQRData(decodedData);
      if (parsed?.membershipNumber) {
        processMemberAttendance(parsed.membershipNumber, parsed.name);
      } else {
        setScanError(`Scanned code is not a recognized NMO Gujarat ID card: "${decodedData.slice(0, 30)}..."`);
      }
    },
    [processMemberAttendance]
  );

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInputId.trim()) return;
    processMemberAttendance(manualInputId.trim());
    setManualInputId('');
  };

  if (!isOpen) return null;

  const attendedCount = (activeEvent?.participants || []).filter(
    (p) => p.attendanceStatus === 'Attended'
  ).length;
  const totalCount = activeEvent?.participants?.length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-red-700 via-red-800 to-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center text-amber-300 shadow-inner">
              <ScanLine className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  Admin ID Card Attendance Scanner
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
                  Auto-Mark Present
                </span>
              </div>
              <p className="text-xs text-amber-200/90 mt-0.5">
                Scan member ID card QR codes to automatically record attendance & grant approval
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled((v) => !v)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title={soundEnabled ? 'Mute Chime' : 'Enable Chime'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-300" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
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

        {/* Event Selection & Live Count Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1">
            <Calendar className="w-4 h-4 text-red-700 shrink-0" />
            <span className="font-bold text-slate-700 shrink-0">Target Event:</span>
            <select
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setScanError(null);
                setLastScannedMember(null);
              }}
              className="w-full sm:max-w-md bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-800 focus:ring-2 focus:ring-red-600 focus:outline-hidden"
            >
              {events.map((evt) => (
                <option key={evt.eventId} value={evt.eventId}>
                  {evt.title} ({evt.date}) — {evt.city}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>
                Present: <strong>{attendedCount}</strong> / {totalCount}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Active Success Notification Banner */}
          {lastScannedMember && (
            <div className="p-4 rounded-2xl bg-emerald-500 text-white shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-white/20 px-2 py-0.5 rounded font-black">
                      ID: {lastScannedMember.membershipNumber}
                    </span>
                    <span className="text-xs font-bold bg-amber-300 text-slate-950 px-2 py-0.5 rounded-full">
                      {lastScannedMember.action}
                    </span>
                  </div>
                  <h4 className="text-base font-black text-white mt-0.5">
                    {lastScannedMember.name}
                  </h4>
                  <p className="text-[11px] text-emerald-100">
                    Recorded at {lastScannedMember.timestamp} · Eligible for Event Certificate
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLastScannedMember(null)}
                className="text-white/70 hover:text-white p-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* Error Banner */}
          {scanError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-semibold">{scanError}</span>
              </div>
              <button
                type="button"
                onClick={() => setScanError(null)}
                className="text-rose-400 hover:text-rose-700 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Grid Layout: Left Scanner, Right Scan Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Live Camera Scanner Box */}
            <div className="lg:col-span-7 space-y-3">
              <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 relative min-h-[300px]">
                <QRScannerErrorBoundary
                  onReset={() => {
                    setScanError(null);
                  }}
                  onSwitchToIdMode={() => {}}
                >
                  <LiveQRScanner
                    isActive={isOpen}
                    onScanSuccess={handleScanSuccess}
                    onSwitchToIdMode={() => {}}
                  />
                </QRScannerErrorBoundary>
              </div>

              {/* Fast Manual Entry Fallback */}
              <form onSubmit={handleManualSubmit} className="flex items-center gap-2 text-xs">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={manualInputId}
                    onChange={(e) => setManualInputId(e.target.value)}
                    placeholder="Or type Membership ID (e.g. 9521) and press Enter..."
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold uppercase focus:ring-2 focus:ring-red-600 focus:bg-white focus:outline-hidden"
                  />
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
                <button
                  type="submit"
                  disabled={!manualInputId.trim() || isProcessing}
                  className="px-4 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold rounded-xl shrink-0 cursor-pointer shadow-xs"
                >
                  Mark Present
                </button>
              </form>
            </div>

            {/* Right Column: Live Session Activity Log */}
            <div className="lg:col-span-5 bg-slate-50 rounded-2xl border border-slate-200 p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-600" />
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                      Live Attendance Log ({scanHistory.length})
                    </h4>
                  </div>
                  {scanHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setScanHistory([])}
                      className="text-[10px] text-slate-500 hover:text-red-700 font-semibold cursor-pointer"
                    >
                      Clear Log
                    </button>
                  )}
                </div>

                {scanHistory.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 space-y-2">
                    <ScanLine className="w-8 h-8 mx-auto text-slate-300 animate-pulse" />
                    <p className="text-xs font-semibold text-slate-600">Awaiting QR Scans</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      Hold member ID cards in front of the camera. Scanned members will be automatically marked present in real time.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {scanHistory.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                          idx === 0
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-bold">
                              {item.membershipNumber}
                            </span>
                            <span className="font-bold truncate">{item.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                            {item.status === 'new_registered_attended' ? 'Registered & Present' : 'Present (Attended)'}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {item.timestamp}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                <span>Auto-approves attendance & unlocks certificates</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Real-time DB Sync</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            Members marked <strong>Attended</strong> are automatically granted access to download or upload certificates for this event.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold cursor-pointer transition-colors shadow-xs"
          >
            Done Scanning
          </button>
        </div>
      </div>
    </div>
  );
};
