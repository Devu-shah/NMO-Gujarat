import React, { useState, useEffect } from 'react';
import { useNMO } from '../context/NMOContext';
import {
  Users,
  Building2,
  Calendar,
  Award,
  ShieldCheck,
  HeartHandshake,
  TrendingUp,
  Activity,
  MapPin,
  Sparkles
} from 'lucide-react';

export const DynamicStats: React.FC = () => {
  const { members, events, eventRegistrations } = useNMO();

  const totalMembers = members.length;
  const activeMembers = members.filter((m) => m.status === 'Active').length;
  const gujaratCount = members.filter((m) => m.prant === 'Gujarat').length;
  const saurashtraCount = members.filter((m) => m.prant === 'Saurashtra').length;

  const collegesSet = new Set(
    members.map((m) => m.medicalCollege).filter(Boolean)
  );

  const campsAndEvents = events.length;
  const totalRegistrations = eventRegistrations.length;

  // Redesigned dynamic stats — Inception/1977 filler card removed as requested
  const statCards = [
    {
      id: 'members',
      label: 'Verified Doctors & Medicos',
      value: totalMembers > 0 ? totalMembers : '500+',
      metricNote: totalMembers > 0 ? `${activeMembers} Active in Registry` : 'Clinicians & Residents',
      badge: 'Verified Credentialed',
      badgeColor: 'bg-red-100 text-red-800 border-red-200',
      icon: Users,
      gradient: 'from-red-600 to-rose-700',
      accentColor: 'text-red-600',
      bgGlow: 'bg-red-500/10',
      borderHover: 'hover:border-red-300',
      topBar: 'bg-gradient-to-r from-red-600 to-rose-500'
    },
    {
      id: 'colleges',
      label: 'Medical Colleges & Campuses',
      value: collegesSet.size > 0 ? collegesSet.size : '30+',
      metricNote: 'Govt & Private Colleges',
      badge: 'Statewide Network',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
      icon: Building2,
      gradient: 'from-blue-600 to-indigo-700',
      accentColor: 'text-blue-600',
      bgGlow: 'bg-blue-500/10',
      borderHover: 'hover:border-blue-300',
      topBar: 'bg-gradient-to-r from-blue-600 to-indigo-500'
    },
    {
      id: 'seva',
      label: 'Seva Initiatives & CMEs',
      value: campsAndEvents > 0 ? campsAndEvents : '25+',
      metricNote: totalRegistrations > 0 ? `${totalRegistrations} Registrations` : 'Health Camps & Conferences',
      badge: 'Free Patient Outreach',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      icon: Calendar,
      gradient: 'from-emerald-600 to-teal-700',
      accentColor: 'text-emerald-600',
      bgGlow: 'bg-emerald-500/10',
      borderHover: 'hover:border-emerald-300',
      topBar: 'bg-gradient-to-r from-emerald-600 to-teal-500'
    },
    {
      id: 'prants',
      label: 'Gujarat & Saurashtra Prants',
      value: totalMembers > 0 ? `${gujaratCount} / ${saurashtraCount}` : '2 Prants',
      metricNote: 'All 33 Districts Covered',
      badge: 'Unified State Body',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: Award,
      gradient: 'from-amber-600 to-orange-700',
      accentColor: 'text-amber-600',
      bgGlow: 'bg-amber-500/10',
      borderHover: 'hover:border-amber-300',
      topBar: 'bg-gradient-to-r from-amber-500 to-orange-500'
    }
  ];

  return (
    <section className="relative -mt-14 z-30 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Top Floating Glass Header Ribbon */}
      <div className="mb-3 px-5 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white border border-slate-800/80 shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-500">
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

      {/* Redesigned Grid of Sculpted Cards with Micro-Interactions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className={`group relative bg-white rounded-3xl p-6 shadow-xl shadow-slate-900/5 border border-slate-200/90 ${card.borderHover} transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl overflow-hidden flex flex-col justify-between`}
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              {/* Top Accent Gradient Bar */}
              <div
                className={`absolute top-0 inset-x-0 h-1.5 ${card.topBar} opacity-85 group-hover:opacity-100 group-hover:h-2 transition-all duration-300`}
              />

              {/* Background ambient corner glow on hover */}
              <div
                className={`absolute -right-8 -top-8 w-28 h-28 rounded-full ${card.bgGlow} blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
              />

              {/* Card Header: Icon + Badge */}
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${card.gradient} text-white flex items-center justify-center shadow-md shadow-slate-900/10 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}
                >
                  <Icon className="w-6 h-6" />
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase border ${card.badgeColor}`}
                >
                  {card.badge}
                </span>
              </div>

              {/* Metric Value & Label */}
              <div className="space-y-1.5 relative z-10">
                <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight flex items-baseline gap-1">
                  <span>{card.value}</span>
                  <span className={`text-base font-bold ${card.accentColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}>
                    +
                  </span>
                </div>

                <div className="text-sm font-bold text-slate-800 leading-snug">
                  {card.label}
                </div>

                <p className="text-xs text-slate-500 font-medium">
                  {card.metricNote}
                </p>
              </div>

              {/* Bottom Subtle Status Track */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />
                  Synced
                </span>
                <span className="group-hover:translate-x-1 group-hover:text-slate-700 transition-all font-semibold text-[11px]">
                  Explore →
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
