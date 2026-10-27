import React, { useState, useEffect } from 'react';
import { useNMO } from '../../context/NMOContext';
import {
  fetchGalleryEvents,
  saveFeaturedGalleryEvents,
  getGalleryConfig,
  GalleryEvent
} from '../../lib/galleryService';
import {
  Images,
  Check,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ExternalLink,
  Info,
  Calendar,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

export const AdminGalleryShowcaseManager: React.FC = () => {
  const { currentUser } = useNMO();
  const [events, setEvents] = useState<GalleryEvent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isSuperAdmin = currentUser?.role === 'super_admin';

  const loadData = async (forceRefresh = false) => {
    setIsLoading(true);
    setSaveStatus(null);
    try {
      if (forceRefresh) {
        // Trigger cache refresh on backend
        await fetch('/api/gallery/events?refresh=true').catch(() => {});
      }
      const allEvents = await fetchGalleryEvents();
      setEvents(allEvents);

      // Load config
      const config = await getGalleryConfig();
      if (config?.featuredEventFolderIds && config.featuredEventFolderIds.length > 0) {
        // Filter to IDs that actually exist or preserve valid ones
        setSelectedIds(config.featuredEventFolderIds.slice(0, 6));
      } else {
        // Default to first 6
        setSelectedIds(allEvents.slice(0, 6).map((e) => e.id));
      }
    } catch (err: any) {
      console.error('Error loading gallery events for admin showcase:', err);
      setSaveStatus({
        type: 'error',
        message: 'Failed to retrieve event albums from Google Drive: ' + (err.message || 'Unknown error')
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleEventSelection = (eventId: string) => {
    if (!isSuperAdmin) return;

    if (selectedIds.includes(eventId)) {
      // Deselect
      setSelectedIds(selectedIds.filter((id) => id !== eventId));
    } else {
      // Select if under 6
      if (selectedIds.length >= 6) {
        alert('You can select a maximum of 6 featured events for the homepage showcase. Please uncheck one event before selecting another.');
        return;
      }
      setSelectedIds([...selectedIds, eventId]);
    }
  };

  const handleSelectFirstSix = () => {
    if (!isSuperAdmin) return;
    const firstSix = events.slice(0, 6).map((e) => e.id);
    setSelectedIds(firstSix);
  };

  const handleSave = async () => {
    if (!isSuperAdmin) {
      setSaveStatus({
        type: 'error',
        message: 'Unauthorized: Only Super Administrators can configure homepage gallery showcase.'
      });
      return;
    }

    if (selectedIds.length === 0) {
      alert('Please select at least 1 event album to showcase on the homepage.');
      return;
    }

    setIsSaving(true);
    setSaveStatus(null);

    try {
      const success = await saveFeaturedGalleryEvents(selectedIds, currentUser?.email || 'super_admin');
      if (success) {
        setSaveStatus({
          type: 'success',
          message: `Homepage gallery showcase updated successfully! ${selectedIds.length} albums are now set as featured.`
        });
        setTimeout(() => setSaveStatus(null), 4000);
      } else {
        setSaveStatus({
          type: 'error',
          message: 'Failed to save featured gallery events. Please check database permissions.'
        });
      }
    } catch (err: any) {
      setSaveStatus({
        type: 'error',
        message: 'Save failed: ' + (err.message || 'Unknown error')
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold uppercase tracking-wider mb-2">
              <Images className="w-3.5 h-3.5" />
              <span>Super Admin Console</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Homepage Gallery Showcase Selector
            </h2>
            <p className="text-slate-600 text-xs sm:text-sm mt-1 max-w-2xl">
              Dynamically scanned from Google Drive folder <code>root/gallery/&#123;event name&#125;</code>.
              Choose up to <strong>6 featured event albums</strong> to display on the public homepage. Older or additional albums are accessible via the Dedicated Gallery Archive page.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              title="Rescan Google Drive root/gallery/ folder"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync Drive</span>
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Showcase ({selectedIds.length}/6)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Security & Ingestion Policy Banner */}
        <div className="mt-5 p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
          <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold">Strict Read-Only Drive Ingestion & Loop Isolation:</span>
            <p className="text-amber-800 leading-relaxed">
              In accordance with strict security policies, public visitors and general members are prohibited from uploading or altering gallery photos. Photos are ingested strictly from authorized Google Drive storage under the designated administrator account loop.
            </p>
          </div>
        </div>

        {/* Status Message */}
        {saveStatus && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              saveStatus.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {saveStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{saveStatus.message}</span>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-700">
            Selected for Homepage:
          </span>
          <span
            className={`px-2.5 py-1 rounded-full font-mono font-bold text-xs ${
              selectedIds.length === 6
                ? 'bg-emerald-100 text-emerald-800'
                : selectedIds.length > 0
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {selectedIds.length} of 6 selected
          </span>
          <span className="text-slate-500 hidden sm:inline">
            ({events.length} total event albums in Drive)
          </span>
        </div>

        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectFirstSix}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
            >
              Select First 6
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold cursor-pointer"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse space-y-3">
              <div className="aspect-video bg-slate-200 rounded-lg" />
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Images className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Gallery Folders Found in Drive</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Ensure subfolders are created inside <code>root/gallery/&#123;event name&#125;</code> in your Google Drive and contain JPEG or PNG images.
          </p>
          <button
            type="button"
            onClick={() => loadData(true)}
            className="mt-4 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            Rescan Now
          </button>
        </div>
      ) : (
        /* Event Albums Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {events.map((evt, idx) => {
            const isSelected = selectedIds.includes(evt.id);
            const selectionOrder = selectedIds.indexOf(evt.id) + 1;
            const coverUrl = evt.coverPhoto?.proxyUrl || '/assets/nmo/hero/slide-1-healthcare-camp.svg';

            return (
              <div
                key={evt.id}
                onClick={() => toggleEventSelection(evt.id)}
                className={`group relative bg-white rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-red-600 ring-2 ring-red-500/20 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm opacity-85 hover:opacity-100'
                }`}
              >
                {/* Image Cover */}
                <div className="relative aspect-16/10 bg-slate-950 overflow-hidden">
                  <img
                    src={coverUrl}
                    alt={evt.eventName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/assets/nmo/backgrounds/hero-fallback.svg';
                    }}
                  />

                  {/* Dark gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30" />

                  {/* Selection Checkbox Pill */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {isSelected ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 bg-red-700 text-white rounded-full text-xs font-black shadow-md">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>#{selectionOrder}</span>
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-slate-900/70 border border-white/50 text-white flex items-center justify-center text-xs group-hover:bg-white group-hover:text-slate-900 transition-colors">
                        +
                      </span>
                    )}
                  </div>

                  {/* Category Pill */}
                  <div className="absolute top-3 left-3">
                    <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] font-bold text-amber-300">
                      {evt.category || 'Event'}
                    </span>
                  </div>

                  {/* Photo count */}
                  <div className="absolute bottom-2.5 left-3 text-white text-xs font-semibold flex items-center gap-1.5">
                    <Images className="w-3.5 h-3.5 text-amber-400" />
                    <span>{evt.photoCount || (evt.photos ? evt.photos.length : 0)} photos</span>
                  </div>
                </div>

                {/* Event Details */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug">
                      {evt.eventName}
                    </h4>
                    {evt.location && (
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                        📍 {evt.location}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono truncate max-w-[140px]" title={evt.id}>
                      ID: {evt.id.substring(0, 12)}...
                    </span>
                    <span className="font-semibold text-slate-700">
                      {isSelected ? (
                        <span className="text-red-700 font-bold">Featured on Home</span>
                      ) : (
                        <span>Archival only</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Save Bar (Sticky on mobile/desktop if changes made) */}
      {isSuperAdmin && events.length > 0 && (
        <div className="sticky bottom-4 z-20 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-white">
                Super Admin Showcase Configuration
              </div>
              <div className="text-[11px] text-slate-300">
                {selectedIds.length} of 6 slots assigned for the homepage showcase.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Publish to Homepage</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
