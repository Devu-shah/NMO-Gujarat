import React, { useState } from 'react';
import { useNMO } from '../../context/NMOContext';
import { NMOAnnouncement, PrantType } from '../../types/nmo';
import { Bell, Plus, Trash2, Eye, EyeOff, X, Save } from 'lucide-react';

export const AdminAnnouncementsManager: React.FC = () => {
  const { announcements, addAnnouncement, toggleAnnouncement, deleteAnnouncement, currentUser } = useNMO();

  const isPrantAdmin = currentUser?.role === 'prant_admin';
  const assignedPrant = currentUser?.prant;

  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState<'All' | 'Members' | 'Admins'>('All');
  const [prant, setPrant] = useState<PrantType>(
    isPrantAdmin && assignedPrant !== 'All' ? (assignedPrant as PrantType) : 'All'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    await addAnnouncement({
      title: title.trim(),
      message: message.trim(),
      targetAudience,
      prant,
      active: true
    });

    setTitle('');
    setMessage('');
    setIsCreating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900">
            Announcements & Member Alerts
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Broadcast urgent notices, circulars, and reminders on the homepage and member dashboards.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs self-start"
        >
          <Plus className="w-4 h-4" />
          <span>New Notice</span>
        </button>
      </div>

      <div className="space-y-4">
        {announcements.map((ann) => (
          <div
            key={ann.id}
            className={`bg-white p-5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              ann.active ? 'border-slate-200 shadow-xs' : 'border-slate-200 bg-slate-50 opacity-60'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                  {ann.targetAudience}
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  Prant: <strong>{ann.prant}</strong>
                </span>
                <span className="text-[10px] text-slate-400">· {ann.createdAt?.split('T')[0]}</span>
              </div>
              <h4 className="text-base font-bold text-slate-900">{ann.title}</h4>
              <p className="text-xs text-slate-600 max-w-2xl">{ann.message}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => toggleAnnouncement(ann.id, !ann.active)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold flex items-center gap-1 hover:bg-slate-50 text-slate-700"
              >
                {ann.active ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                    <span>Deactivate</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Activate</span>
                  </>
                )}
              </button>

              <button
                onClick={() => deleteAnnouncement(ann.id)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete Notice"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">
                Post New Official Announcement
              </h3>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Notice Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Dang Health Camp Volunteer Orientation"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Message Content *</label>
                <textarea
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Official notification text..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Target Audience</label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="All">All Visitors & Members</option>
                    <option value="Members">Verified Members Only</option>
                    <option value="Admins">Admins Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Target Prant</label>
                  <select
                    value={prant}
                    disabled={isPrantAdmin && assignedPrant !== 'All'}
                    onChange={(e) => setPrant(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="All">All Gujarat (Both Prants)</option>
                    <option value="Gujarat">Gujarat Prant</option>
                    <option value="Saurashtra">Saurashtra Prant</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Publish Announcement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
