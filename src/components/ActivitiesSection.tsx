import React from 'react';
import { HeartPulse, Stethoscope, BookCheck, ShieldAlert, Award, ArrowUpRight } from 'lucide-react';

export const ActivitiesSection: React.FC = () => {
  const activities = [
    {
      title: 'Tribal Multi-Specialty Health Camps (Seva Samarpan)',
      desc: 'Mobile diagnostic teams and specialist doctors traversing remote forested areas in Dang and Chhota Udepur, providing pediatric, gynecological, ophthalmic, dental, and general medical care free of cost.',
      impact: '15,000+ Tribal patients treated annually',
      tag: 'Healthcare Outreach',
      icon: HeartPulse,
      accent: 'border-l-red-600'
    },
    {
      title: 'Statewide Blood Donation & Rare Group Registries',
      desc: 'Youth medicos running ongoing voluntary blood donation campaigns across medical colleges in Ahmedabad, Surat, Vadodara, and Rajkot, coupled with a 24/7 emergency negative blood donor registry.',
      impact: '4,500+ Units collected this year',
      tag: 'Life Saving',
      icon: ShieldAlert,
      accent: 'border-l-amber-600'
    },
    {
      title: 'Clinical CME Seminars & Surgical Workshops',
      desc: 'Accredited academic sessions conducted in partnership with state medical faculties, focusing on disaster emergency protocols, rural infectious diseases, and evidence-based clinical practices.',
      impact: '1,200+ Medical trainees certified',
      tag: 'Medical Education',
      icon: BookCheck,
      accent: 'border-l-blue-600'
    },
    {
      title: 'Undergraduate Mentorship & Ethical Values',
      desc: 'Pairing first-year MBBS students with senior clinical professors to guide them in stress resilience, career navigation, clinical acumen, and lifelong dedication to national social responsibility.',
      impact: 'Active in 15+ Gujarat Medical Colleges',
      tag: 'Youth Leadership',
      icon: Award,
      accent: 'border-l-emerald-600'
    }
  ];

  return (
    <section id="activities" className="py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-red-700">
            Dedicated In Action
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mt-1">
            Recent Healthcare Activities & Field Programs
          </h2>
          <p className="text-slate-600 text-sm sm:text-base mt-2">
            Transforming medical knowledge into direct humanitarian relief through structured campaigns across both Gujarat and Saurashtra Prants.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {activities.map((act, index) => {
            const IconComp = act.icon;
            return (
              <div
                key={index}
                className={`group bg-white rounded-2xl p-8 border border-slate-200/90 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 border-l-4 ${act.accent} flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700">
                      {act.tag}
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-xs">
                      <IconComp className="w-5 h-5" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-slate-900 mb-3 leading-snug group-hover:text-red-700 transition-colors">
                    {act.title}
                  </h3>

                  <p className="text-slate-600 text-sm leading-relaxed mb-6">
                    {act.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="text-slate-900 font-bold">{act.impact}</span>
                  <span className="text-red-700 flex items-center gap-1 font-bold group-hover:text-red-800">
                    Active Program
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
