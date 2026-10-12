import React, { useState } from 'react';
import { useNMO } from '../context/NMOContext';
import { Bell, AlertTriangle, ArrowRight, X, Sparkles } from 'lucide-react';
import { NMOAnnouncement } from '../types/nmo';

export const AnnouncementsTicker: React.FC = () => {
  const { announcements } = useNMO();
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<NMOAnnouncement | null>(null);

  const activeAnnouncements = announcements.filter((a) => a.active);

  if (activeAnnouncements.length === 0) return null;

  return (
    <>
      <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-3 text-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-amber-200 text-amber-900">
              <Bell className="w-4 h-4 animate-bounce" />
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                Announcement
              </span>
              <p className="text-sm font-medium text-slate-900 truncate">
                {activeAnnouncements[0].title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
            <button
              onClick={() => setSelectedAnnouncement(activeAnnouncements[0])}
              className="text-xs font-bold text-amber-900 hover:text-amber-950 underline underline-offset-2 flex items-center gap-1"
            >
              <span>Read Notice</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {activeAnnouncements.length > 1 && (
              <span className="text-xs text-amber-800/80">
                +{activeAnnouncements.length - 1} more notices
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Announcement Detail Modal */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative">
            <button
              onClick={() => setSelectedAnnouncement(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs font-bold text-amber-800 mb-2 uppercase tracking-wider">
              <Bell className="w-4 h-4" />
              <span>Official Circular · NMO Gujarat</span>
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-3">
              {selectedAnnouncement.title}
            </h3>

            <div className="text-sm text-slate-600 leading-relaxed space-y-3 mb-6">
              <p>{selectedAnnouncement.message}</p>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Prant: <strong className="text-slate-700">{selectedAnnouncement.prant}</strong></span>
              <span>Target: <strong className="text-slate-700">{selectedAnnouncement.targetAudience}</strong></span>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-lg transition-colors"
              >
                Close Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
