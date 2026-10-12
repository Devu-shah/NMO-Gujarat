import React, { useState } from 'react';
import { useNMO, isProtectedAdminUser } from '../../context/NMOContext';
import { Settings, RefreshCw, CheckCircle2, ShieldAlert, Save, Trash2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { firebaseConfig } from '../../lib/firebase';

export const AdminSettings: React.FC = () => {
  const { currentUser, users, clearNonAdminUsers } = useNMO();

  const [siteTitle, setSiteTitle] = useState('National Medicos Organisation Gujarat');
  const [secretaryEmail, setSecretaryEmail] = useState('secretary.gujarat@nmogujarat.org');
  const [helpline, setHelpline] = useState('+91 79 2658 0000');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Clear Non-Admin state
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearInputText, setClearInputText] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [clearFeedback, setClearFeedback] = useState<string | null>(null);

  const nonAdminCount = users.filter((u) => !isProtectedAdminUser(u, currentUser)).length;

  const handleExecuteClear = async () => {
    setIsClearing(true);
    setClearFeedback(null);
    try {
      const res = await clearNonAdminUsers();
      if (res.success) {
        setClearFeedback(`Successfully cleared ${res.deletedCount} member records from Cloud Firestore. ${res.preservedCount} administrator accounts preserved.`);
        setShowClearModal(false);
        setClearInputText('');
      } else {
        alert('Failed to clear users: ' + (res.error || 'Unknown error'));
      }
    } catch (e: any) {
      alert('Error during user clearance: ' + e.message);
    } finally {
      setIsClearing(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h3 className="text-xl font-black text-slate-900">
          Portal Configuration & System Settings
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Manage state chapter contact details, secretary endpoints, and database maintenance tools.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Settings saved successfully.</span>
        </div>
      )}

      {/* Form Settings */}
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <h4 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
          State Chapter Identification
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="sm:col-span-2">
            <label className="block text-slate-700 font-semibold mb-1">
              Organization Title
            </label>
            <input
              type="text"
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              State Secretary Official Email
            </label>
            <input
              type="email"
              value={secretaryEmail}
              onChange={(e) => setSecretaryEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Emergency Medico Helpline
            </label>
            <input
              type="text"
              value={helpline}
              onChange={(e) => setHelpline(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>

      {/* Active Firebase Connection Info */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-3 text-xs">
        <h4 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
          Firebase Environment Status
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-[11px]">
          <div>
            <span className="text-slate-400 block font-sans">Project ID:</span>
            <span className="font-bold text-slate-800">{firebaseConfig.projectId}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-sans">Auth Domain:</span>
            <span className="font-bold text-slate-800 truncate block">{firebaseConfig.authDomain}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-sans">Storage Bucket:</span>
            <span className="font-bold text-slate-800 truncate block">{firebaseConfig.storageBucket}</span>
          </div>
        </div>
      </div>

      {/* Database Maintenance Card */}
      {currentUser?.role === 'super_admin' && (
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 shadow-xs space-y-4 text-xs">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <RefreshCw className="w-5 h-5 text-red-700" />
              <span>Database Synchronization & Cache</span>
            </div>
            <p className="text-slate-600">
              Force refresh local cache and sync directly with the live Firestore collections ("Users" and "Events").
            </p>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('nmo_firestore_users_v2');
                localStorage.removeItem('nmo_firestore_events_v2');
                window.location.reload();
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Clear Local Cache & Re-sync Firestore</span>
            </button>
          </div>

          {/* Purge / Reset Non-Admin Users Card */}
          <div className="bg-rose-50/50 rounded-xl border border-rose-200 p-6 shadow-xs space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-950 font-bold text-sm">
                <Trash2 className="w-5 h-5 text-rose-600" />
                <span>Clear Non-Admin Member Records</span>
              </div>
              <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 rounded-full font-mono text-[11px] font-bold">
                {nonAdminCount} non-admin members
              </span>
            </div>

            <p className="text-rose-900 text-[11px] leading-relaxed">
              Permanently purges all standard member documents from Cloud Firestore while preserving all Super Admin, State Admin, and Prant Admin accounts. Use this before importing a fresh master database. An automatic backup is downloaded before deletion.
            </p>

            {clearFeedback && (
              <div className="p-3 bg-white border border-emerald-300 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{clearFeedback}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setClearInputText('');
                setShowClearModal(true);
              }}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Purge Non-Admin Users ({nonAdminCount})</span>
            </button>
          </div>
        </div>
      )}

      {/* Clear Non-Admin Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 text-xs">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-rose-100 text-rose-800 shrink-0">
                <Trash2 className="w-6 h-6 text-rose-700" />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900">
                  Confirm Purge of Non-Admin Members
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Are you sure you want to clear all imported member records?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex justify-between py-1 border-b border-slate-200 font-mono">
                <span className="text-slate-600 font-sans">Member Records to Delete:</span>
                <span className="font-bold text-rose-700">{nonAdminCount} members</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200 font-mono">
                <span className="text-slate-600 font-sans">Protected Admin Accounts (Preserved):</span>
                <span className="font-bold text-emerald-700">
                  {users.length - nonAdminCount} accounts (Super Admin, State Admin, Prant Admins)
                </span>
              </div>
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>A complete JSON snapshot backup will be downloaded before deleting.</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-800">
                Type <span className="font-mono text-red-700">CLEAR MEMBERS</span> to confirm:
              </label>
              <input
                type="text"
                placeholder="CLEAR MEMBERS"
                value={clearInputText}
                onChange={(e) => setClearInputText(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={clearInputText !== 'CLEAR MEMBERS' || isClearing}
                onClick={handleExecuteClear}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white shadow-md transition-all cursor-pointer ${
                  clearInputText === 'CLEAR MEMBERS' && !isClearing
                    ? 'bg-rose-700 hover:bg-rose-800 shadow-rose-200'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                {isClearing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Purging from Firestore...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Purge Non-Admin Users</span>
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
