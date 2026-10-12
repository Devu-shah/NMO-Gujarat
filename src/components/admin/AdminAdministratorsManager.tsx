import React, { useState } from 'react';
import { useNMO } from '../../context/NMOContext';
import { UserRole, PrantType, NMOUserRecord } from '../../types/nmo';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  UserX,
  Plus,
  Search,
  KeyRound,
  Mail,
  AlertTriangle,
  Lock,
  Edit2,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Clock,
  UserPlus
} from 'lucide-react';
import { CityDropdown } from '../common/CityDropdown';

export const AdminAdministratorsManager: React.FC = () => {
  const {
    users,
    currentUser,
    updateUser,
    updateUserRole,
    addUser,
    resetPassword,
    logAudit
  } = useNMO();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'All' | UserRole>('All');
  const [actionNotice, setActionNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Create Admin Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'state_admin' | 'prant_admin' | 'city_admin'>('city_admin');
  const [newAdminPrant, setNewAdminPrant] = useState<'Gujarat' | 'Saurashtra'>('Gujarat');
  const [newAdminCity, setNewAdminCity] = useState('Ahmedabad');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Direct Password Setting Modal State
  const [passwordModalAdmin, setPasswordModalAdmin] = useState<NMOUserRecord | null>(null);
  const [customPasswordInput, setCustomPasswordInput] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Edit Admin Modal State
  const [editingAdmin, setEditingAdmin] = useState<NMOUserRecord | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('city_admin');
  const [editPrant, setEditPrant] = useState<PrantType>('Gujarat');

  // Confirmation modal for sensitive actions
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Filter only administrative accounts
  const adminUsers = users.filter((u) => {
    const isAdmin = u.role === 'super_admin' || u.role === 'state_admin' || u.role === 'prant_admin' || u.role === 'city_admin';
    if (!isAdmin) return false;
    if (roleFilter !== 'All' && u.role !== roleFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = (u.name || '').toLowerCase().includes(q);
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      const matchNo = (u.membershipNumber || '').toLowerCase().includes(q);
      return matchName || matchEmail || matchNo;
    }
    return true;
  });

  const superAdminsCount = users.filter((u) => u.role === 'super_admin' && u.accountStatus === 'Active').length;

  const showNotification = (message: string, type: 'success' | 'error') => {
    setActionNotice({ message, type });
    setTimeout(() => setActionNotice(null), 5000);
  };

  // 1. Create New Administrator
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminName.trim() || !newAdminEmail.trim()) {
      showNotification('Please fill in both name and email.', 'error');
      return;
    }

    setIsSubmitting(true);
    const cleanEmail = newAdminEmail.trim().toLowerCase();
    const cleanPassword = newAdminPassword.trim();
    if (cleanPassword && cleanPassword.length < 6) {
      showNotification('Initial password must be at least 6 characters in length.', 'error');
      setIsSubmitting(false);
      return;
    }

    // Check if user already exists
    const existing = users.find((u) => (u.email || '').toLowerCase() === cleanEmail);
    const membershipNumber = existing?.membershipNumber || `NMO-ADMIN-${Date.now().toString().slice(-4)}`;

    try {
      if (existing) {
        // Upgrade existing user to admin
        await updateUser({
          ...existing,
          role: newAdminRole,
          prant: newAdminRole === 'state_admin' ? 'All' : newAdminPrant,
          accountStatus: 'Active',
          status: 'Active',
          hasCustomPassword: Boolean(cleanPassword || existing.hasCustomPassword),
          customPassword: cleanPassword || existing.customPassword || membershipNumber,
          updatedAt: new Date().toISOString()
        });
      } else {
        // Create new user record
        const newRecord: NMOUserRecord = {
          membershipNumber,
          name: newAdminName.trim(),
          email: cleanEmail,
          role: newAdminRole,
          city: newAdminRole === 'city_admin' ? newAdminCity.trim() : undefined,
          prant: newAdminRole === 'state_admin' ? 'All' : newAdminPrant,
          accountStatus: 'Active',
          status: 'Active',
          nmoState: 'Gujarat',
          hasCustomPassword: Boolean(cleanPassword),
          customPassword: cleanPassword || membershipNumber,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await addUser(newRecord);
      }

      // Trigger password setup email via Firebase Auth
      try {
        await resetPassword(cleanEmail);
      } catch (authErr) {
        console.warn('Password setup email notice:', authErr);
      }

      await logAudit(
        'ADMIN_CREATE',
        'ADMIN',
        membershipNumber,
        `Created administrative account for ${newAdminName.trim()} with role ${newAdminRole} (${newAdminPrant}). Initial Password: ${cleanPassword ? 'Custom Password' : membershipNumber}`
      );

      const pwNote = cleanPassword
        ? `Password configured as "${cleanPassword}".`
        : `Initial Password is Membership ID "${membershipNumber}".`;
      showNotification(`Administrator account created for ${newAdminName.trim()}. ${pwNote} Setup email sent to ${cleanEmail}.`, 'success');
      setShowCreateModal(false);
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setNewAdminRole('prant_admin');
      setNewAdminPrant('Gujarat');
    } catch (err: any) {
      showNotification(err.message || 'Failed to create administrator account.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Change Role with Super Admin Lockout Guard
  const handleChangeRole = async (targetUser: NMOUserRecord, newRole: UserRole) => {
    // Safety Guard 1: Prevent self-demotion for Super Admin
    if (targetUser.email.toLowerCase() === currentUser?.email?.toLowerCase() && targetUser.role === 'super_admin' && newRole !== 'super_admin') {
      showNotification('Super Admin safety guard: You cannot demote your own Super Admin account.', 'error');
      return;
    }

    // Safety Guard 2: Prevent removing final Super Admin
    if (targetUser.role === 'super_admin' && newRole !== 'super_admin' && superAdminsCount <= 1) {
      showNotification('Super Admin safety guard: Cannot remove or demote the last remaining active Super Admin.', 'error');
      return;
    }

    const performUpdate = async () => {
      try {
        await updateUserRole(targetUser.membershipNumber, newRole);
        showNotification(`Updated role of ${targetUser.name} to ${newRole.replace('_', ' ').toUpperCase()}.`, 'success');
      } catch (err: any) {
        showNotification(err.message || 'Failed to update role.', 'error');
      }
    };

    if (targetUser.role === 'super_admin' && newRole !== 'super_admin') {
      setConfirmDialog({
        title: 'Revoke Super Admin Access',
        description: `Are you sure you want to demote Super Admin "${targetUser.name}" to ${newRole.replace('_', ' ')}? This will remove full backend administrative control.`,
        onConfirm: performUpdate
      });
    } else {
      await performUpdate();
    }
  };

  // 3. Toggle Account Status (Disable / Enable)
  const handleToggleStatus = async (targetUser: NMOUserRecord) => {
    if (targetUser.email.toLowerCase() === currentUser?.email?.toLowerCase()) {
      showNotification('Super Admin safety guard: You cannot disable your own active account.', 'error');
      return;
    }
    if (targetUser.role === 'super_admin' && targetUser.accountStatus === 'Active' && superAdminsCount <= 1) {
      showNotification('Super Admin safety guard: Cannot disable the only active Super Admin.', 'error');
      return;
    }

    const nextStatus = targetUser.accountStatus === 'Active' ? 'Inactive' : 'Active';
    try {
      await updateUser({
        ...targetUser,
        accountStatus: nextStatus,
        updatedAt: new Date().toISOString()
      });
      await logAudit(
        'ADMIN_STATUS_CHANGE',
        'ADMIN',
        targetUser.membershipNumber,
        `Changed account status of admin ${targetUser.name} to ${nextStatus}`
      );
      showNotification(`Administrator account for ${targetUser.name} is now ${nextStatus}.`, 'success');
    } catch (err: any) {
      showNotification(err.message || 'Failed to change status.', 'error');
    }
  };

  // 4. Revoke Administrative Privileges (Demote to standard member)
  const handleRevokeAdmin = async (targetUser: NMOUserRecord) => {
    if (targetUser.email.toLowerCase() === currentUser?.email?.toLowerCase()) {
      showNotification('Super Admin safety guard: You cannot revoke your own administrative privileges.', 'error');
      return;
    }
    if (targetUser.role === 'super_admin' && superAdminsCount <= 1) {
      showNotification('Super Admin safety guard: Cannot revoke the final active Super Admin account.', 'error');
      return;
    }

    setConfirmDialog({
      title: 'Revoke All Administrative Privileges',
      description: `This will remove all admin rights from ${targetUser.name} (${targetUser.email}) and return their access level to standard Member. Confirm revocation?`,
      onConfirm: async () => {
        try {
          await updateUserRole(targetUser.membershipNumber, 'member');
          showNotification(`Administrative privileges revoked for ${targetUser.name}. Account reverted to Member.`, 'success');
        } catch (err: any) {
          showNotification(err.message || 'Failed to revoke administrative privileges.', 'error');
        }
      }
    });
  };

  // 5. Trigger Password Reset Email
  const handleSendPasswordReset = async (email: string, name: string) => {
    try {
      await resetPassword(email);
      showNotification(`Password setup / reset instructions emailed to ${name} (${email}).`, 'success');
    } catch (err: any) {
      showNotification(err.message || 'Failed to dispatch password email.', 'error');
    }
  };

  // 6. Direct Password Setting by Super Admin
  const handleSaveDirectPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalAdmin) return;
    const cleanPass = customPasswordInput.trim();
    if (!cleanPass || cleanPass.length < 6) {
      showNotification('Password must be at least 6 characters in length.', 'error');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await updateUser({
        ...passwordModalAdmin,
        customPassword: cleanPass,
        hasCustomPassword: true,
        updatedAt: new Date().toISOString()
      });

      await logAudit(
        'ADMIN_PASSWORD_SET',
        'ADMIN',
        passwordModalAdmin.membershipNumber,
        `Super Admin updated login password for administrator ${passwordModalAdmin.name} (${passwordModalAdmin.email})`
      );

      showNotification(`Password for ${passwordModalAdmin.name} successfully updated.`, 'success');
      setPasswordModalAdmin(null);
      setCustomPasswordInput('');
    } catch (err: any) {
      showNotification(err.message || 'Failed to update administrator password.', 'error');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const getRoleBadge = (role: UserRole, prant?: PrantType) => {
    switch (role) {
      case 'super_admin':
        return {
          bg: 'bg-purple-100 text-purple-900 border-purple-200',
          label: 'Super Admin (Full System Control)'
        };
      case 'state_admin':
        return {
          bg: 'bg-red-100 text-red-900 border-red-200',
          label: 'State Admin (Gujarat State)'
        };
      case 'prant_admin':
        return {
          bg: 'bg-blue-100 text-blue-900 border-blue-200',
          label: `${prant || 'Gujarat'} Prant Admin`
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-800 border-slate-200',
          label: 'Member'
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-700" />
            <h3 className="text-xl font-black text-slate-900">
              Manage Administrators & Permissions
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure administrative privileges for State and Prant chapters. Protected by Super Admin lockout safety invariants.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 bg-red-700 hover:bg-red-800 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Create New Administrator</span>
        </button>
      </div>

      {/* Action Notice Banner */}
      {actionNotice && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-semibold">{actionNotice.message}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Administrator Passwords & Logins Guide Banner */}
      <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Prant &amp; State Administrator Passwords Guide</span>
                <span className="text-[10px] bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                  Authentication Rules
                </span>
              </h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                State Admins and Prant Admins authenticate through the same unified login portal with the following credential rules:
              </p>
              <div className="mt-2.5 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-700">
                <div className="bg-white/90 border border-amber-200/80 p-3 rounded-xl shadow-2xs">
                  <span className="font-bold text-amber-900 block mb-1">1. Login ID</span>
                  Their official registered <strong>Email Address</strong> or assigned <strong>Membership ID</strong>.
                </div>
                <div className="bg-white/90 border border-amber-200/80 p-3 rounded-xl shadow-2xs">
                  <span className="font-bold text-amber-900 block mb-1">2. Default Initial Password</span>
                  Initial password is their official <strong>Membership Number</strong> (e.g.{' '}
                  <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded font-bold text-amber-950">
                    NMO-STATE-001
                  </code>{' '}
                  or{' '}
                  <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded font-bold text-amber-950">
                    NMO-ADMIN-XXXX
                  </code>
                  ).
                </div>
                <div className="bg-white/90 border border-amber-200/80 p-3 rounded-xl shadow-2xs">
                  <span className="font-bold text-amber-900 block mb-1">3. Direct Password Setting</span>
                  Click the <KeyRound className="w-3.5 h-3.5 inline text-red-600" /> icon on any admin row to view their initial password, set a custom password directly, or trigger an email reset.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Safety Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-semibold block">Super Admins</span>
          <div className="text-2xl font-black text-purple-700 mt-1">{superAdminsCount}</div>
          <span className="text-[10px] text-slate-400 mt-1 block">Full website & backend control</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-semibold block">State Admins</span>
          <div className="text-2xl font-black text-red-700 mt-1">
            {users.filter((u) => u.role === 'state_admin').length}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Gujarat + Saurashtra statewide</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] text-slate-500 font-semibold block">Prant Admins</span>
          <div className="text-2xl font-black text-blue-700 mt-1">
            {users.filter((u) => u.role === 'prant_admin').length}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Restricted to assigned Prant</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search administrators by name, email, or membership number..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-semibold shrink-0">Role Filter:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-medium"
          >
            <option value="All">All Administrators ({adminUsers.length})</option>
            <option value="super_admin">Super Admins</option>
            <option value="state_admin">State Admins</option>
            <option value="prant_admin">Prant Admins</option>
          </select>
        </div>
      </div>

      {/* Administrators List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Administrator</th>
                <th className="p-3.5">Contact & Auth Email</th>
                <th className="p-3.5">Assigned Role</th>
                <th className="p-3.5">Prant Scope</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5">Activity</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adminUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No administrators found matching current filters.
                  </td>
                </tr>
              ) : (
                adminUsers.map((admin) => {
                  const isCurrentSuper = admin.email.toLowerCase() === currentUser?.email?.toLowerCase();
                  const badge = getRoleBadge(admin.role, admin.prant);

                  return (
                    <tr key={admin.membershipNumber} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Identifier */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {(admin.name || 'A')[0]}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{admin.name}</span>
                              {isCurrentSuper && (
                                <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-semibold">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-slate-500 font-mono">
                                {admin.membershipNumber}
                              </span>
                              {admin.hasCustomPassword ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPasswordModalAdmin(admin);
                                    setCustomPasswordInput('');
                                  }}
                                  className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
                                  title="Password configured. Click to change."
                                >
                                  <Lock className="w-2.5 h-2.5 text-emerald-600" />
                                  <span>Configured</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPasswordModalAdmin(admin);
                                    setCustomPasswordInput('');
                                  }}
                                  className="inline-flex items-center gap-1 text-[9px] bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-medium hover:bg-slate-200 transition-colors cursor-pointer"
                                  title="Initial credentials active. Click to set custom password."
                                >
                                  <KeyRound className="w-2.5 h-2.5 text-slate-500" />
                                  <span>Set Password</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="p-3.5 font-mono text-slate-700">
                        <div>{admin.email}</div>
                        {admin.phone && (
                          <div className="text-[10px] text-slate-400 font-sans">{admin.phone}</div>
                        )}
                      </td>

                      {/* Role Selector */}
                      <td className="p-3.5">
                        <select
                          value={admin.role}
                          disabled={isCurrentSuper && admin.role === 'super_admin'}
                          onChange={(e) => handleChangeRole(admin, e.target.value as UserRole)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer disabled:cursor-not-allowed ${badge.bg}`}
                        >
                          <option value="super_admin">Super Admin</option>
                          <option value="state_admin">State Admin</option>
                          <option value="prant_admin">Prant Admin</option>
                          <option value="member">Demote to Member</option>
                        </select>
                      </td>

                      {/* Prant */}
                      <td className="p-3.5">
                        {admin.role === 'prant_admin' ? (
                          <select
                            value={admin.prant || 'Gujarat'}
                            onChange={async (e) => {
                              try {
                                await updateUserRole(admin.membershipNumber, admin.role, e.target.value as PrantType);
                                showNotification(`Updated Prant for ${admin.name} to ${e.target.value}.`, 'success');
                              } catch (err: any) {
                                showNotification(err.message, 'error');
                              }
                            }}
                            className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white font-medium cursor-pointer"
                          >
                            <option value="Gujarat">Gujarat Prant</option>
                            <option value="Saurashtra">Saurashtra Prant</option>
                          </select>
                        ) : (
                          <span className="text-slate-500 font-medium text-xs">
                            {admin.role === 'super_admin' ? 'All (Unrestricted)' : 'Gujarat Statewide'}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                            admin.accountStatus === 'Active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              admin.accountStatus === 'Active' ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                          {admin.accountStatus || 'Active'}
                        </span>
                      </td>

                      {/* Activity */}
                      <td className="p-3.5 text-slate-500 text-[11px]">
                        <div>Created: {admin.createdAt?.split('T')[0] || 'Initial'}</div>
                        <div className="text-[10px] text-slate-400">
                          Login: {admin.lastLogin ? admin.lastLogin.split('T')[0] : 'Never'}
                        </div>
                      </td>

                      {/* Action buttons */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Manage Password & Credentials */}
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordModalAdmin(admin);
                              setCustomPasswordInput('');
                            }}
                            className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Manage Password & Login Credentials"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Active / Inactive */}
                          <button
                            type="button"
                            disabled={isCurrentSuper}
                            onClick={() => handleToggleStatus(admin)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              admin.accountStatus === 'Active'
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={admin.accountStatus === 'Active' ? 'Disable administrator' : 'Enable administrator'}
                          >
                            {admin.accountStatus === 'Active' ? (
                              <UserX className="w-3.5 h-3.5" />
                            ) : (
                              <UserCheck className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Revoke Admin Access */}
                          <button
                            type="button"
                            disabled={isCurrentSuper}
                            onClick={() => handleRevokeAdmin(admin)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Revoke administrative access"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Administrator */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-red-700" />
                <h4 className="text-base font-bold text-slate-900">
                  Create New Administrator
                </h4>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAdmin} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  placeholder="e.g. Dr. Rajesh Sharma"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Official Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin.rajesh@nmogujarat.org"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Password setup instructions will be dispatched to this address.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Administrative Role *
                  </label>
                  <select
                    value={newAdminRole}
                    onChange={(e) => setNewAdminRole(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-xs"
                  >
                    <option value="city_admin">City Admin</option>
                    <option value="prant_admin">Prant Admin</option>
                    <option value="state_admin">State Admin</option>
                  </select>
                </div>

                <div>
                  {newAdminRole === 'city_admin' ? (
                    <div>
                      <CityDropdown
                        label="Assigned City"
                        required
                        value={newAdminCity}
                        onChange={setNewAdminCity}
                        placeholder="Select or search city from database..."
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Assigned Prant *
                      </label>
                      <select
                        value={newAdminRole === 'state_admin' ? 'Gujarat' : newAdminPrant}
                        disabled={newAdminRole === 'state_admin'}
                        onChange={(e) => setNewAdminPrant(e.target.value as any)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs disabled:bg-slate-100"
                      >
                        <option value="Gujarat">Gujarat Prant</option>
                        <option value="Saurashtra">Saurashtra Prant</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Initial Password (Optional)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="Leave blank to use auto-assigned Membership ID"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Leave blank to set their default initial password as their official Membership Number (e.g. <code>NMO-ADMIN-XXXX</code>), or specify a custom initial password (min 6 characters).
                </span>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                <strong>Password Authentication:</strong> The administrator can sign in immediately using their email and initial password. An automated password reset/setup link is also dispatched via email.
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:bg-slate-300"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Administrator</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Direct Password Setting & Credential Viewer for Administrator */}
      {passwordModalAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-red-700" />
                <h4 className="text-base font-bold text-slate-900">
                  Manage Administrator Password
                </h4>
              </div>
              <button
                onClick={() => {
                  setPasswordModalAdmin(null);
                  setCustomPasswordInput('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Administrator Credential Summary Card */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{passwordModalAdmin.name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 uppercase">
                    {passwordModalAdmin.role.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-slate-700 font-mono text-[11px]">
                  <span className="text-slate-500 font-sans font-semibold">Login Email: </span>
                  <strong>{passwordModalAdmin.email}</strong>
                </div>
                <div className="text-slate-700 font-mono text-[11px]">
                  <span className="text-slate-500 font-sans font-semibold">Membership ID: </span>
                  <strong>{passwordModalAdmin.membershipNumber}</strong>
                </div>
                <div className="pt-2 border-t border-slate-200/90 flex items-center justify-between text-[11px]">
                  <span className="text-slate-600 font-medium">Initial Security:</span>
                  <span className="text-slate-700 font-medium">
                    Protected by Cloud Authentication
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600 font-medium">Current Status:</span>
                  {passwordModalAdmin.hasCustomPassword ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Custom Password Configured
                    </span>
                  ) : (
                    <span className="text-amber-800 font-medium flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      Pending First-Time Password Update
                    </span>
                  )}
                </div>
              </div>

              {/* Set New Password Form */}
              <form onSubmit={handleSaveDirectPassword} className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Set New Secure Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={customPasswordInput}
                    onChange={(e) => setCustomPasswordInput(e.target.value)}
                    placeholder="Enter new secure password (min. 6 characters)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block leading-relaxed">
                    Updates the password directly in the database. The administrator can immediately sign in with this password.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordModalAdmin(null);
                      setCustomPasswordInput('');
                    }}
                    className="px-3.5 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:bg-slate-300"
                  >
                    {isUpdatingPassword && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Password</span>
                  </button>
                </div>
              </form>

              {/* Alternative: Dispatch Reset Email */}
              <div className="pt-3 border-t border-slate-200">
                <span className="block text-slate-600 font-semibold mb-2">
                  Or Send Reset Link via Email:
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await handleSendPasswordReset(passwordModalAdmin.email, passwordModalAdmin.name);
                    setPasswordModalAdmin(null);
                  }}
                  className="w-full py-2 px-3 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>Send Reset Email to {passwordModalAdmin.email}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-bold text-slate-900">{confirmDialog.title}</h4>
            </div>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              {confirmDialog.description}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await fn();
                }}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
              >
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
