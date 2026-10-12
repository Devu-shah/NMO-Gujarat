import React, { useState } from 'react';
import { useNMO } from '../context/NMOContext';
import { NmoLogo } from './NmoLogo';
import { UserRole } from '../types/nmo';
import { X, Mail, Lock, User, KeyRound, CheckCircle, AlertCircle, ArrowRight, Shield } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (role?: UserRole) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { loginWithEmail, registerWithEmail, resetPassword } = useNMO();

  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [membershipNo, setMembershipNo] = useState('');
  const [name, setName] = useState('');
  const [prant, setPrant] = useState<'Gujarat' | 'Saurashtra'>('Gujarat');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (tab === 'login') {
        const userRole = await loginWithEmail(email, password);
        onSuccess(userRole);
        onClose();
      } else if (tab === 'register') {
        if (!membershipNo.trim()) {
          throw new Error('Please enter your Membership Number');
        }
        const userRole = await registerWithEmail(email, password, membershipNo.trim(), name.trim(), prant);
        onSuccess(userRole);
        onClose();
      } else if (tab === 'forgot') {
        await resetPassword(email);
        setInfoMsg(`Password reset instructions sent to ${email}`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-md"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <NmoLogo size="md" />
          <div>
            <h3 className="text-xl font-black text-slate-900 leading-tight">
              NMO Gujarat Portal
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              Unified Access · Members & Administration
            </span>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 mb-6">
          <button
            onClick={() => {
              setTab('login');
              setErrorMsg(null);
            }}
            className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px flex-1 text-center ${
              tab === 'login'
                ? 'border-red-700 text-red-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Portal Login
          </button>
          <button
            onClick={() => {
              setTab('register');
              setErrorMsg(null);
            }}
            className={`pb-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px flex-1 text-center ${
              tab === 'register'
                ? 'border-red-700 text-red-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Activate Account
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Dr. Harshil Patel"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Membership Number *
                </label>
                <input
                  type="text"
                  required
                  value={membershipNo}
                  onChange={(e) => setMembershipNo(e.target.value)}
                  placeholder="e.g. NMO-GUJ-2024-001"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden uppercase"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Your official identifier in the NMO Gujarat database.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Prant *
                </label>
                <select
                  value={prant}
                  onChange={(e) => setPrant(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
                >
                  <option value="Gujarat">Gujarat Prant</option>
                  <option value="Saurashtra">Saurashtra Prant</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Login ID / Email Address *
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@nmogujarat.org or Membership No"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden font-mono"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          {tab !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Password *
                </label>
                {tab === 'login' && (
                  <button
                    type="button"
                    onClick={() => setTab('forgot')}
                    className="text-[11px] text-red-700 hover:underline"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>
          )}

          {tab === 'login' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-slate-800">
                <KeyRound className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span>Secure Member Authentication</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Enter your registered Login ID and password to access your dashboard. If you have forgotten your password, click &ldquo;Forgot Password?&rdquo; above to receive a secure reset link.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-red-700 hover:bg-red-800 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : tab === 'login' ? (
              <span>Sign In to Portal</span>
            ) : tab === 'register' ? (
              <span>Activate & Connect Profile</span>
            ) : (
              <span>Send Reset Instructions</span>
            )}
          </button>
        </form>

        <p className="text-[11px] text-center text-slate-500 mt-5 leading-relaxed">
          The system will automatically guide you to your designated portal (Member Dashboard or Administrative Console) based on your verified role in the Users database.
        </p>
      </div>
    </div>
  );
};
