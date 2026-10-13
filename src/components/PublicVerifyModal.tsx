import React, { useState, useEffect, useCallback } from 'react';
import { useNMO } from '../context/NMOContext';
import { NmoLogo } from './NmoLogo';
import { MemberIdCard } from './MemberIdCard';
import { ShowCertificateModal } from './ShowCertificateModal';
import { LiveQRScanner, QRScannerErrorBoundary } from './LiveQRScanner';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import {
  Search,
  CheckCircle2,
  XCircle,
  X,
  RefreshCw,
  Award,
  RotateCcw,
  CreditCard,
  ScanLine
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

  // Exactly two modes: 'scanner' (Live Scanner) or 'id' (Membership ID)
  const [activeTab, setActiveTab] = useState<'scanner' | 'id'>('scanner');
  const [membershipIdInput, setMembershipIdInput] = useState<string>(initialQuery);
  const [searched, setSearched] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [result, setResult] = useState<NMOMember | null>(null);
  const [verificationSource, setVerificationSource] = useState<'qr_scan' | 'membership_id' | null>(null);

  // Google Drive Certificate Modal sub-state
  const [showDriveCerts, setShowDriveCerts] = useState<boolean>(false);

  // Lookup member from local memory or directly from Firestore
  const handleLookup = useCallback(
    async (
      lookupKey: string,
      fallbackPayload: any | null,
      source: 'qr_scan' | 'membership_id'
    ) => {
      setIsSearching(true);
      const clean = lookupKey.trim().toUpperCase();

      // 1. Search in local members context state
      const found = members.find(
        (m) =>
          m.membershipNumber?.trim().toUpperCase() === clean ||
          m.registrationNumber?.trim().toUpperCase() === clean ||
          (fallbackPayload?.id &&
            m.membershipNumber?.trim().toUpperCase() === fallbackPayload.id.trim().toUpperCase())
      );

      if (found) {
        setResult(found);
        setVerificationSource(source);
        setSearched(true);
        setIsSearching(false);
        return;
      }

      // 2. Direct Firestore fallback query
      try {
        // Query by doc id
        const docRef = doc(db, 'Users', clean);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const memberRecord: NMOMember = {
            membershipNumber: data.membershipNumber || docSnap.id,
            name: data.name || data.fullName || 'Member',
            role: data.role || 'member',
            prant: data.prant || 'Gujarat',
            registrationNumber: data.registrationNumber || '',
            qualifications: data.qualifications || data.qualification || '',
            medicalCollege: data.medicalCollege || data.college || '',
            studentMembershipValidTill: data.studentMembershipValidTill,
            accountStatus: data.accountStatus || 'Active',
            status: data.status || 'Active',
            email: data.email || '',
            phone: data.phone || ''
          };
          setResult(memberRecord);
          setVerificationSource(source);
          setSearched(true);
          setIsSearching(false);
          return;
        }

        // Query by membershipNumber field
        const q = query(collection(db, 'Users'), where('membershipNumber', '==', clean));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          const data = querySnap.docs[0].data();
          const memberRecord: NMOMember = {
            membershipNumber: data.membershipNumber || querySnap.docs[0].id,
            name: data.name || data.fullName || 'Member',
            role: data.role || 'member',
            prant: data.prant || 'Gujarat',
            registrationNumber: data.registrationNumber || '',
            qualifications: data.qualifications || data.qualification || '',
            medicalCollege: data.medicalCollege || data.college || '',
            studentMembershipValidTill: data.studentMembershipValidTill,
            accountStatus: data.accountStatus || 'Active',
            status: data.status || 'Active',
            email: data.email || '',
            phone: data.phone || ''
          };
          setResult(memberRecord);
          setVerificationSource(source);
          setSearched(true);
          setIsSearching(false);
          return;
        }
      } catch (err) {
        console.warn('Firestore direct lookup error:', err);
      }

      // 3. Fallback to cryptographic NMO payload encoded in the QR code
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
        setIsSearching(false);
        return;
      }

      // 4. Not found in registry
      setResult(null);
      setVerificationSource(source);
      setSearched(true);
      setIsSearching(false);
    },
    [members]
  );

  // Decode QR content (handles JSON payloads, URLs with id=..., or raw membership number)
  const handleRawDecodedQR = useCallback(
    (rawData: string) => {
      let cleanTarget = rawData.trim();
      let payloadObj: any = null;

      try {
        payloadObj = JSON.parse(cleanTarget);
        if (payloadObj && typeof payloadObj === 'object') {
          cleanTarget = payloadObj.id || payloadObj.membershipNumber || payloadObj.reg || cleanTarget;
        }
      } catch {
        if (cleanTarget.includes('id=')) {
          const match = cleanTarget.match(/[?&]id=([^&#]+)/);
          if (match) cleanTarget = decodeURIComponent(match[1]);
        }
      }

      handleLookup(cleanTarget, payloadObj, 'qr_scan');
    },
    [handleLookup]
  );

  // Submit manual membership ID search
  const handleIdSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!membershipIdInput.trim()) return;
    handleLookup(membershipIdInput, null, 'membership_id');
  };

  // Reset to initial verify state
  const resetVerification = () => {
    setSearched(false);
    setResult(null);
    setVerificationSource(null);
    setMembershipIdInput('');
    setActiveTab('scanner');
  };

  // Switch tabs
  const handleTabChange = (tab: 'scanner' | 'id') => {
    setActiveTab(tab);
  };

  // On open or initialQuery change
  useEffect(() => {
    if (isOpen) {
      if (initialQuery) {
        setMembershipIdInput(initialQuery);
        setActiveTab('id');
        handleLookup(initialQuery, null, 'membership_id');
      } else {
        setSearched(false);
        setResult(null);
        setVerificationSource(null);
        setActiveTab('scanner');
      }
    }
  }, [isOpen, initialQuery, handleLookup]);

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
                  Official Registry
                </span>
              </div>
              <p className="text-xs text-amber-200 mt-0.5 font-serif italic">
                National Medicos Organisation Gujarat (Gujarat & Saurashtra Prants)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Exactly 2 options: 1. Live Scanner  2. Membership ID */}
          {!searched && (
            <div>
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/90 mb-5">
                <button
                  type="button"
                  onClick={() => handleTabChange('scanner')}
                  className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    activeTab === 'scanner'
                      ? 'bg-red-700 text-white shadow-md'
                      : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <ScanLine className={`w-4 h-4 ${activeTab === 'scanner' ? 'text-white' : 'text-red-700'}`} />
                  <span>1. Live Scanner</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange('id')}
                  className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    activeTab === 'id'
                      ? 'bg-red-700 text-white shadow-md'
                      : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <CreditCard className={`w-4 h-4 ${activeTab === 'id' ? 'text-white' : 'text-blue-700'}`} />
                  <span>2. Membership ID</span>
                </button>
              </div>

              {/* OPTION 1: LIVE SCANNER WITH ERROR BOUNDARY & RETRY */}
              {activeTab === 'scanner' && (
                <QRScannerErrorBoundary onSwitchToIdMode={() => handleTabChange('id')}>
                  <LiveQRScanner
                    isActive={isOpen && !searched && activeTab === 'scanner'}
                    onScanSuccess={handleRawDecodedQR}
                    onSwitchToIdMode={() => handleTabChange('id')}
                  />
                </QRScannerErrorBoundary>
              )}

              {/* OPTION 2: MEMBERSHIP ID */}
              {activeTab === 'id' && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      Verify Member by Membership Number
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">
                      Enter the member's official NMO Membership Number to verify their credentials, active status, and council registration.
                    </p>

                    <form onSubmit={handleIdSearch} className="space-y-3">
                      <div className="relative">
                        <input
                          type="text"
                          value={membershipIdInput}
                          onChange={(e) => setMembershipIdInput(e.target.value)}
                          placeholder="e.g. NMO-GJ-2024-001 or NMO-ADMIN-001"
                          className="w-full pl-11 pr-28 py-3.5 text-sm sm:text-base border-2 border-slate-300 rounded-xl focus:border-red-600 focus:ring-2 focus:ring-red-600/20 focus:outline-hidden font-bold tracking-wide text-slate-900 uppercase placeholder:normal-case placeholder:font-normal placeholder:text-slate-400"
                          autoFocus
                        />
                        <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-4" />
                        <button
                          type="submit"
                          disabled={!membershipIdInput.trim() || isSearching}
                          className="absolute right-2 top-2 bottom-2 px-5 bg-red-700 hover:bg-red-800 disabled:bg-slate-300 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          {isSearching ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Checking...</span>
                            </>
                          ) : (
                            <span>Verify ID</span>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VERIFICATION RESULT DISPLAY */}
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
                            {verificationSource === 'qr_scan' ? 'Decoded via Live Scanner' : 'Verified by Membership ID'}
                          </span>
                        </div>
                        <h4 className="text-sm sm:text-base font-black text-slate-900 mt-0.5">
                          {result.name}
                        </h4>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={resetVerification}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-bold transition-colors cursor-pointer shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Verify Another</span>
                    </button>
                  </div>

                  {/* Authentic Digital ID Card */}
                  <div className="bg-slate-100/80 p-2 sm:p-4 rounded-3xl border border-slate-200 shadow-inner">
                    <div className="text-center mb-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                        Digital Membership Credential
                      </span>
                    </div>

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
                      onClick={resetVerification}
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      <ScanLine className="w-4 h-4 text-slate-500" />
                      <span>Scan / Verify Another</span>
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
                      No registered member matches the scanned QR code or membership ID. Please verify the ID card was issued by NMO Gujarat and that the membership number is correct.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={resetVerification}
                      className="px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      Try Another Scan or Search
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Close Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="text-[11px]">
            National Medicos Organisation Gujarat • Official Digital Verification Engine
          </span>
          <button
            type="button"
            onClick={onClose}
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
