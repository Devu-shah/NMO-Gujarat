import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Building2,
  Activity,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

/**
 * Animated counter hook using requestAnimationFrame and easeOutExpo
 */
function useCountUp(target: number, duration: number = 2000, trigger: boolean = false): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!trigger) return;
    let startTime: number | null = null;
    let frameId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo for natural deceleration
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.round(ease * target));

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [target, duration, trigger]);

  return count;
}

export const DynamicStats: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [hasScrolledIntoView, setHasScrolledIntoView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasScrolledIntoView(true);
          observer.disconnect(); // Trigger once on scroll
        }
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Animated counting up values
  const memberCount = useCountUp(2400, 2000, hasScrolledIntoView);
  const collegeCount = useCountUp(250, 1800, hasScrolledIntoView);

  const statCards = [
    {
      id: 'members',
      label: 'Verified Doctors & Medicos',
      count: memberCount,
      displaySuffix: '+',
      metricNote: 'Statewide Clinicians, Residents & Interns',
      badge: 'Statewide Registry',
      badgeColor: 'bg-red-50 text-red-800 border-red-200',
      icon: Users,
      gradient: 'from-red-600 to-rose-700',
      accentColor: 'text-red-600',
      bgGlow: 'bg-red-500/10',
      borderHover: 'hover:border-red-300',
      topBar: 'bg-gradient-to-r from-red-600 to-rose-500',
      delay: 'delay-0'
    },
    {
      id: 'colleges',
      label: 'Medical Colleges & Campuses',
      count: collegeCount,
      displaySuffix: '+',
      metricNote: 'Govt & Private Medical Institutions',
      badge: 'Statewide Network',
      badgeColor: 'bg-blue-50 text-blue-800 border-blue-200',
      icon: Building2,
      gradient: 'from-blue-600 to-indigo-700',
      accentColor: 'text-blue-600',
      bgGlow: 'bg-blue-500/10',
      borderHover: 'hover:border-blue-300',
      topBar: 'bg-gradient-to-r from-blue-600 to-indigo-500',
      delay: 'delay-150'
    }
  ];

  return (
    <section
      ref={sectionRef}
      className="relative -mt-14 z-30 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8"
    >
      {/* Top Floating Glass Header Ribbon */}
      <div className="mb-4 px-5 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white border border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-500">
        <div className="flex items-center gap-2.5">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="font-bold tracking-tight text-slate-100 text-[11px] sm:text-xs">
            Live NMO Gujarat Healthcare Registry
          </span>
          <span className="hidden md:inline-block px-2 py-0.5 rounded-md bg-white/10 text-[10px] text-amber-300 font-mono font-medium">
            Gujarat & Saurashtra Prants
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-300 font-serif italic text-[11px] sm:text-xs">
          <span className="text-amber-400">॥ प्राणिनाम् आर्तिनाशनम् ॥</span>
          <span className="hidden sm:inline text-slate-400 font-sans not-italic text-[10px]">
            • Relief to all living beings
          </span>
        </div>
      </div>

      {/* Two Prominent Cards with Scroll-Triggered Fade-Up and Number Counting */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 max-w-4xl mx-auto">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className={`group relative bg-white rounded-3xl p-7 sm:p-8 shadow-xl shadow-slate-900/5 border border-slate-200/90 ${card.borderHover} transition-all duration-700 ${card.delay} ease-out hover:-translate-y-1.5 hover:shadow-2xl overflow-hidden flex flex-col justify-between ${
                hasScrolledIntoView
                  ? 'opacity-100 translate-y-0 scale-100'
                  : 'opacity-0 translate-y-10 scale-[0.98]'
              }`}
            >
              {/* Top Accent Gradient Bar */}
              <div
                className={`absolute top-0 inset-x-0 h-1.5 ${card.topBar} opacity-85 group-hover:opacity-100 group-hover:h-2 transition-all duration-300`}
              />

              {/* Background ambient corner glow on hover */}
              <div
                className={`absolute -right-8 -top-8 w-32 h-32 rounded-full ${card.bgGlow} blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
              />

              {/* Card Header: Icon + Badge */}
              <div className="flex items-center justify-between mb-5">
                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${card.gradient} text-white flex items-center justify-center shadow-lg shadow-slate-900/10 group-hover:scale-110 group-hover:rotate-2 transition-transform duration-300`}
                >
                  <Icon className="w-7 h-7" />
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border ${card.badgeColor}`}
                  >
                    {card.badge}
                  </span>
                </div>
              </div>

              {/* Animated Counting Metric Value & Label */}
              <div className="space-y-2 relative z-10">
                <div className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight flex items-baseline gap-0.5">
                  <span className="tabular-nums font-extrabold">{card.count}</span>
                  <span className={`text-3xl sm:text-4xl font-black ${card.accentColor}`}>
                    {card.displaySuffix}
                  </span>
                </div>

                <div className="text-base sm:text-lg font-bold text-slate-800 leading-snug">
                  {card.label}
                </div>

                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  {card.metricNote}
                </p>
              </div>

              {/* Bottom Subtle Status Track */}
              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                  Live Registry Sync
                </span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verified
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
