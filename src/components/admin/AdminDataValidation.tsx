import React, { useMemo } from 'react';
import { useNMO } from '../../context/NMOContext';
import { ShieldCheck, AlertCircle, CheckCircle2, AlertTriangle, ArrowRight, UserX } from 'lucide-react';

export const AdminDataValidation: React.FC<{ onInspectMember?: (membershipNo: string) => void }> = ({
  onInspectMember
}) => {
  const { members } = useNMO();

  const issues = useMemo(() => {
    const missingEmail: string[] = [];
    const missingPhone: string[] = [];
    const missingRegNo: string[] = [];
    const missingBloodGroup: string[] = [];
    const missingCollege: string[] = [];
    const expiredValidity: string[] = [];

    const todayStr = new Date().toISOString().split('T')[0];

    members.forEach((m) => {
      if (!m.email || !m.email.includes('@')) missingEmail.push(m.membershipNumber);
      if (!m.phone || m.phone.length < 8) missingPhone.push(m.membershipNumber);
      if (!m.registrationNumber) missingRegNo.push(m.membershipNumber);
      if (!m.bloodGroup) missingBloodGroup.push(m.membershipNumber);
      if (!m.medicalCollege || m.medicalCollege.length < 4) missingCollege.push(m.membershipNumber);
      if (m.studentMembershipValidTill && m.studentMembershipValidTill < todayStr) {
        expiredValidity.push(m.membershipNumber);
      }
    });

    return {
      missingEmail,
      missingPhone,
      missingRegNo,
      missingBloodGroup,
      missingCollege,
      expiredValidity,
      totalRecords: members.length
    };
  }, [members]);

  const totalIssueCount =
    issues.missingEmail.length +
    issues.missingPhone.length +
    issues.missingRegNo.length +
    issues.missingBloodGroup.length +
    issues.expiredValidity.length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h3 className="text-xl font-black text-slate-900">
          Master Database Quality & Integrity Validation
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Automated integrity audit examining {issues.totalRecords} member records for incomplete credentials, missing council IDs, and expired memberships.
        </p>
      </div>

      {/* Overall Health Score Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            totalIssueCount === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
            {totalIssueCount === 0 ? (
              <ShieldCheck className="w-6 h-6" />
            ) : (
              <AlertTriangle className="w-6 h-6" />
            )}
          </div>
          <div>
            <h4 className="font-bold text-base text-slate-900">
              {totalIssueCount === 0
                ? 'All Member Records Healthy & Verified'
                : `${totalIssueCount} Attention Items Flagged`}
            </h4>
            <p className="text-xs text-slate-500">
              {issues.totalRecords - totalIssueCount} of {issues.totalRecords} records fully populated.
            </p>
          </div>
        </div>

        <span className="text-2xl font-black text-slate-800">
          {Math.round(((issues.totalRecords - Math.min(totalIssueCount, issues.totalRecords)) / issues.totalRecords) * 100)}%
        </span>
      </div>

      {/* Issues Breakdown Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-700">Missing / Incomplete Email</span>
            <span className="text-amber-700 font-bold">{issues.missingEmail.length} records</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Members without valid email will not receive official circulars or password resets.
          </p>
          {issues.missingEmail.length > 0 && (
            <div className="text-[10px] font-mono text-slate-600 bg-slate-50 p-2 rounded truncate">
              {issues.missingEmail.join(', ')}
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-700">Missing Council Registration No</span>
            <span className="text-amber-700 font-bold">{issues.missingRegNo.length} records</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Medical council number is required for verified practitioner status.
          </p>
          {issues.missingRegNo.length > 0 && (
            <div className="text-[10px] font-mono text-slate-600 bg-slate-50 p-2 rounded truncate">
              {issues.missingRegNo.join(', ')}
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-700">Expired Student Memberships</span>
            <span className="text-red-700 font-bold">{issues.expiredValidity.length} records</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Members past their student validity date needing doctor conversion.
          </p>
          {issues.expiredValidity.length > 0 && (
            <div className="text-[10px] font-mono text-red-600 bg-red-50 p-2 rounded truncate">
              {issues.expiredValidity.join(', ')}
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-700">Missing Blood Group</span>
            <span className="text-slate-600 font-bold">{issues.missingBloodGroup.length} records</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Blood group is needed for the emergency medico donor network.
          </p>
          {issues.missingBloodGroup.length > 0 && (
            <div className="text-[10px] font-mono text-slate-600 bg-slate-50 p-2 rounded truncate">
              {issues.missingBloodGroup.join(', ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
