import React, { useState } from 'react';
import { useNMO, isProtectedAdminUser } from '../../context/NMOContext';
import { UserRole, PrantType, NMOUserRecord } from '../../types/nmo';
import {
  Shield,
  Search,
  Filter,
  Plus,
  Edit2,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  UserX,
  UserCheck,
  RefreshCw,
  Mail,
  Building,
  Phone,
  Trash2
} from 'lucide-react';

interface AdminUsersManagerProps {
  prantFilterScope?: 'Gujarat' | 'Saurashtra' | 'All';
  isReadOnlyRoles?: boolean;
}

export const AdminUsersManager: React.FC<AdminUsersManagerProps> = ({
  prantFilterScope = 'All',
  isReadOnlyRoles = false
}) => {
  const {
    users,
    currentUser,
    clearNonAdminUsers,
    clearAllMembers,
    deleteMultipleUsers,
    refreshFromDatabase,
    isSyncing,
    lastSyncTime,
    updateUserRole,
    updateUser,
    addUser,
    resetPassword,
    logAudit
  } = useNMO();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'All' | UserRole>('All');
  const [prantFilter, setPrantFilter] = useState<'All' | PrantType>(prantFilterScope);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Clear Non-Admin State
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearMode, setClearMode] = useState<'non_admin' | 'all'>('non_admin');
  const [clearInputText, setClearInputText] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  // Add User Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMemNo, setNewMemNo] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCollege, setNewCollege] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('member');
  const [newPrant, setNewPrant] = useState<'Gujarat' | 'Saurashtra'>('Gujarat');

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<NMOUserRecord | null>(null);

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const superAdminsCount = users.filter((u) => u.role === 'super_admin' && u.accountStatus === 'Active').length;

  const nonAdminCount = users.filter((u) => !isProtectedAdminUser(u, currentUser)).length;

  const handleExecuteClearUsers = async () => {
    setIsClearing(true);
    try {
      const res = clearMode === 'all'
        ? await clearAllMembers()
        : await clearNonAdminUsers();

      if (res.success) {
        showNotice(
          `Successfully cleared ${res.deletedCount} members from Firestore. ${res.preservedCount} administrator account${res.preservedCount > 1 ? 's' : ''} preserved.`,
          'success'
        );
        setShowClearModal(false);
        setClearInputText('');
      } else {
        showNotice(`Failed to clear users: ${res.error}`, 'error');
      }
    } catch (e: any) {
      showNotice(`Error during clearance: ${e.message}`, 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const showNotice = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const filteredUsers = users.filter((u) => {
    if (prantFilterScope !== 'All' && u.prant !== prantFilterScope) return false;
    if (roleFilter !== 'All' && u.role !== roleFilter) return false;
    if (prantFilter !== 'All' && u.prant !== prantFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = (u.name || '').toLowerCase().includes(q);
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      const matchNo = (u.membershipNumber || '').toLowerCase().includes(q);
      const matchCollege = (u.medicalCollege || '').toLowerCase().includes(q);
      return matchName || matchEmail || matchNo || matchCollege;
    }
    return true;
  });

  // Handle Role Change
  const handleRoleChange = async (membershipNumber: string, targetRole: UserRole) => {
    const target = users.find((u) => u.membershipNumber === membershipNumber);
    if (!target) return;

    if (target.email.toLowerCase() === currentUser?.email?.toLowerCase() && target.role === 'super_admin' && targetRole !== 'super_admin') {
      showNotice('Safety Guard: You cannot demote your own Super Admin account.', 'error');
      return;
    }

    if (target.role === 'super_admin' && targetRole !== 'super_admin' && superAdminsCount <= 1) {
      showNotice('Safety Guard: Cannot demote the final remaining Super Admin.', 'error');
      return;
    }

    try {
      await updateUserRole(membershipNumber, targetRole);
      showNotice(`Updated role for ${target.name} to ${targetRole.replace('_', ' ').toUpperCase()}`, 'success');
    } catch (e: any) {
      showNotice('Error updating role: ' + e.message, 'error');
    }
  };

  // Handle Prant Change
  const handlePrantChange = async (membershipNumber: string, targetPrant: PrantType, currentRole: UserRole) => {
    try {
      await updateUserRole(membershipNumber, currentRole, targetPrant);
      showNotice(`Updated Prant to ${targetPrant}.`, 'success');
    } catch (e: any) {
      showNotice('Error updating prant: ' + e.message, 'error');
    }
  };

  // Toggle Account Active/Inactive
  const handleToggleStatus = async (userRecord: NMOUserRecord) => {
    if (userRecord.email.toLowerCase() === currentUser?.email?.toLowerCase()) {
      showNotice('Safety Guard: You cannot deactivate your own account.', 'error');
      return;
    }
    if (userRecord.role === 'super_admin' && userRecord.accountStatus === 'Active' && superAdminsCount <= 1) {
      showNotice('Safety Guard: Cannot deactivate the only active Super Admin.', 'error');
      return;
    }

    const nextStatus = userRecord.accountStatus === 'Active' ? 'Inactive' : 'Active';
    try {
      await updateUser({
        ...userRecord,
        accountStatus: nextStatus,
        updatedAt: new Date().toISOString()
      });
      showNotice(`User ${userRecord.name} account is now ${nextStatus}.`, 'success');
    } catch (err: any) {
      showNotice('Error toggling status: ' + err.message, 'error');
    }
  };

  // Trigger Password Reset
  const handleSendReset = async (email: string, name: string) => {
    try {
      await resetPassword(email);
      showNotice(`Password reset instructions sent to ${name} (${email}).`, 'success');
    } catch (err: any) {
      showNotice('Failed to send reset email: ' + err.message, 'error');
    }
  };

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemNo.trim() || !newName.trim() || !newEmail.trim()) {
      showNotice('Please fill all required fields.', 'error');
      return;
    }

    const cleanNo = newMemNo.trim().toUpperCase();
    const newUserRecord: NMOUserRecord = {
      membershipNumber: cleanNo,
      name: newName.trim(),
      email: newEmail.trim().toLowerCase(),
      phone: newPhone.trim(),
      medicalCollege: newCollege.trim(),
      role: isReadOnlyRoles ? 'member' : newRole,
      prant: prantFilterScope !== 'All' ? prantFilterScope : newPrant,
      accountStatus: 'Active',
      status: 'Active',
      nmoState: 'Gujarat',
      hasCustomPassword: false,
      customPassword: cleanNo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await addUser(newUserRecord);
      setShowAddModal(false);
      setNewMemNo('');
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewCollege('');
      setNewRole('member');
      showNotice(
        `User ${newUserRecord.name} (${cleanNo}) created successfully! Login ID: ${newUserRecord.email}.`,
        'success'
      );
    } catch (err: any) {
      showNotice('Error creating user: ' + err.message, 'error');
    }
  };

  // Save Edit User
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      await updateUser({
        ...editingUser,
        updatedAt: new Date().toISOString()
      });
      showNotice(`Updated profile for ${editingUser.name}.`, 'success');
      setEditingUser(null);
    } catch (err: any) {
      showNotice('Error updating user: ' + err.message, 'error');
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'state_admin':
        return 'bg-red-100 text-red-900 border-red-300';
      case 'prant_admin':
        return 'bg-blue-100 text-blue-900 border-blue-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900">
            {prantFilterScope !== 'All' ? `${prantFilterScope} Prant Members` : 'All Users & Membership Registry'}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Top-level "Users" collection. Search, filter, modify roles, and manage credentials.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(isSuperAdmin || currentUser?.role === 'state_admin') && (
            <button
              onClick={() => {
                setClearInputText('');
                setShowClearModal(true);
              }}
              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs transition-all cursor-pointer hover:shadow-xs"
              title="Clear all non-admin members while strictly keeping admins and superadmin"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Clear Members (Keep Admins)</span>
              {nonAdminCount > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-200 text-rose-800 rounded-full text-[10px] font-mono font-bold">
                  {nonAdminCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Member</span>
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in duration-150 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-semibold">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Membership No, Name, College, or Email..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600 focus:outline-hidden"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {!isReadOnlyRoles && (
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white font-medium"
            >
              <option value="All">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="state_admin">State Admin</option>
              <option value="prant_admin">Prant Admin</option>
              <option value="member">Member</option>
            </select>
          )}

          {prantFilterScope === 'All' && (
            <select
              value={prantFilter}
              onChange={(e) => setPrantFilter(e.target.value as any)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white font-medium"
            >
              <option value="All">All Prants</option>
              <option value="Gujarat">Gujarat Prant</option>
              <option value="Saurashtra">Saurashtra Prant</option>
            </select>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Member</th>
                <th className="p-3.5">Contact Details</th>
                <th className="p-3.5">Medical College</th>
                <th className="p-3.5">Role</th>
                <th className="p-3.5">Prant</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No users found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.membershipNumber} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5">
                      <div className="font-mono font-bold text-slate-900">
                        {u.membershipNumber}
                      </div>
                      <div className="font-semibold text-slate-800 mt-0.5">
                        {u.name}
                      </div>
                    </td>

                    <td className="p-3.5 text-slate-600">
                      <div className="font-mono text-[11px]">{u.email}</div>
                      {u.phone && <div className="text-[10px] text-slate-400 mt-0.5">{u.phone}</div>}
                    </td>

                    <td className="p-3.5 text-slate-600 max-w-[200px] truncate">
                      {u.medicalCollege || '—'}
                    </td>

                    {/* Role column */}
                    <td className="p-3.5">
                      {isSuperAdmin && !isReadOnlyRoles ? (
                        <select
                          value={u.role || 'member'}
                          onChange={(e) => handleRoleChange(u.membershipNumber, e.target.value as UserRole)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${getRoleBadge(
                            u.role || 'member'
                          )}`}
                        >
                          <option value="super_admin">Super Admin</option>
                          <option value="state_admin">State Admin</option>
                          <option value="prant_admin">Prant Admin</option>
                          <option value="city_admin">City Admin</option>
                          <option value="member">Member</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${getRoleBadge(u.role || 'member')}`}>
                          {(u.role || 'member').replace('_', ' ').toUpperCase()}
                        </span>
                      )}
                    </td>

                    {/* Prant column */}
                    <td className="p-3.5">
                      {isSuperAdmin && !isReadOnlyRoles ? (
                        <select
                          value={u.prant || 'Gujarat'}
                          onChange={(e) => handlePrantChange(u.membershipNumber, e.target.value as PrantType, u.role || 'member')}
                          className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white font-medium cursor-pointer"
                        >
                          <option value="All">All Gujarat</option>
                          <option value="Gujarat">Gujarat Prant</option>
                          <option value="Saurashtra">Saurashtra Prant</option>
                        </select>
                      ) : (
                        <span className="font-semibold text-slate-700">{u.prant}</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="p-3.5 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                          u.accountStatus === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {u.accountStatus || 'Active'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Edit User */}
                        <button
                          type="button"
                          onClick={() => setEditingUser(u)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit member details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Send Password Reset */}
                        <button
                          type="button"
                          onClick={() => handleSendReset(u.email, u.name)}
                          className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Send password reset link"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>

                        {/* Toggle Account Status */}
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              u.accountStatus === 'Active'
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={u.accountStatus === 'Active' ? 'Deactivate user' : 'Activate user'}
                          >
                            {u.accountStatus === 'Active' ? (
                              <UserX className="w-3.5 h-3.5" />
                            ) : (
                              <UserCheck className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add Member */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h4 className="text-lg font-bold text-slate-900 mb-4">
              Add Member to "Users" Collection
            </h4>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Membership Number *
                </label>
                <input
                  type="text"
                  required
                  value={newMemNo}
                  onChange={(e) => setNewMemNo(e.target.value)}
                  placeholder="e.g. NMO-GUJ-2026-020"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl uppercase font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Dr. Hitesh Dave"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="hitesh@nmogujarat.org"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+91 98791 ..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prant *</label>
                  <select
                    value={newPrant}
                    onChange={(e) => setNewPrant(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="Gujarat">Gujarat Prant</option>
                    <option value="Saurashtra">Saurashtra Prant</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Medical College</label>
                <input
                  type="text"
                  value={newCollege}
                  onChange={(e) => setNewCollege(e.target.value)}
                  placeholder="e.g. B.J. Medical College Ahmedabad"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-700 text-white rounded-xl hover:bg-red-800 font-semibold shadow-xs cursor-pointer"
                >
                  Save Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit User */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h4 className="text-lg font-bold text-slate-900 mb-1">
              Edit Member Details
            </h4>
            <p className="text-xs text-slate-500 font-mono mb-4">
              {editingUser.membershipNumber}
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editingUser.phone || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prant</label>
                  <select
                    value={editingUser.prant || 'Gujarat'}
                    onChange={(e) => setEditingUser({ ...editingUser, prant: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  >
                    <option value="Gujarat">Gujarat</option>
                    <option value="Saurashtra">Saurashtra</option>
                    <option value="All">All Gujarat</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Medical College</label>
                <input
                  type="text"
                  value={editingUser.medicalCollege || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, medicalCollege: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Specialization</label>
                <input
                  type="text"
                  value={editingUser.specialization || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, specialization: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-700 text-white rounded-xl hover:bg-red-800 font-semibold shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clear Non-Admin Members Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-rose-200 space-y-5">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900">Clear / Wipe Member Data</h4>
                <p className="text-xs text-rose-600 font-semibold">Danger Zone Operation</p>
              </div>
            </div>

            {/* Clear Mode Selector */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setClearMode('non_admin')}
                className={`py-2 px-3 rounded-lg transition-colors cursor-pointer ${
                  clearMode === 'non_admin'
                    ? 'bg-white text-rose-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Purge Non-Admins ({nonAdminCount})
              </button>
              <button
                type="button"
                onClick={() => setClearMode('all')}
                className={`py-2 px-3 rounded-lg transition-colors cursor-pointer ${
                  clearMode === 'all'
                    ? 'bg-rose-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Wipe All Members ({users.length})
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {clearMode === 'all' ? (
                <>
                  This will permanently wipe <strong>all {users.length} member records</strong> from Cloud Firestore <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-red-700 font-bold">Users</code> collection. Only your active Super Administrator account will be kept safe.
                </>
              ) : (
                <>
                  This will permanently delete all <strong>{nonAdminCount} regular member records</strong> from Cloud Firestore <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-red-700 font-bold">Users</code> collection. All verified administrative accounts are preserved untouched.
                </>
              )}
            </p>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>Automated Backup Protection</span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                An automatic JSON backup file of all user records will be immediately downloaded to your device before any deletion executes.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Type <span className="font-mono text-rose-600 font-black">CLEAR</span> to confirm:
              </label>
              <input
                type="text"
                value={clearInputText}
                onChange={(e) => setClearInputText(e.target.value)}
                placeholder="Type CLEAR"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono uppercase focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteClearUsers}
                disabled={clearInputText.trim().toUpperCase() !== 'CLEAR' || isClearing}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {isClearing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Clearing from Firestore...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{clearMode === 'all' ? 'Confirm & Wipe All Members' : 'Confirm & Purge Non-Admins'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
