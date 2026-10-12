import React, { useState } from 'react';
import { Camera, X, ZoomIn, MapPin, Calendar } from 'lucide-react';

interface GalleryItem {
  id: string;
  title: string;
  category: 'Camps' | 'CMEs' | 'Yatra' | 'Students';
  location: string;
  date: string;
  image: string;
  caption: string;
}

const GALLERY_DATA: GalleryItem[] = [
  {
    id: 'gal-1',
    title: 'Free Rural & Tribal Health Camps',
    category: 'Camps',
    location: 'Gujarat & Saurashtra Prants',
    date: 'Ongoing Program',
    image: '/assets/nmo/hero/slide-1-healthcare-camp.svg',
    caption: 'Specialist physicians, surgeons, pediatricians, and dentists providing free consultations and medicine distribution in underserved areas.'
  },
  {
    id: 'gal-2',
    title: 'Continuing Medical Education (CME)',
    category: 'CMEs',
    location: 'State Teaching Hospitals',
    date: 'Academic Sessions',
    image: '/assets/nmo/hero/slide-2-medical-conference.svg',
    caption: 'Clinical symposiums, emergency resuscitation, and disaster preparedness workshops for resident doctors and postgraduates.'
  },
  {
    id: 'gal-3',
    title: 'Seva Yatra & Mobile Healthcare Vans',
    category: 'Yatra',
    location: 'Remote & Coastal Hamlets',
    date: 'Outreach Initiatives',
    image: '/assets/nmo/backgrounds/hero-fallback.svg',
    caption: 'Mobile clinic teams reaching forest villages, pastoral hamlets, and coastal settlements with on-site diagnostic screening.'
  },
  {
    id: 'gal-4',
    title: 'Undergraduate Medicos Mentorship',
    category: 'Students',
    location: 'Medical College Chapters',
    date: 'Year-Round Guidance',
    image: '/assets/nmo/hero/slide-2-medical-conference.svg',
    caption: 'Orientation programs and mentorship circles on medical ethics, national dedication, and clinical excellence.'
  },
  {
    id: 'gal-5',
    title: 'Voluntary Blood Donation Networks',
    category: 'Camps',
    location: 'Across Gujarat State',
    date: '24/7 Registry',
    image: '/assets/nmo/hero/slide-1-healthcare-camp.svg',
    caption: 'Student and doctor led voluntary blood donation drives and emergency negative blood group donor registries.'
  },
  {
    id: 'gal-6',
    title: 'Preventive Health Awareness Drives',
    category: 'Students',
    location: 'Community Centers',
    date: 'Public Health Wing',
    image: '/assets/nmo/backgrounds/hero-fallback.svg',
    caption: 'Educating school students and rural families on hygiene, nutritional anemia prevention, and early chronic disease detection.'
  }
];

export const GallerySection: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryItem | null>(null);

  const filtered = activeCategory === 'All'
    ? GALLERY_DATA
    : GALLERY_DATA.filter((i) => i.category === activeCategory);

  return (
    <section id="gallery" className="py-20 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-red-700">
              Photographic Chronicle
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mt-1">
              Moments of Healthcare & Seva
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-xl">
              Glimpses of multi-specialty health camps, academic symposiums, disaster response, and youth mentorship across Gujarat.
            </p>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto self-start">
            {['All', 'Camps', 'CMEs', 'Yatra', 'Students'].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat === 'All' ? 'All Photos' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Gallery Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedPhoto(item)}
              className="group relative bg-slate-900 rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 border border-slate-200"
            >
              <div className="aspect-4/3 w-full overflow-hidden bg-slate-950">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-90 group-hover:opacity-100"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/assets/nmo/backgrounds/hero-fallback.svg';
                  }}
                />
              </div>

              {/* Overlay with info */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent p-5 flex flex-col justify-end text-white">
                <div className="flex items-center justify-between text-xs text-amber-300 font-semibold mb-1">
                  <span>{item.category}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn className="w-4 h-4" />
                    <span>View</span>
                  </div>
                </div>
                <h3 className="font-bold text-base text-white leading-snug group-hover:text-amber-200 transition-colors">
                  {item.title}
                </h3>
                <div className="flex items-center gap-3 text-[11px] text-slate-300 mt-2">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-red-400" />
                    {item.location}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-blue-300" />
                    {item.date}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Upload notice note for user */}
        <div className="mt-10 p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <Camera className="w-4 h-4 text-slate-400" />
          <span>Photographs dropped into <code>/public/assets/nmo/gallery/</code> or <code>/hero/</code> will automatically appear in this gallery and homepage slider.</span>
        </div>
      </div>

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="aspect-16/9 w-full bg-black flex items-center justify-center">
              <img
                src={selectedPhoto.image}
                alt={selectedPhoto.title}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="p-6 bg-slate-900 text-white space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <span className="px-2 py-0.5 rounded bg-amber-400/20">{selectedPhoto.category}</span>
                <span>{selectedPhoto.date}</span>
                <span>·</span>
                <span>{selectedPhoto.location}</span>
              </div>
              <h3 className="text-xl font-bold text-white">
                {selectedPhoto.title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                {selectedPhoto.caption}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
