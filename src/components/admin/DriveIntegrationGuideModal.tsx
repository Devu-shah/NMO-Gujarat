import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Key,
  FolderOpen,
  RefreshCw,
  Terminal,
  X,
  Sparkles,
  Info,
  AlertCircle,
  Lock,
  ArrowRight
} from 'lucide-react';
import {
  NMO_ROOT_DRIVE_FOLDER_ID,
  NMO_ROOT_DRIVE_FOLDER_NAME,
  NMO_ROOT_DRIVE_URL,
  connectWithManualToken
} from '../../lib/googleDrive';
import { auth, firebaseConfig } from '../../lib/firebase';

export type GuideTab =
  | 'invalid_secret'
  | 'quick_guide'
  | 'access_denied'
  | 'refresh_token'
  | 'manual_token'
  | 'diagnostics';

interface DriveIntegrationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectNow?: () => void;
  initialTab?: GuideTab;
  onManualConnectSuccess?: () => void;
}

export const DriveIntegrationGuideModal: React.FC<DriveIntegrationGuideModalProps> = ({
  isOpen,
  onClose,
  onConnectNow,
  initialTab = 'invalid_secret',
  onManualConnectSuccess
}) => {
  const [copiedUri, setCopiedUri] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GuideTab>(initialTab);
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // Manual Token Form State
  const [manualAccessToken, setManualAccessToken] = useState('');
  const [manualRefreshToken, setManualRefreshToken] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [isVerifyingManual, setIsVerifyingManual] = useState(false);
  const [manualFeedback, setManualFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const redirectUri = `${origin}/api/auth/google/callback`;
  const localhostRedirectUri = 'http://localhost:3000/api/auth/google/callback';
  const currentProjectId = firebaseConfig.projectId || auth?.app?.options?.projectId || 'nmo-india-demo';
  const currentAuthDomain = firebaseConfig.authDomain || auth?.app?.options?.authDomain || `${currentProjectId}.firebaseapp.com`;
  const firebaseHandlerUri = `https://${currentAuthDomain}/__/auth/handler`;

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      checkStatus();
      setManualFeedback(null);
    }
  }, [isOpen, initialTab]);

  const checkStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/drive/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch (e) {
      console.warn('Status check notice:', e);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUri(label);
    setTimeout(() => setCopiedUri(null), 2500);
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAccessToken.trim()) {
      setManualFeedback({ message: 'Please enter a Google Access Token.', type: 'error' });
      return;
    }

    setIsVerifyingManual(true);
    setManualFeedback(null);

    try {
      const session = await connectWithManualToken(
        manualAccessToken.trim(),
        manualRefreshToken.trim() || undefined,
        manualEmail.trim() || undefined
      );

      setManualFeedback({
        message: `Connected successfully for ${session.accountEmail}! Certificates will sync with Drive.`,
        type: 'success'
      });

      if (onManualConnectSuccess) {
        onManualConnectSuccess();
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setManualFeedback({
        message: err.message || 'Failed to verify manual token. Please ensure token is valid and has Drive scopes.',
        type: 'error'
      });
    } finally {
      setIsVerifyingManual(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-red-950 text-white p-5 sm:p-6 flex items-start justify-between gap-4 border-b border-slate-800">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-red-600/30 border border-red-500/50 flex items-center justify-center text-red-300 shrink-0 shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-white">
                  Google Drive Integration & Setup Guide
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
                  Solutions & Diagnostics
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Fix "Invalid Client Secret" errors, resolve Access Denied, understand Refresh Tokens, or connect directly with manual tokens.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Close guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('invalid_secret')}
            className={`py-3 px-3 text-center cursor-pointer border-b-2 transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'invalid_secret'
                ? 'border-red-600 text-red-700 bg-white'
                : 'border-transparent hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-600 shrink-0"></span>
            <span>Fix Invalid Secret</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quick_guide')}
            className={`py-3 px-3 text-center cursor-pointer border-b-2 transition-all ${
              activeTab === 'quick_guide'
                ? 'border-red-600 text-red-700 bg-white'
                : 'border-transparent hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Setup Steps
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('access_denied')}
            className={`py-3 px-3 text-center cursor-pointer border-b-2 transition-all ${
              activeTab === 'access_denied'
                ? 'border-red-600 text-red-700 bg-white'
                : 'border-transparent hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Fix "Access Denied"
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('refresh_token')}
            className={`py-3 px-3 text-center cursor-pointer border-b-2 transition-all ${
              activeTab === 'refresh_token'
                ? 'border-red-600 text-red-700 bg-white'
                : 'border-transparent hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Refresh Token Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual_token')}
            className={`py-3 px-3 text-center cursor-pointer border-b-2 transition-all ${
              activeTab === 'manual_token'
                ? 'border-red-600 text-red-700 bg-white'
                : 'border-transparent hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Quick Connect (Token)
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 text-xs sm:text-sm">
          {/* TAB 0: FIX INVALID CLIENT SECRET */}
          {activeTab === 'invalid_secret' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Highlight Box with User Error */}
              <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-300 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-red-950 text-sm">
                      Firebase Error: "The provided client secret is invalid" (auth/invalid-credential)
                    </h4>
                    <p className="text-xs text-red-800 mt-1 leading-relaxed">
                      Redirect URI: <code className="bg-red-100 px-1 py-0.5 rounded font-mono">{firebaseHandlerUri}</code>
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-white/90 rounded-xl border border-red-200 text-xs text-slate-700 leading-relaxed">
                  <strong>Why this happened:</strong> When you clicked "Authorize Google Drive", Firebase Authentication opened Google login. After you logged in, Firebase's backend server (<code>{firebaseHandlerUri}</code>) tried to trade the authorization code with Google using the <strong>Web Client Secret</strong> configured in Firebase Console. Google rejected it with <code>HTTP 401 Unauthorized: The provided client secret is invalid</code> because the secret in Firebase is incorrect, expired, or mismatching.
                </div>
              </div>

              {/* Exact 3-Step Fix */}
              <div className="space-y-3.5">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>How to Fix in 2 Minutes:</span>
                </h4>

                {/* Step 1 */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      1
                    </span>
                    <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                      Copy the Web Client Secret from Google Cloud Console
                    </h5>
                  </div>
                  <p className="text-xs text-slate-600 mb-3 pl-8 leading-relaxed">
                    Open your Google Cloud Project Credentials. Look for the <strong>OAuth 2.0 Client IDs</strong> list. Open your <strong>Web client</strong> (usually titled <em>"Web client (auto created by Google Service)"</em> or your Web application client). Copy the <strong>Client Secret</strong> value.
                  </p>
                  <div className="pl-8 flex flex-wrap items-center gap-2">
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                    >
                      <span>Open Google Cloud Credentials</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                    </a>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      2
                    </span>
                    <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                      Paste Secret in Firebase Console (Sign-in Providers &gt; Google)
                    </h5>
                  </div>
                  <p className="text-xs text-slate-600 mb-3 pl-8 leading-relaxed">
                    In Firebase Console under <strong>Authentication &gt; Sign-in method &gt; Google</strong> provider, expand the <strong>Web SDK configuration</strong> accordion. Paste the exact Client Secret into the <strong>Web client secret</strong> input box and click <strong>SAVE</strong>.
                  </p>
                  <div className="pl-8 flex flex-wrap items-center gap-2">
                    <a
                      href={`https://console.firebase.google.com/project/${currentProjectId}/authentication/providers`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
                    >
                      <span>Open Firebase Console &gt; Google Provider</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      3
                    </span>
                    <h5 className="font-bold text-slate-900 text-xs sm:text-sm">
                      Verify Authorized Redirect URI in Google Cloud Console
                    </h5>
                  </div>
                  <p className="text-xs text-slate-600 mb-3 pl-8 leading-relaxed">
                    In your Google Cloud OAuth 2.0 Web Client settings, ensure this Firebase redirect handler is listed under <strong>Authorized redirect URIs</strong>:
                  </p>
                  <div className="pl-8 flex items-center gap-2">
                    <code className="p-2 bg-slate-100 rounded-lg text-xs font-mono text-slate-900 select-all border border-slate-200 flex-1 truncate">
                      {firebaseHandlerUri}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(firebaseHandlerUri, 'handler')}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      {copiedUri === 'handler' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUri === 'handler' ? 'Copied' : 'Copy URI'}</span>
                    </button>
                  </div>
                </div>

                {/* Direct Alternative */}
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs sm:text-sm">
                    <Sparkles className="w-4 h-4 text-emerald-700" />
                    <span>Best Alternative: Bypass Firebase Entirely via Direct Server OAuth</span>
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    You do not even need Firebase Auth for Google Drive! If you configure <code>GOOGLE_DRIVE_CLIENT_ID</code> and <code>GOOGLE_DRIVE_CLIENT_SECRET</code> in your server <code>.env</code> file, our system uses direct server-side OAuth (<code>/api/auth/google/start</code>), completely bypassing Firebase Auth and automatically generating a persistent refresh token!
                  </p>
                  <div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('manual_token')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      <span>Or Connect Instantly Using a Manual Token</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: QUICK GUIDE */}
          {activeTab === 'quick_guide' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <strong>Important Concept:</strong> Google Cloud Console <strong>does not provide a refresh token</strong> in its dashboard. You only configure your <code>Client ID</code> and <code>Client Secret</code>. Our portal automatically requests, receives, and securely stores the refresh token on the server forever!
                </div>
              </div>

              <div className="space-y-4">
                {/* Step 1 */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      1
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Enable Google Drive API in Google Cloud Console
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 mb-2 pl-8 leading-relaxed">
                    Open your Google Cloud Project, go to the API Library, search for <strong>Google Drive API</strong>, and click <strong>ENABLE</strong>.
                  </p>
                  <div className="pl-8">
                    <a
                      href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold border border-slate-200 cursor-pointer"
                    >
                      <span>Open Google Drive API in Cloud Console</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    </a>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      2
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Create Web Application OAuth 2.0 Credentials
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 mb-3 pl-8 leading-relaxed">
                    In <strong>APIs & Services &gt; Credentials</strong>, click <strong>Create Credentials &gt; OAuth client ID</strong>. Select application type <strong>Web application</strong>. Add the following redirect URIs:
                  </p>
                  <div className="pl-8 space-y-2">
                    <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-xl border border-slate-200">
                      <code className="text-xs font-mono text-slate-800 select-all flex-1 truncate">
                        {redirectUri}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(redirectUri, 'current')}
                        className="px-2.5 py-1 bg-white hover:bg-slate-200 rounded-lg text-xs font-bold border border-slate-300 text-slate-700 flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        {copiedUri === 'current' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedUri === 'current' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-xl border border-slate-200">
                      <code className="text-xs font-mono text-slate-800 select-all flex-1 truncate">
                        {localhostRedirectUri}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(localhostRedirectUri, 'localhost')}
                        className="px-2.5 py-1 bg-white hover:bg-slate-200 rounded-lg text-xs font-bold border border-slate-300 text-slate-700 flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        {copiedUri === 'localhost' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedUri === 'localhost' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      3
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Add Your Email to "Test Users" (Prevents "Access Denied")
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 mb-2 pl-8 leading-relaxed">
                    Because your Cloud Project is in Testing mode, you <strong>MUST add your Google account</strong> under <strong>OAuth consent screen &gt; Test users</strong>. Otherwise Google will return <code className="bg-red-50 text-red-700 px-1 py-0.5 rounded">Error 403: access_denied</code>!
                  </p>
                  <div className="pl-8">
                    <a
                      href="https://console.cloud.google.com/apis/credentials/consent"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold border border-slate-200 cursor-pointer"
                    >
                      <span>Open OAuth Consent Screen &gt; Test Users</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    </a>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      4
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Authorize Google Drive in 1-Click
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 mb-3 pl-8 leading-relaxed">
                    Once <code>GOOGLE_DRIVE_CLIENT_ID</code> and <code>GOOGLE_DRIVE_CLIENT_SECRET</code> are added to your environment variables or <code>.env</code>, click the button below to complete the authorization!
                  </p>
                  <div className="pl-8">
                    {onConnectNow && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onConnectNow();
                        }}
                        className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Authorize Google Drive Now</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FIX ACCESS DENIED */}
          {activeTab === 'access_denied' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-red-950 text-sm mb-1">
                    Why did "Access Denied to Drive" happen?
                  </h4>
                  <p className="text-xs text-red-800 leading-relaxed">
                    Google OAuth returns <strong>Error 403: access_denied</strong> or <strong>Access blocked: Authorization Error</strong> for four specific reasons. Follow the fixes below in order:
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Reason 1 */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <span className="text-[10px] uppercase font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                    Fix #1 (Most Common - 90% of cases)
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm mt-1 mb-1">
                    Add Your Email to "Test Users" in Google Cloud Console
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    When an OAuth Consent Screen is in <strong>Testing</strong> status (the default), Google strictly denies access to any Google account that is not listed under Test Users.
                  </p>
                  <ol className="list-decimal list-inside text-xs text-slate-700 space-y-1.5 pl-2 mb-3">
                    <li>Go to <strong>Google Cloud Console &gt; APIs & Services &gt; OAuth consent screen</strong>.</li>
                    <li>Scroll down to the <strong>Test users</strong> section.</li>
                    <li>Click <strong>+ ADD USERS</strong>.</li>
                    <li>Enter your Google email (e.g., <code>devanshshah768@gmail.com</code> or your admin email).</li>
                    <li>Click <strong>SAVE</strong>.</li>
                  </ol>
                  <a
                    href="https://console.cloud.google.com/apis/credentials/consent"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                  >
                    <span>Open OAuth Consent Screen Now</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                  </a>
                </div>

                {/* Reason 2 */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    Fix #2
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm mt-1 mb-1">
                    Bypass the "Google hasn't verified this app" Warning
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed mb-2">
                    When signing in, Google may display a warning screen stating <em>"Google hasn't verified this app"</em>.
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                    Click the small link at the bottom left: <u>Advanced</u> &gt; then click <u>Go to NMO Gujarat (unsafe)</u> &gt; then click <u>Continue</u>.
                  </p>
                </div>

                {/* Reason 3 */}
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
                  <span className="text-[10px] uppercase font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                    Fix #3
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm mt-1 mb-1">
                    Enable the Google Drive API Library
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    If the Google Drive API is disabled in your project, token requests fail with an API access error.
                  </p>
                  <a
                    href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold border border-slate-200 cursor-pointer"
                  >
                    <span>Verify Google Drive API is Enabled</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                  </a>
                </div>

                {/* Reason 4: Firebase Unauthorized Domain */}
                <div className="p-4 rounded-2xl bg-white border border-red-300 shadow-xs">
                  <span className="text-[10px] uppercase font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                    Fix #4 (Firebase: auth/unauthorized-domain)
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm mt-1 mb-1">
                    Add "{origin.replace(/https?:\/\//, '')}" to Firebase Authorized Domains
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    If you deploy to Firebase Hosting or a custom domain, Firebase Auth blocks all Google login popups until that domain is added to Authorized Domains.
                  </p>
                  <ol className="list-decimal list-inside text-xs text-slate-700 space-y-1.5 pl-2 mb-3">
                    <li>Open <strong>Firebase Console &gt; Authentication &gt; Settings</strong> tab.</li>
                    <li>Scroll to <strong>Authorized domains</strong> and click <strong>Add domain</strong>.</li>
                    <li>Enter <strong>{origin.replace(/https?:\/\//, '')}</strong>.</li>
                    <li>Click <strong>Done</strong>. Google sign-in popups will now work immediately!</li>
                  </ol>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(origin.replace(/https?:\/\//, ''), 'domain')}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold border border-slate-200 cursor-pointer flex items-center gap-1"
                    >
                      {copiedUri === 'domain' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUri === 'domain' ? 'Copied' : `Copy: ${origin.replace(/https?:\/\//, '')}`}</span>
                    </button>
                    <a
                      href={`https://console.firebase.google.com/project/${currentProjectId}/authentication/settings`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 cursor-pointer"
                    >
                      <span>Open Firebase Settings &gt; Authorized Domains</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: REFRESH TOKEN INFO */}
          {activeTab === 'refresh_token' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-start gap-3">
                <Key className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-blue-950 text-sm mb-1">
                    Why can't I find a Refresh Token in Google Cloud Console?
                  </h4>
                  <p className="text-xs text-blue-900 leading-relaxed">
                    <strong>Google Cloud Console NEVER shows or creates a refresh token!</strong> A refresh token is not a setting you copy from the dashboard; it is a secure cryptographic token generated by Google's OAuth servers only during the initial authorization handoff.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                <h4 className="font-bold text-slate-900 text-sm">
                  How Our System Automatically Manages Your Refresh Token:
                </h4>
                <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>1. Zero Manual Copying:</strong> When you click "Authorize Google Drive", our server requests <code>access_type=offline</code> and <code>prompt=consent</code>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>2. Encrypted Server Storage:</strong> Google exchanges the authorization code for a long-lived Refresh Token, which is saved safely on the server at <code>.credentials/drive_session_secure.json</code>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>3. 24/7 Silent Auto-Renewal:</strong> Whenever an access token reaches its 1-hour expiration, our background service silently requests a fresh token from Google using the refresh token. Admins and members never get re-prompted!</span>
                  </div>
                </div>
              </div>

              {/* OAuth Playground instructions */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-slate-700" />
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                    Generating a Manual Refresh Token via Google OAuth Playground
                  </h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  If you want to manually generate a token using Google OAuth Playground:
                </p>
                <ol className="list-decimal list-inside text-xs text-slate-700 space-y-1 pl-2">
                  <li>Open <a href="https://developers.google.com/oauthplayground/" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">developers.google.com/oauthplayground</a></li>
                  <li>Click the Gear icon ⚙️ on the top right, check <strong>"Use your own OAuth credentials"</strong>, and enter your <code>Client ID</code> & <code>Client Secret</code>.</li>
                  <li>In Step 1 on the left, scroll to <strong>Drive API v3</strong> and select <code>https://www.googleapis.com/auth/drive</code>.</li>
                  <li>Click <strong>Authorize APIs</strong> and approve the Google login.</li>
                  <li>In Step 2, click <strong>Exchange authorization code for tokens</strong>.</li>
                  <li>Copy the resulting <code>Access token</code> or <code>Refresh token</code> and paste it into the <strong>"Quick Connect (Token)"</strong> tab!</li>
                </ol>
              </div>
            </div>
          )}

          {/* TAB 4: QUICK CONNECT VIA MANUAL TOKEN */}
          {activeTab === 'manual_token' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                <Lock className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-emerald-950 text-sm mb-1">
                    Connect Immediately with an OAuth Token
                  </h4>
                  <p className="text-xs text-emerald-900 leading-relaxed">
                    If Firebase Auth or Google popups are giving you errors, you can bypass all popup authentication by pasting an Access Token or Refresh Token from the Google OAuth Playground or Google Cloud Shell.
                  </p>
                </div>
              </div>

              {manualFeedback && (
                <div
                  className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
                    manualFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-red-50 text-red-900 border-red-300'
                  }`}
                >
                  {manualFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{manualFeedback.message}</span>
                </div>
              )}

              <form onSubmit={handleManualTokenSubmit} className="space-y-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Google OAuth Access Token <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={manualAccessToken}
                    onChange={(e) => setManualAccessToken(e.target.value)}
                    placeholder="ya29.a0AfH6SM..."
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Generated from Google OAuth Playground with scope <code>https://www.googleapis.com/auth/drive</code>
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Refresh Token (Optional, for auto-renewal)
                    </label>
                    <input
                      type="password"
                      value={manualRefreshToken}
                      onChange={(e) => setManualRefreshToken(e.target.value)}
                      placeholder="1//04..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Account Email (Optional)
                    </label>
                    <input
                      type="email"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      placeholder="devanshshah768@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    Validated against Google userinfo and saved persistently.
                  </span>
                  <button
                    type="submit"
                    disabled={isVerifyingManual || !manualAccessToken.trim()}
                    className="px-5 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    {isVerifyingManual ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying with Google...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Verify & Connect Drive</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 5: DIAGNOSTICS */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <h4 className="font-bold text-slate-900 text-sm">
                      Live Environment Status
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={checkStatus}
                    disabled={isLoadingStatus}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer border border-slate-200"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block mb-1">Server Direct OAuth Config:</span>
                    <span className={`font-bold ${serverStatus?.oauthConfigured ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {serverStatus?.oauthConfigured ? '✓ Configured' : '⚠ Missing GOOGLE_DRIVE_CLIENT_ID / SECRET'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block mb-1">Active Server Session:</span>
                    <span className={`font-bold ${serverStatus?.connected ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {serverStatus?.connected ? `✓ Connected (${serverStatus?.accountEmail})` : 'Not Connected'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 sm:col-span-2">
                    <span className="text-slate-500 block mb-1">Mega Folder ID:</span>
                    <span className="font-mono text-slate-800 break-all">
                      {NMO_ROOT_DRIVE_FOLDER_ID} ({NMO_ROOT_DRIVE_FOLDER_NAME})
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 sm:col-span-2">
                    <span className="text-slate-500 block mb-1">Registered Direct OAuth Redirect URI:</span>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <code className="text-slate-900 font-mono text-[11px] truncate select-all">
                        {redirectUri}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(redirectUri, 'diag')}
                        className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
                      >
                        {copiedUri === 'diag' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Certificates Filtering Rule */}
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs sm:text-sm">
                  <FolderOpen className="w-4 h-4 text-amber-700" />
                  <span>Participant Certificate Naming & Filtering Verification</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  As requested, participant certificates in Google Drive must be named with their Membership ID (e.g. <code>NMO-GJ-2024-001.pdf</code>, <code>NMO-GJ-2024-001_Paper.jpg</code>).
                </p>
                <div className="bg-white/80 p-3 rounded-xl border border-amber-200 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900 mb-1">Enforced Privacy Protection:</p>
                  <p className="leading-relaxed">
                    The backend endpoint <code>/api/drive/member-certificates/:membershipNumber</code> strictly filters query results so that only files matching the user's specific membership ID are ever returned. No participant can view certificates belonging to others!
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>NMO Gujarat Administrative Infrastructure</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors cursor-pointer"
            >
              Close Guide
            </button>
            {onConnectNow && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onConnectNow();
                }}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold rounded-xl transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Connect Google Drive</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
