import React from 'react';
import { RefreshCw, ShieldAlert, ServerCrash, Terminal } from 'lucide-react';

interface ServerError500PageProps {
  onBypassLogin?: () => void;
}

export const ServerError500Page: React.FC<ServerError500PageProps> = ({ onBypassLogin }) => {
  const incidentId = React.useMemo(() => {
    return `ERR-500-${Math.floor(100000 + Math.random() * 900000)}`;
  }, []);

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between font-mono selection:bg-red-900 selection:text-white">
      {/* Top minimal status bar */}
      <header className="border-b border-slate-800/80 px-6 py-4 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <ServerCrash className="w-4 h-4 text-red-500 animate-pulse" />
          <span className="font-bold tracking-wider text-slate-300">HTTP/2 500 INTERNAL SERVER ERROR</span>
        </div>
        <div className="text-[11px] text-slate-500 hidden sm:block">
          Cluster Node: <span className="text-slate-400">asia-southeast1-edge</span>
        </div>
      </header>

      {/* Main Server Error Display */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="max-w-2xl w-full space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-red-950/80 border border-red-800/60 text-red-400 text-xs font-bold tracking-widest uppercase">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              <span>Service Temporarily Unavailable</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight">
              500 <span className="text-red-500 font-normal">|</span> Server Error
            </h1>

            <p className="text-slate-400 text-sm sm:text-base leading-relaxed font-sans">
              The web server encountered an unexpected internal condition that prevented it from fulfilling the request.
              The incident has been automatically logged and isolated.
            </p>
          </div>

          {/* Diagnostic Information Container */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3.5 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 text-slate-400">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>System Diagnostics</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">STATUS: 500_INTERNAL_SERVER_ERROR</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
              <div>
                <span className="text-slate-500">Incident Reference:</span>{' '}
                <span className="text-red-400 font-bold">{incidentId}</span>
              </div>
              <div>
                <span className="text-slate-500">Timestamp:</span>{' '}
                <span className="text-slate-300">{new Date().toISOString()}</span>
              </div>
              <div>
                <span className="text-slate-500">Gateway:</span>{' '}
                <span className="text-slate-300">nginx/1.24.0 (Cloud Engine)</span>
              </div>
              <div>
                <span className="text-slate-500">Host:</span>{' '}
                <span className="text-slate-300">portal.nmogujarat.org</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 rounded border border-slate-800/70 text-[11px] text-slate-400 font-mono leading-relaxed overflow-x-auto">
              <code>
                Exception code 0x80004005: Critical upstream service gateway timeout or maintenance exception raised by core coordinator.
              </code>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-4 pt-2 font-sans">
            <button
              onClick={handleReload}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg text-xs transition-colors shadow-lg shadow-red-950/50 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Request</span>
            </button>

            {onBypassLogin ? (
              <button
                onClick={onBypassLogin}
                className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4 transition-colors cursor-pointer"
              >
                Super Administrator Recovery Entry
              </button>
            ) : (
              <a
                href="/admin/super"
                className="text-xs text-slate-600 hover:text-slate-400 underline underline-offset-4 transition-colors"
              >
                Administrative Entrance
              </a>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 px-6 py-4 text-center text-[11px] text-slate-600">
        NMO Gujarat Cloud Infrastructure &bull; All connection telemetry recorded
      </footer>
    </div>
  );
};
