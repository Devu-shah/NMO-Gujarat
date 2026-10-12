import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Shield, Calendar, ArrowRight, Play, Pause } from 'lucide-react';
import { NmoLogo } from './NmoLogo';

interface Slide {
  id: string;
  image: string;
  badge: string;
  title: string;
  subtitle: string;
  quote?: string;
  secondaryCtaText: string;
  secondaryCtaAction: string;
}

const DEFAULT_SLIDES: Slide[] = [
  {
    id: 'slide-1',
    image: '/assets/nmo/hero/slide-1-healthcare-camp.svg',
    badge: 'Serving Humanity · Gujarat & Saurashtra',
    title: 'Health for All, Service with Devotion',
    subtitle: 'Connecting medical students, resident doctors, and healthcare professionals in noble Seva across the nation.',
    quote: '॥ प्राणिनाम् आर्तिनाशनम् ॥ — Relief to the suffering of living beings',
    secondaryCtaText: 'Upcoming Medical Events',
    secondaryCtaAction: 'events'
  },
  {
    id: 'slide-2',
    image: '/assets/nmo/hero/slide-2-medical-conference.svg',
    badge: 'Academic Excellence & Mentorship',
    title: 'State CMEs & Continuous Medical Education',
    subtitle: 'Nurturing ethical, socially committed doctors through clinical workshops, disaster medicine training, and youth mentorship.',
    quote: 'Ethical Healthcare Practice · National Character · Social Responsibility',
    secondaryCtaText: 'Verify Doctor / Member ID',
    secondaryCtaAction: 'verify'
  },
  {
    id: 'slide-3',
    image: '/assets/nmo/backgrounds/hero-fallback.svg',
    badge: 'Seva Samarpan Initiatives',
    title: 'Reaching Underserved Tribal & Rural Communities',
    subtitle: 'Empowering remote villages with comprehensive multi-specialty camps, free diagnostic screening, and surgical care.',
    quote: 'From Ahwa, Dang to Gir Somnath — Dedicated to rural healthcare equity',
    secondaryCtaText: 'View Seva Initiatives',
    secondaryCtaAction: 'activities'
  }
];

interface HeroSliderProps {
  onNavigate: (tab: string) => void;
  onOpenVerify: () => void;
  onOpenAuth?: () => void;
}

export const HeroSlider: React.FC<HeroSliderProps> = ({
  onNavigate,
  onOpenVerify,
  onOpenAuth
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const slides = DEFAULT_SLIDES;

  useEffect(() => {
    if (isAutoPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
      }, 6000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAutoPlaying, slides.length]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  };

  const handleCta = (action: string) => {
    if (action === 'verify') {
      onOpenVerify();
    } else if (action === 'portal') {
      onOpenAuth?.();
    } else {
      onNavigate(action);
    }
  };

  const currentSlide = slides[currentIndex];

  return (
    <div
      className="relative w-full h-[620px] sm:h-[680px] lg:h-[720px] overflow-hidden bg-slate-950 text-white select-none"
      onMouseEnter={() => setIsAutoPlaying(false)}
      onMouseLeave={() => setIsAutoPlaying(true)}
    >
      {/* Background Slides */}
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
          }`}
        >
          {/* Background image with automatic fallback */}
          <img
            src={slide.image}
            alt={slide.title}
            className="w-full h-full object-cover object-center transform scale-105 transition-transform duration-10000"
            onError={(e) => {
              const target = e.currentTarget;
              target.onerror = null;
              target.src = '/assets/nmo/backgrounds/hero-fallback.svg';
            }}
          />

          {/* Deep Readability Overlay (Anti-Glare Scrim) */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-900/60" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-transparent" />
        </div>
      ))}

      {/* Ambient background glow effects */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-red-600/20 blur-3xl pointer-events-none animate-pulse-glow" />
      <div className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-blue-600/15 blur-3xl pointer-events-none animate-pulse-glow" />

      {/* Decorative Brand Emblem Watermark in the background */}
      <div className="absolute right-4 sm:right-16 top-1/2 -translate-y-1/2 z-10 opacity-15 pointer-events-none hidden md:block animate-float-slow">
        <NmoLogo size="custom" className="w-96 h-96" />
      </div>

      {/* Slide Content with Animated Transitions */}
      <div className="relative z-20 max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex flex-col justify-center">
        <div key={currentIndex} className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
          {/* Eyebrow badge / Kicker */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs sm:text-sm font-medium text-amber-300 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span>{currentSlide.badge}</span>
          </div>

          {/* Sanskrit Motto Callout */}
          {currentSlide.quote && (
            <p className="text-amber-200/90 font-serif italic text-sm sm:text-base tracking-wide border-l-2 border-amber-400 pl-3">
              {currentSlide.quote}
            </p>
          )}

          {/* Main Title */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight sm:leading-none drop-shadow-md">
            {currentSlide.title}
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-xl text-slate-300 font-normal leading-relaxed max-w-2xl">
            {currentSlide.subtitle}
          </p>

          {/* Action CTAs: Steady Red Member Portal Login + Dynamic Slide Button */}
          <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4">
            {/* Steady Red Member Portal Login Button (Never changes with photos) */}
            <button
              onClick={() => {
                if (onOpenAuth) {
                  onOpenAuth();
                } else {
                  handleCta('portal');
                }
              }}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 text-white font-bold text-sm sm:text-base shadow-xl shadow-red-950/50 hover:shadow-red-900/60 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 group cursor-pointer"
            >
              <span>Member Portal Login</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>

            {/* Dynamic Secondary Button: Changes with current slide / photo */}
            <button
              onClick={() => handleCta(currentSlide.secondaryCtaAction)}
              className="px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/30 backdrop-blur-md font-semibold text-sm sm:text-base hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <span>{currentSlide.secondaryCtaText}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Manual Controls & Indicator Navigation */}
      <div className="absolute bottom-6 left-0 right-0 z-30 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Slide Dots */}
        <div className="flex items-center gap-2">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-8 bg-amber-400' : 'w-2 bg-white/40 hover:bg-white/60'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        {/* Prev / Next & Pause Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-xs transition-colors"
            title={isAutoPlaying ? 'Pause rotation' : 'Resume rotation'}
          >
            {isAutoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={handlePrev}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-xs transition-colors"
            aria-label="Previous Slide"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={handleNext}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-xs transition-colors"
            aria-label="Next Slide"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
