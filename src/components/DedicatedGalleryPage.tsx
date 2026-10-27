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
  ArrowLeft,
  Search,
  Filter,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import {
  GalleryEvent,
  GalleryPhoto,
  fetchGalleryEvents,
  DEFAULT_GALLERY_EVENTS
} from '../lib/galleryService';
import { NmoLogo } from './NmoLogo';

interface DedicatedGalleryPageProps {
  onBackToHome: () => void;
}

export const DedicatedGalleryPage: React.FC<DedicatedGalleryPageProps> = ({ onBackToHome }) => {
  const [events, setEvents] = useState<GalleryEvent[]>(DEFAULT_GALLERY_EVENTS);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<GalleryEvent | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
        console.warn('Error fetching gallery events:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredEvents = events.filter((evt) => {
    const matchesCategory = activeCategory === 'All' || evt.category === activeCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      evt.eventName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (evt.location && evt.location.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Navigation Bar Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <NmoLogo className="w-10 h-10 shrink-0" />
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                NMO Gujarat Photographic Archive
              </h1>
              <p className="text-xs text-slate-500">
                Official State Photographic Archive & Seva Chronicle
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Main Portal</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {['All', 'Camps', 'CMEs', 'Yatra', 'Students'].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategory === cat
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat === 'All' ? 'All Albums' : cat}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search event albums or locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        {/* Total Albums Count Header */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <div className="flex items-center gap-2 font-semibold">
            <Images className="w-4 h-4 text-red-700" />
            <span>
              Showing {filteredEvents.length} event album{filteredEvents.length === 1 ? '' : 's'}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Official Curated Archive • Read-Only
          </span>
        </div>

        {/* Events Grid */}
        {filteredEvents.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 p-8">
            <Images className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">No Matching Gallery Albums Found</h3>
            <p className="text-xs text-slate-500 mt-1">Try clearing your search query or selecting a different category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((evt) => {
              const coverUrl = evt.coverPhoto?.proxyUrl || '/assets/nmo/hero/slide-1-healthcare-camp.svg';

              return (
                <div
                  key={evt.id}
                  onClick={() => {
                    setSelectedEvent(evt);
                    setCurrentPhotoIndex(0);
                  }}
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

                    {evt.isFeatured && (
                      <div className="absolute top-3 left-3 px-2 py-0.5 bg-red-700/90 backdrop-blur-md rounded-md text-white text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        <span>Featured</span>
                      </div>
                    )}
                  </div>

                  {/* Overlay with info */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/40 to-transparent p-5 flex flex-col justify-end text-white">
                    <div className="flex items-center justify-between text-xs text-amber-300 font-semibold mb-1">
                      <span>{evt.category || 'Event Album'}</span>
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
        )}
      </div>

      {/* Lightbox Modal with Left & Right Navigation Arrows */}
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
    </div>
  );
};
