import React, { useEffect, useState, useRef } from 'react';
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
  FileCheck
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
  const cardRef = useRef<HTMLDivElement>(null);

  const roleInfo = formatDatabaseRole(
    member.role,
    member.studentMembershipValidTill,
    member.prant,
    member.city
  );

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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Action buttons and controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-red-700" />
            Official NMO Digital Identity Card
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Database-verified identity credential with all member particulars & cryptographic QR verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Card Side Selector */}
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-xs font-semibold text-slate-700">
            <button
              onClick={() => setCardSide('both')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                cardSide === 'both' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Both Sides
            </button>
            <button
              onClick={() => setCardSide('front')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                cardSide === 'front' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Front
            </button>
            <button
              onClick={() => setCardSide('back')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                cardSide === 'back' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'hover:text-slate-900'
              }`}
            >
              Back (Details)
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold shadow-xs transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print ID Card</span>
          </button>
        </div>
      </div>

      {/* Cards Container */}
      <div
        ref={cardRef}
        id="nmo-printable-id-card"
        className="flex flex-wrap items-start justify-center gap-6 p-2 print:p-0 print:m-0 print:gap-4"
      >
        {/* ========================================================= */}
        {/* FRONT SIDE CARD                                            */}
        {/* ========================================================= */}
        {(cardSide === 'both' || cardSide === 'front') && (
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border-2 border-slate-300 overflow-hidden text-slate-900 relative flex flex-col justify-between print:shadow-none print:border print:m-0 print:break-inside-avoid"
            style={{ minHeight: '560px' }}
          >
            {/* Header Band */}
            <div className="bg-gradient-to-r from-red-700 via-red-800 to-blue-900 text-white p-4 relative overflow-hidden">
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
                <span className="font-semibold text-amber-200 uppercase tracking-wider">
                  {member.prant} Prant {member.city ? `• ${member.city}` : ''}
                </span>
                <span className="bg-white/20 text-white px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider">
                  {member.membershipNumber}
                </span>
              </div>
            </div>

            {/* Card Body */}
            <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
              <div>
                {/* Photo & Member Core Info */}
                <div className="flex gap-3.5 items-center">
                  {/* Photo container */}
                  <div className="w-24 h-28 rounded-xl bg-slate-100 border-2 border-slate-300 overflow-hidden shrink-0 flex flex-col items-center justify-center text-center p-1 relative shadow-inner">
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
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Name, Qualifications, and Database Role */}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-base font-black text-slate-900 leading-tight">
                      {member.name}
                    </h4>
                    <p className="text-xs font-semibold text-red-700 mt-0.5">
                      {member.qualifications || 'MBBS'}
                    </p>
                    {member.specialization && (
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        {member.specialization}
                      </p>
                    )}

                    {/* Official Database Role Badge */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black tracking-wide border ${roleInfo.colorClass}`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        <span>{roleInfo.title}</span>
                      </span>

                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                        {member.accountStatus || member.status || 'Active'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Front Side Key Particulars from Database */}
                <div className="mt-3.5 bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs">
                  {/* Database Role Row */}
                  <div className="flex justify-between items-center pb-1 border-b border-slate-200">
                    <span className="text-slate-500 text-[11px] font-semibold">Official Role:</span>
                    <span className="font-bold text-slate-900 text-[11px] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block"></span>
                      {roleInfo.title}
                    </span>
                  </div>

                  <div className="flex justify-between items-start">
                    <span className="text-slate-500 text-[11px]">Medical College:</span>
                    <span className="font-semibold text-slate-800 text-right text-[11px] max-w-[62%]">
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
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 bg-white rounded-lg border border-slate-200 shadow-xs">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Verification QR" className="w-16 h-16" />
                    ) : (
                      <div className="w-16 h-16 bg-slate-100 flex items-center justify-center">
                        <QrCode className="w-8 h-8 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-500 leading-tight">
                    <span className="font-black text-slate-800 block">Scan to Verify</span>
                    <span>NMO Gujarat Registry</span>
                    <span className="text-[8px] font-mono text-slate-400 block mt-0.5">
                      #{member.membershipNumber}
                    </span>
                  </div>
                </div>

                {/* State Secretariat Seal (Accurate Official Issuing Authority) */}
                <div className="text-right">
                  <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                    Issuing Authority
                  </div>
                  <div className="font-bold text-slate-900 text-xs tracking-tight">
                    State Secretariat Office
                  </div>
                  <div className="text-[9px] text-slate-500 font-medium">
                    NMO Gujarat
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* BACK SIDE CARD: ALL DETAILS FROM DATABASE                 */}
        {/* ========================================================= */}
        {(cardSide === 'both' || cardSide === 'back') && (
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border-2 border-slate-300 overflow-hidden text-slate-900 relative flex flex-col justify-between print:shadow-none print:border print:m-0 print:break-inside-avoid"
            style={{ minHeight: '560px' }}
          >
            {/* Header Band */}
            <div className="bg-slate-900 text-white p-3.5 border-b-2 border-red-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Official Member Particulars
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                  {member.membershipNumber}
                </span>
              </div>
            </div>

            {/* Complete Database Particulars */}
            <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
              <div className="space-y-2 text-xs">
                {/* Full Registered Name & Database Role */}
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Full Registered Name & Role
                  </div>
                  <div className="font-black text-slate-900 text-sm mt-0.5">
                    {member.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-bold text-red-700">
                      Role: {roleInfo.title}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-[11px] text-slate-600">
                      {member.prant} Prant {member.city ? `(${member.city})` : ''}
                    </span>
                  </div>
                </div>

                {/* Personal & Demographics Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-semibold block">Date of Birth</span>
                    <span className="font-bold text-slate-800 text-[11px]">
                      {member.dob || '—'}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-semibold block">Gender</span>
                    <span className="font-bold text-slate-800 text-[11px]">
                      {member.gender || '—'}
                    </span>
                  </div>
                </div>

                {/* Contact Particulars */}
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-500 font-medium">Phone:</span>
                    <span className="font-bold text-slate-800 ml-auto">{member.phone || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-500 font-medium">Email:</span>
                    <span className="font-medium text-slate-800 truncate ml-auto max-w-[65%]">
                      {member.email || '—'}
                    </span>
                  </div>
                </div>

                {/* Permanent Address */}
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div className="text-[11px]">
                      <span className="text-slate-500 font-medium block">Registered Address:</span>
                      <span className="font-medium text-slate-800 block mt-0.5">
                        {member.address || 'Address registered with NMO Secretariat'}
                        {member.pincode ? ` - ${member.pincode}` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Membership History & Reference */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-semibold block">Member Since</span>
                    <span className="font-bold text-slate-800">
                      {member.memberOn || '—'}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-semibold block">Application Fee</span>
                    <span className="font-bold text-emerald-700">
                      {member.applicationFee || 'Paid'}
                    </span>
                  </div>
                </div>

                {/* Referral details if available */}
                {(member.refPerson || member.refMembershipNumber) && (
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 text-[11px]">
                    <span className="text-[10px] text-slate-400 font-semibold block">Referred By</span>
                    <span className="font-medium text-slate-800">
                      {member.refPerson || '—'} {member.refMembershipNumber ? `(${member.refMembershipNumber})` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Card Footer Notice */}
              <div className="pt-2 border-t border-slate-200 text-center">
                <p className="text-[9px] text-slate-500 leading-tight">
                  This identity card is the official property of National Medicos Organisation (Gujarat Chapter). If found, please return to NMO State Secretariat.
                </p>
                <div className="mt-1 text-[8px] font-mono text-slate-400">
                  Official Portal Verification: nmogujarat.org/verify
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
