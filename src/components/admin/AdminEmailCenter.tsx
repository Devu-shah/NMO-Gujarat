import React, { useState, useEffect } from 'react';
import { useNMO } from '../../context/NMOContext';
import {
  Mail,
  Send,
  CheckCircle2,
  Users,
  Calendar,
  AlertCircle,
  Key,
  RefreshCw,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Terminal,
  Lock,
  Server,
  Zap,
  Activity
} from 'lucide-react';
import { apiUrl } from '../../lib/api';

interface EmailServiceStatus {
  configured: boolean;
  provider: 'gmail' | 'smtp' | 'brevo' | 'sendgrid' | 'ses' | 'ethereal_test' | 'unconfigured';
  recipient: string;
  senderAddress?: string;
  senderName?: string;
  smtpHost?: string;
  smtpPort?: number;
  verified: boolean;
  lastError?: string;
  latencyMs?: number;
}

export const AdminEmailCenter: React.FC = () => {
  const { members, events, eventRegistrations, currentUser, logAudit } = useNMO();

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isPrantAdmin = currentUser?.role === 'prant_admin';
  const assignedPrant = currentUser?.prant;

  // Email Diagnostic & Setup State
  const [emailStatus, setEmailStatus] = useState<EmailServiceStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [showAppPasswordGuide, setShowAppPasswordGuide] = useState<boolean>(false);

  // Multi-Provider Configuration Form State
  const [selectedProvider, setSelectedProvider] = useState<'gmail' | 'brevo' | 'sendgrid' | 'ses' | 'smtp'>('gmail');
  const [configEmail, setConfigEmail] = useState<string>('secretariat@nmogujarat.org');
  const [configAppPassword, setConfigAppPassword] = useState<string>('');
  const [smtpHost, setSmtpHost] = useState<string>('smtp-relay.brevo.com');
  const [smtpPort, setSmtpPort] = useState<number>(587);
  const [smtpUser, setSmtpUser] = useState<string>('');
  const [smtpPass, setSmtpPass] = useState<string>('');
  const [fromName, setFromName] = useState<string>('National Medicos Organisation Gujarat');
  const [fromEmail, setFromEmail] = useState<string>('secretariat@nmogujarat.org');
  const [recipientEmail, setRecipientEmail] = useState<string>('secretariat@nmogujarat.org');
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [configFeedback, setConfigFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // Live TCP ping state
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<{ success: boolean; latencyMs: number; error?: string } | null>(null);

  // Test Email State
  const [testRecipient, setTestRecipient] = useState<string>(currentUser?.email || 'secretariat@nmogujarat.org');
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string; previewUrl?: string } | null>(null);

  // Broadcast Circular State
  const [targetType, setTargetType] = useState<'all' | 'prant' | 'event' | 'individual'>('prant');
  const [selectedPrant, setSelectedPrant] = useState<string>(
    isPrantAdmin && assignedPrant && assignedPrant !== 'All' ? assignedPrant : 'Gujarat'
  );
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.eventId || '');
  const [individualEmail, setIndividualEmail] = useState<string>('');

  const [subject, setSubject] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [sentReport, setSentReport] = useState<{ count: number; target: string } | null>(null);

  // Load live email status on mount
  const checkEmailStatus = async (force = false) => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch(apiUrl(`/api/email/status${force ? '?force=true' : ''}`));
      if (res.ok) {
        const data = await res.json();
        if (data.emailService) {
          setEmailStatus(data.emailService);
          if (data.emailService.senderAddress) {
            setConfigEmail(data.emailService.senderAddress);
            setFromEmail(data.emailService.senderAddress);
          }
          if (data.emailService.senderName) {
            setFromName(data.emailService.senderName);
          }
          if (data.emailService.recipient) {
            setRecipientEmail(data.emailService.recipient);
          }
          if (data.emailService.smtpHost) {
            setSmtpHost(data.emailService.smtpHost);
          }
          if (data.emailService.smtpPort) {
            setSmtpPort(data.emailService.smtpPort);
          }
          if (data.emailService.provider && data.emailService.provider !== 'unconfigured' && data.emailService.provider !== 'ethereal_test') {
            setSelectedProvider(data.emailService.provider as any);
          }
        }
      }
    } catch (err: any) {
      console.warn('Notice checking email status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    checkEmailStatus();
  }, []);

  const handleSelectPreset = (p: 'gmail' | 'brevo' | 'sendgrid' | 'ses' | 'smtp') => {
    setSelectedProvider(p);
    setPingResult(null);
    setConfigFeedback(null);
    if (p === 'gmail') {
      setSmtpHost('smtp.gmail.com');
      setSmtpPort(587);
    } else if (p === 'brevo') {
      setSmtpHost('smtp-relay.brevo.com');
      setSmtpPort(587);
      if (!smtpUser && configEmail) setSmtpUser(configEmail);
    } else if (p === 'sendgrid') {
      setSmtpHost('smtp.sendgrid.net');
      setSmtpPort(587);
      setSmtpUser('apikey');
    } else if (p === 'ses') {
      setSmtpHost('email-smtp.us-east-1.amazonaws.com');
      setSmtpPort(587);
    }
  };

  const handlePingTest = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const targetHost = selectedProvider === 'gmail' ? 'smtp.gmail.com' : (smtpHost.trim() || 'smtp.gmail.com');
      const targetPort = selectedProvider === 'gmail' ? 587 : (Number(smtpPort) || 587);
      const res = await fetch(apiUrl('/api/email/ping'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: targetHost, port: targetPort })
      });
      const data = await res.json();
      setPingResult(data);
    } catch (err: any) {
      setPingResult({ success: false, latencyMs: 0, error: err.message || 'Ping failed' });
    } finally {
      setIsPinging(false);
    }
  };

  // Save Nodemailer credentials
  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedProvider === 'gmail' && (!configEmail.trim() || !configAppPassword.trim())) {
      setConfigFeedback({
        type: 'error',
        message: 'Please provide both your Gmail account and 16-character Google App Password.'
      });
      return;
    }

    if (selectedProvider !== 'gmail' && (!smtpHost.trim() || !smtpUser.trim() || !smtpPass.trim())) {
      setConfigFeedback({
        type: 'error',
        message: 'Please provide SMTP Host, Port, Username, and Password / API Key.'
      });
      return;
    }

    setIsSavingConfig(true);
    setConfigFeedback(null);

    try {
      const payload: Record<string, any> = {
        provider: selectedProvider,
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim() || configEmail.trim(),
        recipientEmail: recipientEmail.trim()
      };

      if (selectedProvider === 'gmail') {
        payload.gmailUser = configEmail.trim();
        payload.gmailAppPassword = configAppPassword.trim();
        payload.smtpHost = 'smtp.gmail.com';
        payload.smtpPort = 587;
      } else {
        payload.smtpHost = smtpHost.trim();
        payload.smtpPort = Number(smtpPort) || 587;
        payload.smtpUser = smtpUser.trim();
        payload.smtpPass = smtpPass.trim();
      }

      const res = await fetch(apiUrl('/api/email/save-config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const isVerified = Boolean(data.emailService?.verified);
        setConfigFeedback({
          type: isVerified ? 'success' : 'warning',
          message: data.message || (isVerified ? 'Configuration verified and activated!' : 'Configuration saved securely to server!')
        });
        setEmailStatus(data.emailService);
        if (isVerified) {
          setTimeout(() => setShowSetupModal(false), 2500);
        }
      } else {
        setConfigFeedback({
          type: 'error',
          message: data.error || 'Failed to save Nodemailer credentials.'
        });
      }
    } catch (err: any) {
      setConfigFeedback({
        type: 'error',
        message: err.message || 'Network error saving configuration.'
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Dispatch live test email
  const handleSendTestEmail = async () => {
    if (!testRecipient.trim() || !testRecipient.includes('@')) {
      setTestResult({ type: 'error', message: 'Please specify a valid test recipient email address.' });
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch(apiUrl('/api/email/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testRecipient.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          type: 'success',
          message: data.message || `Test email dispatched successfully to ${testRecipient}!`,
          previewUrl: data.result?.previewUrl
        });
        await checkEmailStatus();
      } else {
        setTestResult({
          type: 'error',
          message: data.error || 'Failed to dispatch test email. Check your SMTP / Google App Password.'
        });
      }
    } catch (err: any) {
      setTestResult({
        type: 'error',
        message: err.message || 'Failed to connect to email testing service.'
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // Compute resolved recipient email list supporting single or multiple recipients
  const resolvedRecipientEmails = React.useMemo(() => {
    if (targetType === 'all') {
      const targetMembers = isPrantAdmin
        ? members.filter((m) => m.prant === assignedPrant)
        : members;
      return Array.from(new Set(targetMembers.map((m) => m.email?.trim()).filter(Boolean) as string[]));
    }
    if (targetType === 'prant') {
      return Array.from(new Set(members.filter((m) => m.prant === selectedPrant).map((m) => m.email?.trim()).filter(Boolean) as string[]));
    }
    if (targetType === 'event') {
      return Array.from(new Set(eventRegistrations.filter((r) => r.eventId === selectedEventId).map((r) => r.email?.trim()).filter(Boolean) as string[]));
    }
    if (targetType === 'individual') {
      // Split by comma, semicolon, space, or newline to support multiple custom recipients
      return Array.from(
        new Set(
          individualEmail
            .split(/[,;\n\s]+/)
            .map((e) => e.trim())
            .filter((e) => e.length > 0 && e.includes('@'))
        )
      );
    }
    return [];
  }, [targetType, selectedPrant, selectedEventId, individualEmail, members, eventRegistrations, isPrantAdmin, assignedPrant]);

  const recipientCount = resolvedRecipientEmails.length;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      alert('Please fill out both subject and message body.');
      return;
    }

    if (resolvedRecipientEmails.length === 0) {
      setBroadcastError('No valid recipient email addresses found for the selected audience.');
      return;
    }

    setIsSending(true);
    setBroadcastError(null);
    setSentReport(null);

    try {
      let targetDesc = '';
      if (targetType === 'all') targetDesc = 'All Verified Members';
      else if (targetType === 'prant') targetDesc = `${selectedPrant} Prant Members`;
      else if (targetType === 'event') targetDesc = `Participants of ${events.find((e) => e.eventId === selectedEventId)?.title || selectedEventId}`;
      else targetDesc = `${resolvedRecipientEmails.length} Custom Recipient(s)`;

      const res = await fetch(apiUrl('/api/email/broadcast'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: resolvedRecipientEmails,
          subject: subject.trim(),
          message: message.trim(),
          targetDescription: targetDesc
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await logAudit(
          'EMAIL_DISPATCH',
          'COMMUNICATION',
          `EMAIL-${Date.now()}`,
          `Dispatched broadcast email "${subject}" to ${data.count || resolvedRecipientEmails.length} recipients (${targetDesc})`
        );

        setSentReport({ count: data.count || resolvedRecipientEmails.length, target: targetDesc });
        setSubject('');
        setMessage('');
        if (targetType === 'individual') {
          setIndividualEmail('');
        }
      } else {
        setBroadcastError(data.error || 'Failed to dispatch email broadcast. Please verify Nodemailer configuration.');
      }
    } catch (err: any) {
      setBroadcastError(err.message || 'Error occurred while contacting email broadcast service.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-red-700" />
            <span>Official Email & Circular Communication Desk</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Standardized Nodemailer dispatch engine for Contact Us submissions, attendee communications, and state circulars.
          </p>
        </div>

        <button
          type="button"
          onClick={() => checkEmailStatus(true)}
          disabled={isLoadingStatus}
          className="self-start sm:self-auto px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          title="Refresh connection status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin text-red-600' : 'text-slate-500'}`} />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* Nodemailer Transporter Status Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shrink-0 shadow-sm ${
              emailStatus?.verified
                ? 'bg-emerald-600'
                : emailStatus?.configured
                ? 'bg-amber-600'
                : 'bg-slate-600'
            }`}>
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-sm text-slate-900">
                  Nodemailer Service Transporter
                </span>
                {emailStatus?.verified ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Verified & Operational</span>
                  </span>
                ) : emailStatus?.configured ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                    <span>Auth Warning / Pending Check</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Transporter Unconfigured</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {emailStatus?.verified
                  ? `Active Sender: ${emailStatus.senderAddress || 'Verified'} | Provider: ${(emailStatus.provider || 'SMTP').toUpperCase()}${emailStatus.latencyMs ? ` (${emailStatus.latencyMs}ms)` : ''} | Receiving Inquiries at: ${emailStatus.recipient || 'secretariat@nmogujarat.org'}`
                  : emailStatus?.lastError
                  ? `Notice: ${emailStatus.lastError}`
                  : 'Nodemailer requires a Gmail Account & 16-character App Password, or Brevo / SendGrid / Custom SMTP Relay to dispatch emails.'}
              </p>
            </div>
          </div>

          {isSuperAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSetupModal(!showSetupModal)}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Key className="w-4 h-4 text-amber-300" />
                <span>{showSetupModal ? 'Close Config' : 'Configure SMTP'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Live Test Email Sender Strip */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="font-semibold text-slate-700 shrink-0">Live Email Test:</span>
            <input
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="Enter your email to test"
              className="flex-1 max-w-sm px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
            />
            <button
              type="button"
              onClick={handleSendTestEmail}
              disabled={isSendingTest}
              className="px-3.5 py-1.5 bg-red-700 hover:bg-red-800 text-white font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              <Send className={`w-3.5 h-3.5 ${isSendingTest ? 'animate-pulse' : ''}`} />
              <span>{isSendingTest ? 'Sending...' : 'Send Test Email'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAppPasswordGuide(!showAppPasswordGuide)}
            className="text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 cursor-pointer self-start sm:self-auto"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>How to get App Password?</span>
            {showAppPasswordGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Test Result Feedback Banner */}
        {testResult && (
          <div className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
            testResult.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}>
            {testResult.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="font-bold">{testResult.message}</span>
              {testResult.previewUrl && (
                <div className="mt-1">
                  <a
                    href={testResult.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline font-semibold flex items-center gap-1"
                  >
                    <span>View Ethereal test message preview</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Expandable Setup Guide */}
        {showAppPasswordGuide && (
          <div className="mt-4 p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-xs text-amber-950 space-y-3">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <Sparkles className="w-4 h-4 text-amber-700" />
              <span>3-Step Quick Guide: Generating a Google App Password for Nodemailer</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
              <li>
                Open your Google Account Security settings:
                <a
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-red-700 underline inline-flex items-center gap-1 ml-1"
                >
                  myaccount.google.com/security
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                Ensure <strong>2-Step Verification</strong> is enabled on your Google Account.
              </li>
              <li>
                Go to App Passwords directly at:
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-red-700 underline inline-flex items-center gap-1 ml-1"
                >
                  myaccount.google.com/apppasswords
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                Type <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">NMO Gujarat</code> as the app name and click <strong>Create</strong>.
              </li>
              <li>
                Google will generate a 16-character code (e.g. <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">wkya dxsf jugs ztee</code>). Copy and paste it into the configuration form below (spaces are automatically cleaned).
              </li>
            </ol>
          </div>
        )}

        {/* Super Admin Quick Config Box */}
        {showSetupModal && isSuperAdmin && (
          <form onSubmit={handleSaveCredentials} className="mt-5 pt-5 border-t border-slate-200 space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-red-700" />
                <span className="font-bold text-xs uppercase tracking-wider text-slate-800">
                  Mass Mailing & SMTP Relay Architecture
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePingTest}
                  disabled={isPinging}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold rounded-md text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Activity className={`w-3 h-3 text-red-600 ${isPinging ? 'animate-spin' : ''}`} />
                  <span>{isPinging ? 'Pinging Relay...' : 'Ping Relay (2s)'}</span>
                </button>
                <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
                  Anti-Timeout Mode Active
                </span>
              </div>
            </div>

            {/* Provider Selector Tabs */}
            <div>
              <label className="block text-slate-700 font-semibold text-xs mb-1.5">
                Select Outgoing Email Provider
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('gmail')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedProvider === 'gmail'
                      ? 'border-red-600 bg-red-50/70 text-red-950 font-bold shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">Gmail / Workspace</span>
                    <Zap className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal block leading-tight">
                    Standard personal/org mail (Port 587)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('brevo')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedProvider === 'brevo'
                      ? 'border-red-600 bg-red-50/70 text-red-950 font-bold shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">Brevo (Mass Mail)</span>
                    <span className="px-1.5 py-0.2 bg-emerald-600 text-white rounded text-[9px] font-bold">Recommended</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal block leading-tight">
                    Free 300/day, no daily throttle
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('sendgrid')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedProvider === 'sendgrid'
                      ? 'border-red-600 bg-red-50/70 text-red-950 font-bold shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">SendGrid</span>
                    <Server className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal block leading-tight">
                    API Key relay (Port 587)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPreset('smtp')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedProvider === 'smtp'
                      ? 'border-red-600 bg-red-50/70 text-red-950 font-bold shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">Custom SMTP Relay</span>
                    <Key className="w-3.5 h-3.5 text-slate-600" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal block leading-tight">
                    Amazon SES, Mailjet, or VPS
                  </span>
                </button>
              </div>
            </div>

            {/* Live Ping Banner */}
            {pingResult && (
              <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between animate-in fade-in duration-200 ${
                pingResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}>
                <div className="flex items-center gap-2">
                  {pingResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>
                    {pingResult.success
                      ? `Socket connected to ${selectedProvider === 'gmail' ? 'smtp.gmail.com' : smtpHost}:587 in ${pingResult.latencyMs}ms! Port is open and responsive.`
                      : `Ping failed: ${pingResult.error}`}
                  </span>
                </div>
                {pingResult.success && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full shrink-0">
                    {pingResult.latencyMs} ms
                  </span>
                )}
              </div>
            )}

            {/* Fields for Gmail */}
            {selectedProvider === 'gmail' && (
              <div className="space-y-3">
                <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl text-xs text-blue-900">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <Zap className="w-3.5 h-3.5 text-blue-700" />
                    <span>Gmail High-Speed Direct Submission</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-blue-800">
                    Connects directly via <code className="bg-blue-100 px-1 py-0.5 rounded font-mono font-bold">smtp.gmail.com:587</code> with STARTTLS and anti-timeout protections. For mass mailing to 500+ doctors, Brevo or SendGrid is recommended to avoid Google's daily personal quotas.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Google / Gmail Account Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={configEmail}
                      onChange={(e) => setConfigEmail(e.target.value)}
                      placeholder="devanshshah768@gmail.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      The Google account that generated the App Password.
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Google App Password (16 Letters) *
                    </label>
                    <input
                      type="password"
                      required
                      value={configAppPassword}
                      onChange={(e) => setConfigAppPassword(e.target.value)}
                      placeholder="xxxx xxxx xxxx xxxx"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      16-character Google App Password (grouped spaces are automatically removed).
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Fields for Brevo, SendGrid, or Custom SMTP */}
            {selectedProvider !== 'gmail' && (
              <div className="space-y-3">
                {selectedProvider === 'brevo' && (
                  <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-xs text-emerald-950">
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Brevo (Sendinblue) Mass Communication Setup</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-emerald-900">
                      Preconfigured for <code className="bg-emerald-100 px-1 py-0.5 rounded font-mono font-bold">smtp-relay.brevo.com:587</code>. Enter your Brevo account email as the username and your Master SMTP Key (from <a href="https://app.brevo.com/settings/keys/smtp" target="_blank" rel="noreferrer" className="underline font-bold">brevo.com/settings/keys/smtp</a>) as the password.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      SMTP Relay Host *
                    </label>
                    <input
                      type="text"
                      required
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder="smtp-relay.brevo.com or smtp.sendgrid.net"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      SMTP Port *
                    </label>
                    <input
                      type="number"
                      required
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(Number(e.target.value))}
                      placeholder="587"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      587 (STARTTLS recommended) or 465 (SSL).
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      SMTP Username / Account *
                    </label>
                    <input
                      type="text"
                      required
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder={selectedProvider === 'sendgrid' ? 'apikey' : 'your-brevo-login@email.com'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      SMTP Password / API Key *
                    </label>
                    <input
                      type="password"
                      required
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder="Master SMTP Key or API token"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Sender and Recipient Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sender Display Name
                </label>
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="National Medicos Organisation Gujarat"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Primary Contact Notification Recipient
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="secretariat@nmogujarat.org"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>

            {configFeedback && (
              <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                configFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : configFeedback.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}>
                {configFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : configFeedback.type === 'warning' ? (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{configFeedback.message}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSetupModal(false)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingConfig}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold rounded-lg text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSavingConfig ? 'Testing Relay Connection...' : 'Save & Verify Relay'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {sentReport && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <span className="font-bold block">Broadcast Dispatched Successfully</span>
            <span>Queued <strong>{sentReport.count} emails</strong> to <em>{sentReport.target}</em>. Audit log recorded.</span>
          </div>
        </div>
      )}

      {/* Broadcast Form */}
      <form onSubmit={handleSend} className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        {/* Recipient Audience Selection */}
        <div>
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
            Target Audience
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <button
              type="button"
              onClick={() => setTargetType('prant')}
              className={`p-3 rounded-lg border text-left font-semibold transition-all ${
                targetType === 'prant'
                  ? 'border-red-600 bg-red-50 text-red-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              Prant Chapter
            </button>
            <button
              type="button"
              onClick={() => setTargetType('event')}
              className={`p-3 rounded-lg border text-left font-semibold transition-all ${
                targetType === 'event'
                  ? 'border-red-600 bg-red-50 text-red-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              Event Delegates
            </button>
            {!isPrantAdmin && (
              <button
                type="button"
                onClick={() => setTargetType('all')}
                className={`p-3 rounded-lg border text-left font-semibold transition-all ${
                  targetType === 'all'
                    ? 'border-red-600 bg-red-50 text-red-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                All State Members
              </button>
            )}
            <button
              type="button"
              onClick={() => setTargetType('individual')}
              className={`p-3 rounded-lg border text-left font-semibold transition-all ${
                targetType === 'individual'
                  ? 'border-red-600 bg-red-50 text-red-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              Custom Emails
            </button>
          </div>
        </div>

        {/* Dynamic target selector */}
        {targetType === 'prant' && (
          <div className="text-xs">
            <label className="block text-slate-700 font-semibold mb-1">
              Select Prant Chapter
            </label>
            <select
              value={selectedPrant}
              disabled={isPrantAdmin && assignedPrant !== 'All'}
              onChange={(e) => setSelectedPrant(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="Gujarat">Gujarat Prant</option>
              <option value="Saurashtra">Saurashtra Prant</option>
            </select>
          </div>
        )}

        {targetType === 'event' && (
          <div className="text-xs">
            <label className="block text-slate-700 font-semibold mb-1">
              Select Event
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              {events.map((evt) => (
                <option key={evt.eventId} value={evt.eventId}>
                  {evt.title} ({evt.prant})
                </option>
              ))}
            </select>
          </div>
        )}

        {targetType === 'individual' && (
          <div className="text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-slate-700 font-semibold">
                Recipient Email Address(es) *
              </label>
              {recipientCount > 0 && (
                <span className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  {recipientCount} recipient{recipientCount !== 1 ? 's' : ''} detected
                </span>
              )}
            </div>
            <textarea
              rows={3}
              required
              value={individualEmail}
              onChange={(e) => setIndividualEmail(e.target.value)}
              placeholder="doctor1@example.com, doctor2@example.com, doctor3@example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
            />
            <p className="text-[11px] text-slate-500">
              Enter one or multiple email addresses separated by commas, semicolons, spaces, or lines. Nodemailer will dispatch to all recipients using BCC to maintain complete privacy.
            </p>
          </div>
        )}

        {/* Subject & Body */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Subject Line *
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Urgent: Call for Doctors - Dang Multi-Specialty Seva Health Camp"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Official Message Body *
            </label>
            <textarea
              rows={6}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Respected Doctor/Student Member,&#10;&#10;Greetings from NMO Gujarat. We are pleased to announce..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
            />
          </div>
        </div>

        {broadcastError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{broadcastError}</span>
          </div>
        )}

        {/* Dispatch Bar */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <div className="text-slate-500">
              Target Recipients: <strong className="text-slate-900">{recipientCount} verified address{recipientCount !== 1 ? 'es' : ''}</strong>
            </div>
            <div className="text-[11px] text-emerald-700 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Anti-Timeout Mass Delivery: Auto-batched into chunks of 30 via BCC with rate-limiting pauses.</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSending || recipientCount === 0}
            className="px-6 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>{isSending ? 'Sending to All Recipients...' : `Dispatch to ${recipientCount || 0} Recipient${recipientCount !== 1 ? 's' : ''}`}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
