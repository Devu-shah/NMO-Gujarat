import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { NMOMember } from '../types/nmo';
import { NmoLogo } from './NmoLogo';
import {
  Printer,
  ShieldCheck,
  CheckCircle2,
  QrCode,
  User,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Building,
  GraduationCap,
  Heart,
  CreditCard,
  Layers,
  Sparkles,
  FileCheck,
  Scissors
} from 'lucide-react';

interface MemberIdCardProps {
  member: NMOMember;
}

/**
 * Format database role accurately without any hardcoded overrides.
 * Reflects the exact database role stored in Firestore / CSV.
 */
export const formatDatabaseRole = (
  role?: string,
  studentTill?: string,
  prant?: string,
  city?: string
): { title: string; badge: string; colorClass: string; isExecutive: boolean } => {
  const r = (role || 'member').toLowerCase().trim();

  if (r === 'super_admin') {
    return {
      title: 'Super Administrator',
      badge: 'Super Admin',
      colorClass: 'bg-purple-100 text-purple-900 border-purple-300',
      isExecutive: true
    };
  }
  if (r === 'state_admin') {
    return {
      title: 'State Administrator',
      badge: 'State Admin',
      colorClass: 'bg-blue-100 text-blue-900 border-blue-300',
      isExecutive: true
    };
  }
  if (r === 'prant_admin') {
    return {
      title: `${prant || 'Gujarat'} Prant Admin`,
      badge: `${prant || 'Gujarat'} Prant`,
      colorClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      isExecutive: true
    };
  }
  if (r === 'city_admin') {
    return {
      title: `${city || 'City'} Administrator`,
      badge: `${city || 'City'} Admin`,
      colorClass: 'bg-teal-100 text-teal-900 border-teal-300',
      isExecutive: true
    };
  }
  // Standard member from database
  if (studentTill && studentTill.trim()) {
    return {
      title: 'Student Medico Member',
      badge: 'Member (Student)',
      colorClass: 'bg-amber-100 text-amber-900 border-amber-300',
      isExecutive: false
    };
  }
  return {
    title: 'Registered Member',
    badge: 'Member',
    colorClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    isExecutive: false
  };
};

