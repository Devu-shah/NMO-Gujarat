import React, { useState } from 'react';
import { useNMO } from '../../context/NMOContext';
import { Shield, Clock, Search, Filter, Lock, Key, User, Activity, AlertCircle, FileText } from 'lucide-react';

export const AdminAuditLogs: React.FC = () => {
  const { auditLogs, currentUser } = useNMO();
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const [activeCategory, setActiveCategory] = useState<'all' | 'admin' | 'member_activity'>('all');
  const [filterAction, setFilterAction] = useState<string>('All');
  const [search, setSearch] = useState<string>('');

  const adminCount = auditLogs.filter((l) => l.category !== 'member_activity').length;
  const memberActivityCount = auditLogs.filter((l) => l.category === 'member_activity').length;

  const filteredLogs = auditLogs.filter((log) => {
    // Category filtering
    if (activeCategory === 'admin' && log.category === 'member_activity') return false;
    if (activeCategory === 'member_activity' && log.category !== 'member_activity') return false;

    // Action filtering
    if (filterAction !== 'All' && log.action !== filterAction) return false;

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        log.action.toLowerCase().includes(q) ||
        log.performedBy.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.targetId.toLowerCase().includes(q) ||
        (log.membershipNumber && log.membershipNumber.toLowerCase().includes(q)) ||
        (log.memberEmail && log.memberEmail.toLowerCase().includes(q)) ||
        (isSuperAdmin && (log.id || '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const getActionBadge = (action: string, category?: string) => {
    if (category === 'member_activity') {
      return (
        <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] bg-sky-100 text-sky-900 border border-sky-200 px-2 py-0.5 rounded">
          <User className="w-3 h-3 text-sky-700" />
          <span>{action}</span>
        </span>
      );
    }
    if (action.includes('LOCKDOWN')) {
      return (
        <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] bg-rose-100 text-rose-900 border border-rose-300 px-2 py-0.5 rounded">
          <AlertCircle className="w-3 h-3 text-rose-700" />
          <span>{action}</span>
        </span>
      );
    }
    if (action.startsWith('MEMBER_')) {
      return (
        <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] bg-indigo-100 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded">
          <Shield className="w-3 h-3 text-indigo-700" />
          <span>{action}</span>
        </span>
      );
    }
    return (
      <span className="font-mono font-bold text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-800">
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header and Scope Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-black text-slate-900">
              Audit Trail & Member Activity Log
            </h3>
            {isSuperAdmin ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-800 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full">
                <Key className="w-3 h-3 text-purple-700" />
                <span>Super Admin Log IDs Visible</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                <Lock className="w-3 h-3 text-slate-400" />
                <span>Log IDs Restricted to Super Admin</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Chronological audit trail covering administrator governance, batch operations, and member activity (logins, certificate views, registrations).
          </p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex border-b border-slate-200 space-x-2 text-xs">
        <button
          onClick={() => { setActiveCategory('all'); setFilterAction('All'); }}
          className={`pb-2.5 px-3 font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeCategory === 'all'
              ? 'border-red-700 text-red-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>All Audit Logs ({auditLogs.length})</span>
        </button>

        <button
          onClick={() => { setActiveCategory('member_activity'); setFilterAction('All'); }}
          className={`pb-2.5 px-3 font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeCategory === 'member_activity'
              ? 'border-sky-700 text-sky-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <User className="w-3.5 h-3.5 text-sky-600" />
          <span>Member Activity Logs ({memberActivityCount})</span>
        </button>

        <button
          onClick={() => { setActiveCategory('admin'); setFilterAction('All'); }}
          className={`pb-2.5 px-3 font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeCategory === 'admin'
              ? 'border-purple-700 text-purple-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-purple-600" />
          <span>Administrative Logs ({adminCount})</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search action, performed by, membership number, details, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500 bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-semibold text-slate-700"
          >
            <option value="All">All Actions</option>
            {activeCategory !== 'admin' && (
              <>
                <option value="MEMBER_LOGIN">Member Login</option>
                <option value="MEMBER_VIEW_CERTIFICATE">Certificate Viewed</option>
                <option value="MEMBER_DOWNLOAD_CERTIFICATE">Certificate Downloaded</option>
                <option value="MEMBER_PROFILE_UPDATE">Member Profile Updated</option>
                <option value="MEMBER_EVENT_REGISTRATION">Event Registration</option>
              </>
            )}
            {activeCategory !== 'member_activity' && (
              <>
                <option value="USER_LOGIN">Admin / User Login</option>
                <option value="MEMBER_CREATE">Admin: Member Created</option>
                <option value="MEMBER_UPDATE">Admin: Member Updated</option>
                <option value="CSV_IMPORT">CSV Import</option>
                <option value="REPLACE_CSV">Replace CSV</option>
                <option value="CSV_EXPORT">CSV Export</option>
                <option value="EVENT_CREATE">Event Created</option>
                <option value="REGISTRATION_STATUS">Registration Approvals</option>
                <option value="EMERGENCY_LOCKDOWN_ENABLED">Emergency Lockdown Enabled</option>
                <option value="EMERGENCY_LOCKDOWN_DISABLED">Emergency Lockdown Disabled</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                {isSuperAdmin && (
                  <th className="p-3.5 text-purple-900 bg-purple-50/50">Log ID</th>
                )}
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Action</th>
                <th className="p-3.5">Performed By</th>
                <th className="p-3.5">Target</th>
                <th className="p-3.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 7 : 6} className="p-8 text-center text-slate-400">
                    No audit records match the current filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    {isSuperAdmin && (
                      <td className="p-3.5 whitespace-nowrap font-mono text-[11px] font-bold text-purple-800 bg-purple-50/30">
                        {log.id}
                      </td>
                    )}
                    <td className="p-3.5 whitespace-nowrap">
                      {log.category === 'member_activity' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                          <User className="w-2.5 h-2.5 text-sky-700" />
                          <span>Member</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                          <Shield className="w-2.5 h-2.5 text-purple-700" />
                          <span>Admin</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      {getActionBadge(log.action, log.category)}
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                      {log.performedBy}
                      {log.membershipNumber && (
                        <span className="block text-[10px] font-mono text-slate-500 font-normal">
                          Mem: {log.membershipNumber}
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-slate-600 whitespace-nowrap">
                      {log.targetType}: {log.targetId}
                    </td>
                    <td className="p-3.5 text-slate-700 max-w-md">
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
