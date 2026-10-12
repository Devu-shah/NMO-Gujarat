import React, { useState } from 'react';
import { useNMO } from '../context/NMOContext';
import { NmoLogo } from './NmoLogo';
import { Mail, Lock, AlertCircle, ArrowRight, CheckCircle2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { UserRole } from '../types/nmo';

interface LoginPageProps {
  onSuccessRedirect: (role: UserRole, prant?: string) => void;
  onNavigateHome: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccessRedirect, onNavigateHome }) => {
  const { loginWithEmail, resetPassword } = useNMO();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (isForgotMode) {
        if (!email.trim()) {
          throw new Error('Please enter your registered email address.');
        }
        await resetPassword(email.trim());
        setSuccessMsg(`Password reset link dispatched to ${email.trim()}. Please check your inbox.`);
        setIsLoading(false);
        return;
      }

      if (!email.trim() || !password) {
        throw new Error('Please provide both email address and password.');
      }

      // Single Unified Authentication
      const resolvedRole = await loginWithEmail(email.trim(), password);

      // Determine redirect path
      onSuccessRedirect(resolvedRole);
    } catch (err: any) {
      console.warn('Login error:', err);
      let msg = err.message || 'Authentication failed. Please verify credentials.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        msg = 'Invalid email or password. Please verify and try again.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Access temporarily locked due to multiple failed attempts. Please try again later.';
      }
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 w-full">
      {/* Top Bar with Return Home */}
      <div className="max-w-md w-full mx-auto mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onNavigateHome}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Official Website</span>
        </button>
        <span className="text-[11px] text-amber-400/90 font-mono tracking-wider font-semibold">
          SECURE PORTAL LOGIN
        </span>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full mx-auto bg-white rounded-3xl p-8 sm:p-10 text-slate-900 shadow-2xl border border-slate-100">
        {/* Logo & Portal Branding */}
        <div className="text-center mb-8">
          <NmoLogo size="lg" className="mx-auto mb-4" />
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            NMO Gujarat Unified Portal
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1.5">
            Single secure entry for Members, State & Prant Administration
          </p>
        </div>

        {/* Feedback Banners */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2.5 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span className="font-medium leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-medium leading-relaxed">{successMsg}</span>
          </div>
        )}

        {/* Unified Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Login ID / Email Address
            </label>
            <div className="relative">
              <input
                type="text"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@nmogujarat.org or Membership No"
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600 focus:border-red-600 focus:outline-hidden transition-all font-mono"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            </div>
          </div>

          {!isForgotMode && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotMode(true);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs text-red-700 hover:text-red-800 font-semibold hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-600 focus:border-red-600 focus:outline-hidden transition-all font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-slate-400 hover:text-slate-600 absolute right-3 top-2.5 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="group w-full py-3 px-4 bg-red-700 hover:bg-red-800 active:scale-[0.99] disabled:bg-slate-300 text-white font-bold text-sm rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Authenticating with Firebase...</span>
              </div>
            ) : isForgotMode ? (
              <span>Send Reset Instructions</span>
            ) : (
              <>
                <span className="font-bold tracking-wide">Sign In</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        {isForgotMode && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsForgotMode(false);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer hover:underline"
            >
              ← Back to Sign In
            </button>
          </div>
        )}

        {/* Security and Routing Guarantee */}
        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Your permissions are determined directly by your verified <strong>Users</strong> profile in Cloud Firestore. Role selection is strictly server-governed.
          </p>
        </div>
      </div>
    </div>
  );
};
