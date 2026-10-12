import React, { useState } from 'react';
import { useNMO } from '../../context/NMOContext';
import { Mail, Send, CheckCircle2, Users, Calendar, AlertCircle } from 'lucide-react';

export const AdminEmailCenter: React.FC = () => {
  const { members, events, eventRegistrations, currentUser, logAudit } = useNMO();

  const isPrantAdmin = currentUser?.role === 'prant_admin';
  const assignedPrant = currentUser?.prant;

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

  // Compute recipient count
  const recipientCount = React.useMemo(() => {
    if (targetType === 'all') {
      return isPrantAdmin ? members.filter((m) => m.prant === assignedPrant).length : members.length;
    }
    if (targetType === 'prant') {
      return members.filter((m) => m.prant === selectedPrant).length;
    }
    if (targetType === 'event') {
      return eventRegistrations.filter((r) => r.eventId === selectedEventId).length;
    }
    if (targetType === 'individual') {
      return individualEmail.trim() ? 1 : 0;
    }
    return 0;
  }, [targetType, selectedPrant, selectedEventId, individualEmail, members, eventRegistrations, isPrantAdmin, assignedPrant]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      alert('Please fill out both subject and message body.');
      return;
    }

    setIsSending(true);

    // Simulate secure dispatch through server-side proxy
    setTimeout(async () => {
      let targetDesc = '';
      if (targetType === 'all') targetDesc = 'All Verified Members';
      else if (targetType === 'prant') targetDesc = `${selectedPrant} Prant Members`;
      else if (targetType === 'event') targetDesc = `Participants of ${events.find((e) => e.eventId === selectedEventId)?.title || selectedEventId}`;
      else targetDesc = `Individual: ${individualEmail}`;

      await logAudit(
        'EMAIL_DISPATCH',
        'COMMUNICATION',
        `EMAIL-${Date.now()}`,
        `Dispatched broadcast email "${subject}" to ${recipientCount} recipients (${targetDesc})`
      );

      setSentReport({ count: recipientCount, target: targetDesc });
      setIsSending(false);
      setSubject('');
      setMessage('');
    }, 1200);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h3 className="text-xl font-black text-slate-900">
          Official Email & Circular Communication Desk
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Send encrypted announcements and updates to members, specific Prant chapters, or registered event delegates.
        </p>
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
              Individual Member
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
          <div className="text-xs">
            <label className="block text-slate-700 font-semibold mb-1">
              Recipient Email Address
            </label>
            <input
              type="email"
              required
              value={individualEmail}
              onChange={(e) => setIndividualEmail(e.target.value)}
              placeholder="doctor@nmogujarat.org"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
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

        {/* Dispatch Bar */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-slate-500">
            Estimated Recipients: <strong className="text-slate-900">{recipientCount} verified addresses</strong>
          </div>

          <button
            type="submit"
            disabled={isSending || recipientCount === 0}
            className="px-6 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-colors"
          >
            <Send className="w-4 h-4" />
            <span>{isSending ? 'Sending Broadcast...' : 'Dispatch Broadcast Email'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
