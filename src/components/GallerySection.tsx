import React, { useState, useEffect } from 'react';
import {
  Camera,
  X,
  ZoomIn,
  MapPin,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Images,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import {
  GalleryEvent,
  GalleryPhoto,
  fetchGalleryEvents,
  fetchGalleryEventPhotos,
  DEFAULT_GALLERY_EVENTS
} from '../lib/galleryService';

interface GallerySectionProps {
  onOpenFullGallery?: () => void;
}

export const GallerySection: React.FC<GallerySectionProps> = ({ onOpenFullGallery }) => {
  const [events, setEvents] = useState<GalleryEvent[]>(DEFAULT_GALLERY_EVENTS);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedEvent, setSelectedEvent] = useState<GalleryEvent | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load events dynamically from backend (which queries Google Drive root/gallery/{event name})
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      try {
        const data = await fetchGalleryEvents();
        if (isMounted && data && data.length > 0) {
          setEvents(data);
        }
      } catch (err) {
        console.warn('Error fetching dynamic gallery events:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter categories
  const filteredEvents = events.filter((evt) => {
    if (activeCategory === 'All') return true;
    return evt.category === activeCategory;
  });

  // Home Page rule: Display the 6 featured / most recent events
  const homepageEvents = filteredEvents.slice(0, 6);
  const hasMoreEvents = events.length > 6;

  // Modal navigation handlers
  const activePhotos = selectedEvent?.photos || [];
  const activePhoto: GalleryPhoto | null = activePhotos[currentPhotoIndex] || selectedEvent?.coverPhoto || null;

  const handlePrevPhoto = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (activePhotos.length === 0) return;
    setCurrentPhotoIndex((prev) => (prev > 0 ? prev - 1 : activePhotos.length - 1));
  };

  const handleNextPhoto = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (activePhotos.length === 0) return;
    setCurrentPhotoIndex((prev) => (prev < activePhotos.length - 1 ? prev + 1 : 0));
  };

  // Keyboard navigation for photo viewer
  useEffect(() => {
    if (!selectedEvent) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevPhoto();
      } else if (e.key === 'ArrowRight') {
        handleNextPhoto();
      } else if (e.key === 'Escape') {
        setSelectedEvent(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvent, activePhotos.length]);

  const openEventModal = async (event: GalleryEvent) => {
    setSelectedEvent(event);
    setCurrentPhotoIndex(0);

    // Dynamically load all photos from the Google Drive event folder without naming restrictions
    try {
      const photos = await fetchGalleryEventPhotos(event.id);
      if (photos && photos.length > 0) {
        setSelectedEvent((prev) =>
          prev && prev.id === event.id
            ? {
                ...prev,
                photos,
                photoCount: photos.length,
                coverPhoto: photos[0] || prev.coverPhoto
              }
            : prev
        );
      }
    } catch (err) {
      console.debug('Dynamic event photos load notice:', err);
    }
  };

  return (
    <section id="gallery" className="py-20 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold uppercase tracking-wider mb-2">
              <Camera className="w-3.5 h-3.5" />
              <span>Official Photographic Chronicle</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mt-1">
              Moments of Healthcare & Seva
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-xl">
              Glimpses of multi-specialty health camps, academic symposiums, tribal outreach, and youth mentorship across Gujarat.
            </p>
          </div>

          {/* Category Tabs & View All Button */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-end">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {['All', 'Camps', 'CMEs', 'Yatra', 'Students'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    activeCategory === cat
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat === 'All' ? 'All Events' : cat}
                </button>
              ))}
            </div>

            {onOpenFullGallery && (
              <button
                type="button"
                onClick={onOpenFullGallery}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                <Images className="w-3.5 h-3.5 text-amber-300" />
                <span>Full Archive</span>
                {events.length > 6 && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-red-700 text-white rounded-full">
                    {events.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Gallery Grid (Up to 6 Recent / Super Admin Selected Events on Homepage) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {homepageEvents.map((evt) => {
            const coverUrl = evt.coverPhoto?.proxyUrl || '/assets/nmo/hero/slide-1-healthcare-camp.svg';

            return (
              <div
                key={evt.id}
                onClick={() => openEventModal(evt)}
                className="group relative bg-slate-950 rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 border border-slate-200"
              >
                <div className="aspect-4/3 w-full overflow-hidden bg-slate-950 relative">
                  <img
                    src={coverUrl}
                    alt={evt.eventName}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-90 group-hover:opacity-100"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/assets/nmo/backgrounds/hero-fallback.svg';
                    }}
                  />

                  {/* Photo count badge */}
                  <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-full text-white text-[11px] font-bold flex items-center gap-1 shadow-md">
                    <Images className="w-3 h-3 text-amber-300" />
                    <span>{evt.photoCount || (evt.photos?.length || 1)} Photos</span>
                  </div>
                </div>

                {/* Overlay with info */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/40 to-transparent p-5 flex flex-col justify-end text-white">
                  <div className="flex items-center justify-between text-xs text-amber-300 font-semibold mb-1">
                    <span>{evt.category || 'Seva Mission'}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ZoomIn className="w-4 h-4 text-amber-400" />
                      <span>View Album</span>
                    </div>
                  </div>
                  <h3 className="font-bold text-base text-white leading-snug group-hover:text-amber-200 transition-colors line-clamp-2">
                    {evt.eventName}
                  </h3>
                  <div className="flex items-center gap-3 text-[11px] text-slate-300 mt-2">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-red-400" />
                      {evt.location || 'Gujarat'}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-blue-300" />
                      {evt.date || (evt.createdTime ? new Date(evt.createdTime).toLocaleDateString() : 'Active')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* View Complete Archive Banner if events exceed 6 */}
        {hasMoreEvents && onOpenFullGallery && (
          <div className="mt-10 p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-red-950 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div>
              <h4 className="text-base font-bold flex items-center gap-2 text-amber-300">
                <Images className="w-5 h-5" />
                <span>Older Seva & Event Albums ({events.length - 6} more albums)</span>
              </h4>
              <p className="text-xs text-slate-300 mt-1">
                Explore our full archival gallery from previous medical conferences, health camps, and Seva Yatras across Gujarat.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenFullGallery}
              className="px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold transition-colors shadow-md flex items-center gap-2 cursor-pointer shrink-0"
            >
              <span>Open Dedicated Gallery Archive</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Read-Only Access Note conforming to strict permissions specification */}
        <div className="mt-8 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <Camera className="w-4 h-4 text-slate-400 shrink-0" />
          <span>
            Photographs are curated and synced from official NMO photographic archives. Modification or photo uploads are restricted to authorized administrators.
          </span>
        </div>
      </div>

      {/* Lightbox Modal with Dynamic Left & Right Scroll Arrows */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/95 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="relative max-w-5xl w-full bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                  {selectedEvent.category || 'NMO Event Album'}
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-white truncate max-w-xl">
                  {selectedEvent.eventName}
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-white/10 text-slate-300 text-xs font-mono font-semibold">
                  {activePhotos.length > 0
                    ? `Photo ${currentPhotoIndex + 1} of ${activePhotos.length}`
                    : 'Cover Photo'}
                </span>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Main Stage with Left and Right Navigation Arrows */}
            <div className="relative flex-1 bg-black min-h-[350px] sm:min-h-[500px] flex items-center justify-center overflow-hidden select-none">
              {activePhoto ? (
                <img
                  src={activePhoto.proxyUrl}
                  alt={activePhoto.name}
                  className="max-h-[65vh] max-w-full object-contain mx-auto transition-all duration-300"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/assets/nmo/backgrounds/hero-fallback.svg';
                  }}
                />
              ) : (
                <div className="text-slate-500 text-xs text-center p-8">
                  <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No photos available in this folder yet.</p>
                </div>
              )}

              {/* Left Arrow Button */}
              {activePhotos.length > 1 && (
                <button
                  type="button"
                  onClick={handlePrevPhoto}
                  className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 p-3 sm:p-3.5 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 transition-all shadow-xl hover:scale-110 cursor-pointer z-10"
                  title="Previous Photo (Left Arrow)"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* Right Arrow Button */}
              {activePhotos.length > 1 && (
                <button
                  type="button"
                  onClick={handleNextPhoto}
                  className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 p-3 sm:p-3.5 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 transition-all shadow-xl hover:scale-110 cursor-pointer z-10"
                  title="Next Photo (Right Arrow)"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* Thumbnail Navigation Strip */}
            {activePhotos.length > 1 && (
              <div className="p-3 bg-slate-950/80 border-t border-slate-800 overflow-x-auto flex items-center gap-2">
                {activePhotos.map((photo, idx) => (
                  <button
                    key={photo.id || idx}
                    type="button"
                    onClick={() => setCurrentPhotoIndex(idx)}
                    className={`h-14 w-20 shrink-0 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      currentPhotoIndex === idx
                        ? 'border-red-600 scale-105 shadow-md shadow-red-700/50'
                        : 'border-slate-700 opacity-60 hover:opacity-100 hover:border-slate-500'
                    }`}
                  >
                    <img
                      src={photo.proxyUrl}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = '/assets/nmo/backgrounds/hero-fallback.svg';
                      }}
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Modal Footer Description */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200 truncate max-w-sm">
                  {activePhoto?.name || selectedEvent.eventName}
                </span>
                {activePhoto?.createdTime && (
                  <span>· {new Date(activePhoto.createdTime).toLocaleDateString()}</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                Use Left / Right arrow keys or buttons to navigate photos
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
