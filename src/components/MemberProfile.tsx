import React, { useState } from 'react';
import { NMOMember } from '../types/nmo';
import { useNMO } from '../context/NMOContext';
import { Lock, Save, CheckCircle2, User, Phone, Mail, MapPin, Building, Shield, KeyRound, AlertCircle } from 'lucide-react';

interface MemberProfileProps {
  member: NMOMember;
}

export const MemberProfile: React.FC<MemberProfileProps> = ({ member }) => {
  const { updateMember, changeUserPassword } = useNMO();

  // Editable fields
  const [phone, setPhone] = useState(member.phone || '');
  const [email, setEmail] = useState(member.email || '');
  const [address, setAddress] = useState(member.address || '');
  const [pincode, setPincode] = useState(member.pincode || '');

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (!newPassword || newPassword.length < 6) {
      setPassError('Password must be at least 6 characters in length.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError('New passwords do not match. Please re-enter.');
      return;
    }

    setIsChangingPass(true);
    try {
      await changeUserPassword(newPassword);
      setPassSuccess('Your password has been updated successfully! Please use this new password on your next login.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPassSuccess(null), 5000);
    } catch (err: any) {
      setPassError(err.message || 'Failed to change password.');
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSavedSuccess(false);

    try {
      await updateMember({
        ...member,
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        pincode: pincode.trim(),
        updatedAt: new Date().toISOString()
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert('Unable to update contact information at this time. Please retry.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-8">
      <div>
        <h3 className="text-xl font-black text-slate-900">
          Official Member Record
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Master registry profile synced with NMO Gujarat state database. Administrative credentials are protected.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Contact information updated successfully!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Section 1: Official Protected Administrative Data */}
        <div>
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
            <Lock className="w-4 h-4 text-amber-600" />
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Protected Administrative Fields
            </h4>
            <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium ml-auto">
              Read-Only
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Membership Number</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-900 flex items-center justify-between">
                <span>{member.membershipNumber}</span>
                <Lock className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Full Member Name</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 flex items-center justify-between">
                <span>{member.name}</span>
                <Lock className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Prant</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-900">
                {member.prant} Prant
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Medical College</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-900">
                {member.medicalCollege}
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Qualifications</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-900">
                {member.qualifications || 'MBBS'}
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Council Registration No</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-900">
                {member.registrationNumber || 'Pending'}
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Specialization</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-900">
                {member.specialization || 'General Healthcare'}
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Blood Group</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-red-700">
                {member.bloodGroup || '—'}
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Date of Birth</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900">
                {member.dob || '—'}
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Member Since (Joined)</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900">
                {member.memberOn || '—'}
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Membership Valid Till</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-900">
                {member.studentMembershipValidTill || 'Lifetime'}
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Application Fee Status</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-emerald-800 font-semibold">
                {member.applicationFee || 'Paid'}
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Official Secretariat Contact</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                contact@nmogujarat.org
              </div>
            </div>

            {member.refPerson && (
              <div>
                <label className="block text-slate-500 mb-1">Referred By</label>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                  {member.refPerson} ({member.refMembershipNumber || 'N/A'})
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Editable Personal Contact Information */}
        <div>
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
            <User className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Editable Contact Information
            </h4>
            <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium ml-auto">
              Member Editable
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Contact Phone / Mobile *
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-semibold mb-1">
                Residential / Clinic Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Pincode
              </label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white font-semibold text-xs sm:text-sm rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Section 3: Account Security & Password */}
      <div className="pt-6 border-t border-slate-200">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
          <KeyRound className="w-4 h-4 text-red-600" />
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Account Security & Password
          </h4>
        </div>

        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Keep your account protected with a strong, unique password. Enter your new password below (minimum 6 characters).
        </p>

        {passSuccess && (
          <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{passSuccess}</span>
          </div>
        )}

        {passError && (
          <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-center gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{passError}</span>
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4 max-w-xl text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-bold mb-1.5">
                New Password *
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-red-600 focus:outline-hidden font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1.5">
                Confirm New Password *
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-red-600 focus:outline-hidden font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-500">
              Must be at least 6 characters long.
            </span>
            <button
              type="submit"
              disabled={isChangingPass || !newPassword}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>{isChangingPass ? 'Updating Password...' : 'Update Password'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
