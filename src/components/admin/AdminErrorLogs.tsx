import React, { useState } from 'react';
import { useNMO } from '../../context/NMOContext';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Bug,
  Search,
  Filter,
  Trash2,
  RefreshCw,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Terminal,
  Globe,
  User,
  Zap
} from 'lucide-react';
import { NMOErrorLog } from '../../types/nmo';

export const AdminErrorLogs: React.FC = () => {
  const { errorLogs, resolveErrorLog, clearResolvedErrorLogs, logError, currentUser } = useNMO();

  const [search, setSearch] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('All');
  const [filterSource, setFilterSource] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedError, setSelectedError] = useState<NMOErrorLog | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const isSuperAdmin = currentUser?.role === 'super_admin';

  // Metrics
  const totalCount = errorLogs.length;
  const criticalCount = errorLogs.filter((e) => e.severity === 'critical').length;
  const unresolvedCount = errorLogs.filter((e) => !e.resolved).length;
  const resolvedCount = errorLogs.filter((e) => e.resolved).length;

  const filteredLogs = errorLogs.filter((err) => {
    if (filterSeverity !== 'All' && err.severity !== filterSeverity) return false;
    if (filterSource !== 'All' && err.source !== filterSource) return false;
    if (filterStatus === 'unresolved' && err.resolved) return false;
    if (filterStatus === 'resolved' && !err.resolved) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        err.message.toLowerCase().includes(q) ||
        (err.stack && err.stack.toLowerCase().includes(q)) ||
        err.url.toLowerCase().includes(q) ||
        (err.userEmail && err.userEmail.toLowerCase().includes(q)) ||
        err.id.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  const handleSimulateTestError = async () => {
    setIsSimulating(true);
    try {
      await logError({
        message: 'Simulated Diagnostic Exception: API connection retry exceeded threshold for sync listener.',
        stack: 'Error: Simulated Diagnostic Exception\n    at AdminErrorLogs.tsx:48:15\n    at handleSimulateTestError (AdminErrorLogs.tsx:47:11)',
        url: window.location.pathname,
        source: 'api',
        severity: 'error'
      });
      setActionFeedback('Simulated test error recorded successfully in Error Logs!');
      setTimeout(() => setActionFeedback(null), 3000);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResolve = async (id: string) => {
    await resolveErrorLog(id);
    if (selectedError && selectedError.id === id) {
      setSelectedError((prev) => (prev ? { ...prev, resolved: true, resolvedBy: currentUser?.name || 'Super Admin' } : null));
    }
  };

  const handleClearResolved = async () => {
    if (!window.confirm('Are you sure you want to purge all resolved error logs?')) return;
    await clearResolvedErrorLogs();
    setActionFeedback('Purged resolved error logs.');
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
            <AlertOctagon className="w-3 h-3 text-rose-700" />
            <span>Critical</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-700" />
            <span>Warning</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-800 border border-red-300">
            <Bug className="w-3 h-3 text-red-700" />
            <span>Error</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-black text-slate-900">
              Website Error & Diagnostics Log
            </h3>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-800 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full">
              <Bug className="w-3 h-3 text-red-700" />
              <span>Real-Time Telemetry</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time capture of uncaught client-side JavaScript runtime exceptions, failed API requests, and network anomalies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulateTestError}
            disabled={isSimulating}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{isSimulating ? 'Logging...' : 'Simulate Test Error'}</span>
          </button>

          {isSuperAdmin && resolvedCount > 0 && (
            <button
              onClick={handleClearResolved}
              className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Purge Resolved ({resolvedCount})</span>
            </button>
          )}
        </div>
      </div>

      {actionFeedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Recorded</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalCount}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs bg-rose-50/20">
          <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Unresolved</div>
          <div className="text-2xl font-black text-rose-700 mt-1">{unresolvedCount}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Critical Severity</div>
          <div className="text-2xl font-black text-amber-800 mt-1">{criticalCount}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs bg-emerald-50/20">
          <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Resolved</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{resolvedCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search error message, URL path, user email, stack trace, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500 bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-700 text-xs"
          >
            <option value="all">Status: All</option>
            <option value="unresolved">Status: Unresolved</option>
            <option value="resolved">Status: Resolved</option>
          </select>

          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-700 text-xs"
          >
            <option value="All">Severity: All</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
          </select>

          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold text-slate-700 text-xs"
          >
            <option value="All">Source: All</option>
            <option value="runtime">Runtime</option>
            <option value="api">API Network</option>
            <option value="auth">Auth</option>
            <option value="drive">Drive</option>
            <option value="ui">UI</option>
          </select>
        </div>
      </div>

      {/* Errors Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Severity</th>
                <th className="p-3.5">Error Message</th>
                <th className="p-3.5">URL / Route</th>
                <th className="p-3.5">Source</th>
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      <span className="font-semibold text-slate-600">No application errors matching your filters.</span>
                      <span className="text-slate-400 text-[11px]">The application is running stably.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((err) => (
                  <tr
                    key={err.id}
                    onClick={() => setSelectedError(err)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="p-3.5 whitespace-nowrap">
                      {getSeverityBadge(err.severity)}
                    </td>

                    <td className="p-3.5 max-w-md">
                      <div className="font-bold text-slate-900 truncate" title={err.message}>
                        {err.message}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        ID: {err.id}
                      </div>
                    </td>

                    <td className="p-3.5 whitespace-nowrap font-mono text-slate-600">
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                        {err.url || '/'}
                      </span>
                    </td>

                    <td className="p-3.5 whitespace-nowrap capitalize text-slate-600 font-semibold">
                      {err.source}
                    </td>

                    <td className="p-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {new Date(err.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{' '}
                      <span className="text-slate-400 text-[10px] block">
                        {new Date(err.timestamp).toLocaleDateString()}
                      </span>
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      {err.resolved ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold text-[11px] border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Resolved</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded font-bold text-[11px] border border-rose-200">
                          <AlertOctagon className="w-3 h-3 text-rose-600" />
                          <span>Unresolved</span>
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {!err.resolved ? (
                        <button
                          onClick={() => handleResolve(err.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Mark Resolved
                        </button>
                      ) : (
                        <button
                          onClick={() => setSelectedError(err)}
                          className="px-2.5 py-1 text-slate-500 hover:text-slate-800 text-[11px] font-bold underline cursor-pointer"
                        >
                          View Details
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Error Modal / Drawer */}
      {selectedError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-red-100 text-red-700 shrink-0 mt-0.5">
                  <Bug className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {getSeverityBadge(selectedError.severity)}
                    <span className="font-mono text-[11px] text-slate-400">{selectedError.id}</span>
                  </div>
                  <h4 className="text-base font-black text-slate-900 mt-1 break-words">
                    {selectedError.message}
                  </h4>
                </div>
              </div>
              <button
                onClick={() => setSelectedError(null)}
                className="text-slate-400 hover:text-slate-700 p-1 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-[11px]">
              <div>
                <span className="text-slate-500 block font-semibold">Incident Timestamp:</span>
                <span className="font-mono text-slate-800">{new Date(selectedError.timestamp).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">URL Path:</span>
                <span className="font-mono text-slate-800">{selectedError.url || '/'}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">Source Domain:</span>
                <span className="capitalize font-semibold text-slate-800">{selectedError.source}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">Affected User:</span>
                <span className="font-mono text-slate-800">{selectedError.userEmail || selectedError.userRole || 'Guest'}</span>
              </div>
            </div>

            {selectedError.stack && (
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-slate-600" />
                  <span>Call Stack & Technical Trace:</span>
                </label>
                <div className="p-3 bg-slate-950 text-slate-300 font-mono text-[11px] rounded-xl overflow-x-auto border border-slate-800 leading-relaxed max-h-48">
                  <code>{selectedError.stack}</code>
                </div>
              </div>
            )}

            {selectedError.userAgent && (
              <div className="space-y-1">
                <span className="text-slate-500 text-[11px] font-semibold block">Browser / User Agent:</span>
                <div className="p-2 bg-slate-100 rounded text-[11px] text-slate-700 font-mono break-all">
                  {selectedError.userAgent}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div>
                {selectedError.resolved && (
                  <span className="text-emerald-700 font-semibold text-[11px]">
                    Resolved by {selectedError.resolvedBy || 'Administrator'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!selectedError.resolved ? (
                  <button
                    onClick={() => handleResolve(selectedError.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
                  >
                    Mark as Resolved
                  </button>
                ) : (
                  <span className="text-slate-500 text-xs font-semibold">Closed</span>
                )}
                <button
                  onClick={() => setSelectedError(null)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