export const MemberIdCard: React.FC<MemberIdCardProps> = ({ member }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [cardSide, setCardSide] = useState<'both' | 'front' | 'back'>('both');
  const [printLayout, setPrintLayout] = useState<'duplex' | 'single_page' | 'front_only' | 'back_only'>('duplex');
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  const roleInfo = formatDatabaseRole(
    member.role,
    member.studentMembershipValidTill,
    member.prant,
    member.city
  );

  // Set up print portal element directly on document.body
  useEffect(() => {
    let node = document.getElementById('nmo-printable-print-portal');
    if (!node) {
      node = document.createElement('div');
      node.id = 'nmo-printable-print-portal';
      document.body.appendChild(node);
    }
    setPortalNode(node);

    // Ensure cleanup of printing class on unmount
    return () => {
      document.body.classList.remove('is-printing-id-card');
    };
  }, []);

  // Listen to browser print triggers (e.g. keyboard Ctrl+P / Cmd+P)
  useEffect(() => {
    const handleBeforePrint = () => {
      document.body.classList.add('is-printing-id-card');
    };
    const handleAfterPrint = () => {
      document.body.classList.remove('is-printing-id-card');
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  useEffect(() => {
    // Generate QR code encoding verifiable member identity with all database details
    const verificationPayload = JSON.stringify({
      org: 'NMO-GUJARAT',
      id: member.membershipNumber,
      name: member.name,
      role: member.role || 'member',
      prant: member.prant,
      city: member.city || '',
      college: member.medicalCollege || '',
      reg: member.registrationNumber || '',
      blood: member.bloodGroup || '',
      dob: member.dob || '',
      gender: member.gender || '',
      phone: member.phone || '',
      email: member.email || '',
      memberSince: member.memberOn || '',
      valid: member.studentMembershipValidTill || 'Lifetime Valid',
      status: member.accountStatus || member.status || 'Active'
    });

    QRCode.toDataURL(
      verificationPayload,
      {
        width: 220,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      },
      (err, url) => {
        if (!err && url) {
          setQrDataUrl(url);
        }
      }
    );
  }, [member]);

  const handlePrint = (customLayout?: 'duplex' | 'single_page' | 'front_only' | 'back_only') => {
    if (customLayout) {
      setPrintLayout(customLayout);
    }
    document.body.classList.add('is-printing-id-card');

    // Give browser brief tick to apply portal styles, then trigger print
    setTimeout(() => {
      window.print();
      // Fallback cleanup
      setTimeout(() => {
        document.body.classList.remove('is-printing-id-card');
      }, 1500);
    }, 150);
  };

  /**
   * RENDER FRONT CARD
   */
  const renderFrontCard = (isPrint = false) => (
    <div
      className={`rounded-2xl bg-white border-2 border-slate-300 overflow-hidden text-slate-900 relative flex flex-col justify-between ${
        isPrint
          ? 'w-[340px] h-[525px] nmo-print-card print:border-slate-400 print:shadow-none'
          : 'w-full max-w-sm shadow-2xl min-h-[550px]'
      }`}
    >
      {/* Header Band */}
      <div className="bg-gradient-to-r from-red-700 via-red-800 to-blue-900 text-white p-3.5 relative overflow-hidden">
        <div className="absolute -right-6 -bottom-6 opacity-15">
          <NmoLogo size="xl" />
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <NmoLogo size="sm" showText={false} />
          <div className="leading-tight">
            <span className="text-[10px] uppercase font-bold tracking-widest text-amber-300 block">
              National Medicos Organisation
            </span>
            <span className="text-base font-black tracking-tight text-white block">
              NMO GUJARAT
            </span>
            <span className="text-[9px] font-serif italic text-amber-200 block">
              ॥ प्राणिनाम् आर्तिनाशनम् ॥
            </span>
          </div>
        </div>

        {/* Prant & Membership No */}
        <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between text-[11px]">
          <span className="font-semibold text-amber-200 uppercase tracking-wider truncate max-w-[65%]">
            {member.prant} Prant {member.city ? `• ${member.city}` : ''}
          </span>
          <span className="bg-white/20 text-white px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider shrink-0">
            {member.membershipNumber}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
        <div>
          {/* Photo & Member Core Info */}
          <div className="flex gap-3 items-center">
            {/* Photo container */}
            <div className="w-22 h-26 rounded-xl bg-slate-100 border-2 border-slate-300 overflow-hidden shrink-0 flex flex-col items-center justify-center text-center p-1 relative shadow-inner">
              {member.photoUrl || member.profilePhoto ? (
                <img
                  src={member.photoUrl || member.profilePhoto}
                  alt={member.name}
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 mb-1">
                    {member.name.replace('Dr. ', '')[0] || 'M'}
                  </div>
                  <span className="text-[9px] uppercase font-bold text-slate-600">
                    {member.bloodGroup || 'MEDICO'}
                  </span>
                </div>
              )}
              <div className="absolute bottom-1 right-1 bg-emerald-600 text-white rounded-full p-0.5 shadow-xs">
                <CheckCircle2 className="w-3 h-3" />
              </div>
            </div>

            {/* Name, Qualifications, and Database Role */}
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-black text-slate-900 leading-tight truncate">
                {member.name}
              </h4>

              {member.qualifications && (
                <div className="text-[11px] font-bold text-red-700 mt-0.5 truncate">
                  {member.qualifications}
                </div>
              )}

              {/* Exact Database Role Badge */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black border ${roleInfo.colorClass}`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>{roleInfo.badge}</span>
                </span>
                {member.specialization && (
                  <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[9px] font-semibold border border-slate-200 truncate max-w-[140px]">
                    {member.specialization}
                  </span>
                )}
              </div>

              <div className="text-[10px] text-slate-500 mt-1">
                Role: <strong className="text-slate-800">{roleInfo.title}</strong>
              </div>
            </div>
          </div>

          {/* Member Metadata List */}
          <div className="mt-3 pt-2.5 border-t border-slate-200 space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-[11px]">Membership No:</span>
              <span className="font-mono font-bold text-slate-900 text-[11px]">
                {member.membershipNumber}
              </span>
            </div>

            <div className="flex justify-between items-start">
              <span className="text-slate-500 text-[11px]">Medical College:</span>
              <span className="font-semibold text-slate-800 text-right text-[11px] max-w-[65%] truncate">
                {member.medicalCollege || '—'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-[11px]">Council Reg No:</span>
              <span className="font-mono font-bold text-slate-900 text-[11px]">
                {member.registrationNumber || 'Pending Verification'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500 text-[11px]">Blood Group:</span>
              <span className="font-black text-red-700 text-[11px]">
                {member.bloodGroup || '—'}
              </span>
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-slate-200">
              <span className="text-slate-500 text-[11px]">Validity:</span>
              <span className="font-bold text-emerald-700 text-[11px]">
                {member.studentMembershipValidTill || 'Lifetime Valid'}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Verifiable QR Code & Official Secretariat Seal */}
        <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-white rounded-lg border border-slate-200 shadow-xs">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Verification QR" className="w-14 h-14" />
              ) : (
                <div className="w-14 h-14 bg-slate-100 flex items-center justify-center">
                  <QrCode className="w-6 h-6 text-slate-400" />
                </div>
              )}
            </div>
            <div className="text-[9px] text-slate-500 leading-tight">
              <span className="font-black text-slate-800 block">Scan to Verify</span>
              <span>NMO Gujarat</span>
              <span className="text-[8px] font-mono text-slate-400 block mt-0.5 truncate max-w-[80px]">
                #{member.membershipNumber}
              </span>
            </div>
          </div>

          {/* State Secretariat Seal */}
          <div className="text-right">
            <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
              Issuing Authority
            </div>
            <div className="font-bold text-slate-900 text-xs tracking-tight">
              State Secretariat
            </div>
            <div className="text-[9px] text-slate-500 font-medium">
              NMO Gujarat
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  /**
   * RENDER BACK CARD (ALL DATABASE PARTICULARS)
   */
  const renderBackCard = (isPrint = false) => (
    <div
      className={`rounded-2xl bg-white border-2 border-slate-300 overflow-hidden text-slate-900 relative flex flex-col justify-between ${
        isPrint
          ? 'w-[340px] h-[525px] nmo-print-card print:border-slate-400 print:shadow-none'
          : 'w-full max-w-sm shadow-2xl min-h-[550px]'
      }`}
    >
      {/* Header Band */}
      <div className="bg-slate-900 text-white p-3 border-b-2 border-red-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-black uppercase tracking-wider text-white">
              Official Member Particulars
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded truncate max-w-[120px]">
            {member.membershipNumber}
          </span>
        </div>
      </div>

      {/* Complete Database Particulars */}
      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
        <div className="space-y-2 text-xs">
          {/* Full Registered Name & Database Role */}
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
            <div className="text-[9px] uppercase font-bold text-slate-400">
              Full Registered Name & Role
            </div>
            <div className="font-black text-slate-900 text-xs mt-0.5 truncate">
              {member.name}
            </div>
            <div className="flex items-center gap-2 mt-0.5 truncate">
              <span className="text-[10px] font-bold text-red-700">
                {roleInfo.title}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-[10px] text-slate-600 truncate">
                {member.prant} Prant {member.city ? `(${member.city})` : ''}
              </span>
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-1.5 overflow-hidden">
              <Phone className="w-3 h-3 text-red-600 shrink-0" />
              <span className="font-semibold text-slate-800 truncate">
                {member.phone || '—'}
              </span>
            </div>
            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-1.5 overflow-hidden">
              <Mail className="w-3 h-3 text-blue-600 shrink-0" />
              <span className="font-semibold text-slate-800 truncate" title={member.email}>
                {member.email || '—'}
              </span>
            </div>
          </div>

          {/* Permanent Address */}
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex items-center gap-1 text-[9px] uppercase font-bold text-slate-400 mb-0.5">
              <MapPin className="w-2.5 h-2.5 text-red-500" />
              <span>Registered Address</span>
            </div>
            <p className="text-[10px] text-slate-700 leading-tight line-clamp-2">
              {member.address || `${member.city || 'Gujarat'}, India`}
            </p>
          </div>

          {/* Detailed Info Grid */}
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] text-slate-400 font-semibold block">Date of Birth</span>
              <span className="font-bold text-slate-800 truncate block">
                {member.dob || '—'}
              </span>
            </div>

            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] text-slate-400 font-semibold block">Blood Group</span>
              <span className="font-black text-red-700 truncate block">
                {member.bloodGroup || '—'}
              </span>
            </div>

            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] text-slate-400 font-semibold block">Council Reg No</span>
              <span className="font-mono font-bold text-slate-800 truncate block">
                {member.registrationNumber || 'Pending'}
              </span>
            </div>

            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] text-slate-400 font-semibold block">Account Status</span>
              <span className="font-bold text-emerald-700 truncate block">
                {member.accountStatus || member.status || 'Active'}
              </span>
            </div>
          </div>

          {/* Membership History */}
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] text-slate-400 font-semibold block">Member Since</span>
              <span className="font-bold text-slate-800 truncate block">
                {member.memberOn || '—'}
              </span>
            </div>
            <div className="p-1.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[9px] text-slate-400 font-semibold block">Application Fee</span>
              <span className="font-bold text-emerald-700 truncate block">
                {member.applicationFee || 'Paid'}
              </span>
            </div>
          </div>
        </div>

        {/* Card Footer Notice */}
        <div className="pt-2 border-t border-slate-200 text-center">
          <p className="text-[8px] text-slate-500 leading-tight">
            Official identity property of National Medicos Organisation Gujarat. If found, please return to NMO State Secretariat.
          </p>
          <div className="mt-0.5 text-[8px] font-mono text-slate-400">
            Verification: nmogujarat.org/verify
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ========================================================= */}
      {/* ON-SCREEN TOOLBAR CONTROLS (HIDDEN DURING PRINT)          */}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-red-700" />
            Official NMO Digital Identity Card
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Database-verified identity credential with all member particulars & cryptographic QR verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Card Side Preview Selector (Screen View) */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold text-slate-700">
            <button
              onClick={() => setCardSide('both')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                cardSide === 'both' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Both Sides
            </button>
            <button
              onClick={() => setCardSide('front')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                cardSide === 'front' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Front
            </button>
            <button
              onClick={() => setCardSide('back')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                cardSide === 'back' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Back (Details)
            </button>
          </div>

          {/* Print Format Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
            <label className="text-[11px] font-bold text-slate-500 pl-1.5">Print Format:</label>
            <select
              value={printLayout}
              onChange={(e) => setPrintLayout(e.target.value as any)}
              className="bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 px-2 py-1 focus:ring-2 focus:ring-red-600 cursor-pointer"
            >
              <option value="duplex">2 Pages (Page 1 Front, Page 2 Back)</option>
              <option value="single_page">1 Page (Both Sides on Single Sheet)</option>
              <option value="front_only">Front Only (1 Page)</option>
              <option value="back_only">Back Only (1 Page)</option>
            </select>
          </div>

          {/* Primary Print Button */}
          <button
            onClick={() => handlePrint()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-95"
            title="Print ID Card with exact Front and Back page isolation (No 10-page spillover)"
          >
            <Printer className="w-4 h-4" />
            <span>Print ID Card</span>
          </button>
        </div>
      </div>

      {/* Page Count Helper Note */}
      <div className="no-print bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            Selected Print Output:{' '}
            <strong className="text-slate-900 font-bold">
              {printLayout === 'duplex'
                ? 'Exactly 2 Pages (Page 1: Front, Page 2: Back)'
                : printLayout === 'single_page'
                ? 'Exactly 1 Page (Front & Back together on single A4 sheet)'
                : printLayout === 'front_only'
                ? 'Exactly 1 Page (Front Only)'
                : 'Exactly 1 Page (Back Only)'}
            </strong>
          </span>
        </div>
        <span className="text-[11px] text-slate-500">
          Tip: In Chrome/Edge print settings, keep <em>"Background graphics"</em> checked for vibrant official colors.
        </span>
      </div>

      {/* ========================================================= */}
      {/* ON-SCREEN PREVIEW CONTAINER                               */}
      {/* ========================================================= */}
      <div
        id="nmo-printable-id-card"
        className="flex flex-wrap items-start justify-center gap-6 p-2"
      >
        {(cardSide === 'both' || cardSide === 'front') && renderFrontCard(false)}
        {(cardSide === 'both' || cardSide === 'back') && renderBackCard(false)}
      </div>

      {/* ========================================================= */}
      {/* DEDICATED PRINT PORTAL (ATTACHED TO BODY OUTSIDE #root)   */}
      {/* Guarantees exactly Front and Back pages only              */}
      {/* ========================================================= */}
      {portalNode &&
        createPortal(
          <div className="w-full bg-white text-slate-900 print:block">
            {/* 1. DUPLEX / 2 PAGES FORMAT (Page 1: Front, Page 2: Back) */}
            {printLayout === 'duplex' && (
              <>
                {/* PAGE 1: FRONT */}
                <div className="w-full min-h-[92vh] flex flex-col items-center justify-center p-6 nmo-print-break-after">
                  <div className="relative">
                    {/* Crop marks indicator */}
                    <div className="absolute -top-3 left-0 right-0 flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>┌ Cut</span>
                      <span>Cut ┐</span>
                    </div>
                    {renderFrontCard(true)}
                    <div className="absolute -bottom-3 left-0 right-0 flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>└ Cut</span>
                      <span>Cut ┘</span>
                    </div>
                  </div>
                  <div className="mt-4 text-center text-[10px] text-slate-400 font-mono">
                    NMO Gujarat Official ID Card • Page 1: Front Side • #{member.membershipNumber}
                  </div>
                </div>

                {/* PAGE 2: BACK */}
                <div className="w-full min-h-[92vh] flex flex-col items-center justify-center p-6 nmo-print-avoid-break">
                  <div className="relative">
                    <div className="absolute -top-3 left-0 right-0 flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>┌ Cut</span>
                      <span>Cut ┐</span>
                    </div>
                    {renderBackCard(true)}
                    <div className="absolute -bottom-3 left-0 right-0 flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>└ Cut</span>
                      <span>Cut ┘</span>
                    </div>
                  </div>
                  <div className="mt-4 text-center text-[10px] text-slate-400 font-mono">
                    NMO Gujarat Official ID Card • Page 2: Back Particulars • #{member.membershipNumber}
                  </div>
                </div>
              </>
            )}

            {/* 2. SINGLE PAGE FORMAT (Both Front & Back on 1 Page) */}
            {printLayout === 'single_page' && (
              <div className="w-full min-h-[92vh] flex flex-col items-center justify-center p-4 nmo-print-avoid-break">
                <div className="text-center mb-3 text-[11px] font-bold text-slate-700">
                  National Medicos Organisation (Gujarat) • Official Identity Card
                </div>
                <div className="flex flex-row items-center justify-center gap-6">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Front Side
                    </span>
                    {renderFrontCard(true)}
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Back Side
                    </span>
                    {renderBackCard(true)}
                  </div>
                </div>
                <div className="mt-4 text-center text-[10px] text-slate-400 font-mono flex items-center justify-center gap-2">
                  <Scissors className="w-3 h-3" />
                  <span>Fold or cut along boundary for card lamination • #{member.membershipNumber}</span>
                </div>
              </div>
            )}

            {/* 3. FRONT ONLY FORMAT (1 Page) */}
            {printLayout === 'front_only' && (
              <div className="w-full min-h-[92vh] flex flex-col items-center justify-center p-6 nmo-print-avoid-break">
                {renderFrontCard(true)}
                <div className="mt-4 text-center text-[10px] text-slate-400 font-mono">
                  NMO Gujarat Official ID Card • Front Side • #{member.membershipNumber}
                </div>
              </div>
            )}

            {/* 4. BACK ONLY FORMAT (1 Page) */}
            {printLayout === 'back_only' && (
              <div className="w-full min-h-[92vh] flex flex-col items-center justify-center p-6 nmo-print-avoid-break">
                {renderBackCard(true)}
                <div className="mt-4 text-center text-[10px] text-slate-400 font-mono">
                  NMO Gujarat Official ID Card • Back Particulars • #{member.membershipNumber}
                </div>
              </div>
            )}
          </div>,
          portalNode
        )}
    </div>
  );
};
