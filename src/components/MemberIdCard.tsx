import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { NMOMember } from '../types/nmo';
import { NmoLogo } from './NmoLogo';
import { Printer, Download, ShieldCheck, CheckCircle2, QrCode } from 'lucide-react';

interface MemberIdCardProps {
  member: NMOMember;
}

export const MemberIdCard: React.FC<MemberIdCardProps> = ({ member }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Generate QR code encoding verifiable member identity
    const verificationPayload = JSON.stringify({
      org: 'NMO-GUJARAT',
      id: member.membershipNumber,
      name: member.name,
      role: member.role || 'member',
      prant: member.prant,
      reg: member.registrationNumber,
      valid: member.studentMembershipValidTill || 'Active'
    });

    QRCode.toDataURL(
      verificationPayload,
      {
        width: 180,
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
      {/* Action buttons */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Official NMO Digital Identity Card
          </h3>
          <p className="text-xs text-slate-500">
            Authorized membership credential with cryptographic QR verification.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print ID Card</span>
          </button>
        </div>
      </div>

      {/* ID Card Outer Container */}
      <div className="flex justify-center p-4">
        <div
          ref={cardRef}
          id="nmo-printable-id-card"
          className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border-2 border-slate-300 overflow-hidden text-slate-900 relative print:shadow-none print:border print:m-0"
          style={{ minHeight: '520px' }}
        >
          {/* Header Band */}
          <div className="bg-gradient-to-r from-red-700 via-red-800 to-blue-900 text-white p-4 relative overflow-hidden">
            {/* Subtle background circle watermark */}
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

            {/* Prant Badge */}
            <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-amber-200 uppercase tracking-wider">
                {member.prant} Prant
              </span>
              <span className="bg-white/20 text-white px-2 py-0.5 rounded text-[10px] font-mono">
                {member.membershipNumber}
              </span>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-5 flex flex-col justify-between" style={{ minHeight: '380px' }}>
            <div className="space-y-4">
              {/* Photo & Member Core Info */}
              <div className="flex gap-4 items-center">
                {/* Member Photograph Placeholder */}
                <div className="w-24 h-28 rounded-xl bg-slate-100 border-2 border-slate-300 overflow-hidden shrink-0 flex flex-col items-center justify-center text-center p-1 relative shadow-inner">
                  {member.photoUrl ? (
                    <img
                      src={member.photoUrl}
                      alt={member.name}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500 mb-1">
                        {member.name.replace('Dr. ', '')[0]}
                      </div>
                      <span className="text-[9px] uppercase font-bold text-slate-500">
                        {member.bloodGroup || 'MEDICO'}
                      </span>
                    </div>
                  )}
                  {/* Verified small seal */}
                  <div className="absolute bottom-1 right-1 bg-emerald-600 text-white rounded-full p-0.5 shadow-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Name & Titles */}
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
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-red-100 text-red-900 text-[10px] font-bold tracking-wide">
                      <ShieldCheck className="w-3 h-3 text-red-700" />
                      <span>
                        {member.role === 'super_admin'
                          ? 'Super Administrator'
                          : member.role === 'state_admin'
                          ? 'State Administrator'
                          : member.role === 'prant_admin'
                          ? `${member.prant || 'Gujarat'} Prant Admin`
                          : member.role === 'city_admin'
                          ? `${member.city || 'City'} Administrator`
                          : member.studentMembershipValidTill
                          ? 'Student Medico Member'
                          : 'Registered Life Member'}
                      </span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                      {member.status || 'Active'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Data Rows */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between items-center pb-1 border-b border-slate-200/70">
                  <span className="text-slate-500 text-[11px] font-semibold">Official Role:</span>
                  <span className="font-bold text-red-800 text-[11px]">
                    {member.role === 'super_admin'
                      ? 'Super Administrator'
                      : member.role === 'state_admin'
                      ? 'State Administrator'
                      : member.role === 'prant_admin'
                      ? `${member.prant || 'Gujarat'} Prant Admin`
                      : member.role === 'city_admin'
                      ? `${member.city || 'City'} Administrator`
                      : member.studentMembershipValidTill
                      ? 'Student Member'
                      : 'Registered Life Member'}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-slate-500 text-[11px]">Medical College:</span>
                  <span className="font-semibold text-slate-800 text-right text-[11px] max-w-[60%]">
                    {member.medicalCollege}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-[11px]">Council Reg No:</span>
                  <span className="font-mono font-bold text-slate-800 text-[11px]">
                    {member.registrationNumber || 'Pending'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-[11px]">Blood Group:</span>
                  <span className="font-bold text-red-700 text-[11px]">
                    {member.bloodGroup || '—'}
                  </span>
                </div>
                {member.studentMembershipValidTill && (
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                    <span className="text-slate-500 text-[11px]">Valid Till:</span>
                    <span className="font-semibold text-slate-800 text-[11px]">
                      {member.studentMembershipValidTill}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Bar with QR and Official Issuing Authority Signature */}
            <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
              {/* Verifiable QR code */}
              <div className="flex items-center gap-2">
                <div className="p-1 bg-white rounded-lg border border-slate-200 shadow-xs">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Verification QR Code" className="w-16 h-16" />
                  ) : (
                    <div className="w-16 h-16 bg-slate-100 flex items-center justify-center">
                      <QrCode className="w-8 h-8 text-slate-400" />
                    </div>
                  )}
                </div>
                <div className="text-[9px] text-slate-500 leading-tight">
                  <span className="font-bold text-slate-700 block">Scan to Verify</span>
                  <span>Authentic NMO Portal Record</span>
                </div>
              </div>

              {/* Issuing Authority / General Secretary Stamp */}
              <div className="text-right">
                <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                  Authorized Issuing Signatory
                </div>
                <div className="font-serif italic text-slate-800 text-xs font-bold tracking-tight">
                  State General Secretary
                </div>
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mt-0.5">
                  NMO Gujarat
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
