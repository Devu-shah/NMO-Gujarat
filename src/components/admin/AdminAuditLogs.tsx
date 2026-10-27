import React, { useState } from 'react';
import { useNMO } from '../../context/NMOContext';
import { Shield, Clock, Search, Filter, Lock, Key } from 'lucide-react';

export const AdminAuditLogs: React.FC = () => {
  const { auditLogs, currentUser } = useNMO();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [filterAction, setFilterAction] = useState<string>('All');
  const [search, setSearch] = useState<string>('');

  const filteredLogs = auditLogs.filter((log) => {
    if (filterAction !== 'All' && log.action !== filterAction) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        log.action.toLowerCase().includes(q) ||
        log.performedBy.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.targetId.toLowerCase().includes(q) ||
        (isSuperAdmin && (log.id || '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-black text-slate-900">
              Administrative Security Audit Trail
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
            Immutable chronological record of administrative actions, member updates, batch imports, and exports.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="All">All Actions</option>
            <option value="MEMBER_CREATE">Member Created</option>
            <option value="MEMBER_UPDATE">Member Updated</option>
            <option value="CSV_IMPORT">CSV Import</option>
            <option value="REPLACE_CSV">Replace CSV</option>
            <option value="CSV_EXPORT">CSV Export</option>
            <option value="EVENT_CREATE">Event Created</option>
            <option value="REGISTRATION_STATUS">Registration Approvals</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                {isSuperAdmin && (
                  <th className="p-3.5 text-purple-900 bg-purple-50/50">Log ID</th>
                )}
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
                  <td colSpan={isSuperAdmin ? 6 : 5} className="p-8 text-center text-slate-400">
                    No audit records match the current filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    {isSuperAdmin && (
                      <td className="p-3.5 whitespace-nowrap font-mono text-[11px] font-bold text-purple-800 bg-purple-50/30">
                        {log.id}
                      </td>
                    )}
                    <td className="p-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                      {log.performedBy}
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
