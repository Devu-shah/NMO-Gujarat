import React from 'react';
import { useNMO } from '../../context/NMOContext';
import { FileSpreadsheet, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw, XCircle } from 'lucide-react';

export const AdminImportHistory: React.FC = () => {
  const { importLogs } = useNMO();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-black text-slate-900">
          CSV & Excel Import Audit History
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Historical audit record of batch master member uploads, replace synchronizations, and integrity dry-run validations.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Date & Time</th>
                <th className="p-3.5">Filename</th>
                <th className="p-3.5">Mode</th>
                <th className="p-3.5">Total Rows</th>
                <th className="p-3.5 text-emerald-700">Added</th>
                <th className="p-3.5 text-blue-700">Updated</th>
                <th className="p-3.5 text-slate-600">Unchanged</th>
                <th className="p-3.5 text-amber-700">Duplicates</th>
                <th className="p-3.5 text-rose-700">Invalid</th>
                <th className="p-3.5 text-purple-700">Deactivated</th>
                <th className="p-3.5">Result</th>
                <th className="p-3.5">Operator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {importLogs.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-400">
                    No import or synchronization operations recorded yet.
                  </td>
                </tr>
              ) : (
                importLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {new Date(log.importedAt).toLocaleString()}
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="truncate max-w-[140px]" title={log.filename}>
                        {log.filename}
                      </span>
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          log.mode === 'replace_sync' || log.mode === 'replace'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : log.mode === 'validate_only'
                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {log.mode === 'replace_sync' || log.mode === 'replace'
                          ? 'Replace/Sync'
                          : log.mode === 'validate_only'
                          ? 'Validate Only'
                          : 'Add/Update'}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800">{log.totalRecords}</td>
                    <td className="p-3.5 font-bold text-emerald-700">+{log.newRecords}</td>
                    <td className="p-3.5 font-semibold text-blue-700">↻ {log.updatedRecords}</td>
                    <td className="p-3.5 text-slate-500">{log.unchangedRecords ?? '—'}</td>
                    <td className="p-3.5 text-amber-700 font-medium">{log.duplicateRecords || 0}</td>
                    <td className="p-3.5 text-rose-700 font-medium">{log.invalidRecords || 0}</td>
                    <td className="p-3.5 text-purple-700 font-medium">{log.deactivatedRecords ?? 0}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          log.result === 'Failed'
                            ? 'bg-rose-100 text-rose-800'
                            : log.result === 'Validated'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {log.result === 'Failed' ? (
                          <XCircle className="w-3 h-3 text-rose-600" />
                        ) : log.result === 'Validated' ? (
                          <ShieldCheck className="w-3 h-3 text-blue-600" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        )}
                        <span>{log.result || 'Success'}</span>
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600 whitespace-nowrap">{log.importedBy}</td>
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
