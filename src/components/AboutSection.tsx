import React from 'react';
import { NmoLogo } from './NmoLogo';
import { HeartHandshake, Compass, BookOpenCheck, ShieldCheck, Stethoscope, Users2 } from 'lucide-react';

export const AboutSection: React.FC = () => {
  const pillars = [
    {
      title: 'Swasthya Seva (Selfless Healthcare)',
      description: 'Conducting comprehensive multi-specialty camps, free diagnostic screening, specialist consultations, and surgical care in remote tribal regions like Dang and rural villages across Gujarat & Saurashtra.',
      icon: Stethoscope,
      color: 'text-red-700',
      bg: 'bg-red-50'
    },
    {
      title: 'Sanskar & Youth Mentorship',
      description: 'Mentoring undergraduate MBBS students and postgraduates in medical ethics, patriotism, patient empathy, and high clinical standards in government and academic medical colleges.',
      icon: BookOpenCheck,
      color: 'text-blue-700',
      bg: 'bg-blue-50'
    },
    {
      title: 'Samajik Chetna & Disaster Relief',
      description: 'Mobilizing rapid response medical teams during natural calamities, running continuous voluntary blood donation drives, and fostering public health hygiene education.',
      icon: HeartHandshake,
      color: 'text-amber-700',
      bg: 'bg-amber-50'
    }
  ];

  return (
    <section id="about" className="py-20 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Intro Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold uppercase tracking-wider">
              <span>About NMO Gujarat</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              Organising the Medical Fraternity in Service of Society
            </h2>

            <p className="text-slate-700 text-base sm:text-lg leading-relaxed">
              <strong>National Medicos Organisation (NMO)</strong> is India's premier organization of qualified doctors and medical students, guided by the timeless motto <em>"प्राणिनाम् आर्तिनाशनम्"</em> — dedicated to alleviating the suffering of all living beings.
            </p>

            <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
              In Gujarat State, NMO operates actively through two administrative regions: <strong>Gujarat Prant</strong> and <strong>Saurashtra Prant</strong>. Uniting dedicated clinicians from primary healthcare centers to super-specialty teaching hospitals, NMO Gujarat bridges the urban-rural healthcare divide through voluntary service, medical camps, and student character-building.
            </p>

            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 text-sm block">Gujarat Prant</span>
                <span className="text-xs text-slate-600">Covering Ahmedabad, Surat, Vadodara, Gandhinagar, Dang, Panchmahal, and North-Central districts.</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 text-sm block">Saurashtra Prant</span>
                <span className="text-xs text-slate-600">Covering Rajkot, Jamnagar, Bhavnagar, Junagadh, Amreli, Porbandar, Morbi, and Kutch region.</span>
              </div>
            </div>
          </div>

          {/* Right Brand Pillar Card */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-8 sm:p-10 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white shadow-xl relative overflow-hidden">
            <div className="absolute -right-10 -bottom-10 opacity-10">
              <NmoLogo size="custom" className="w-80 h-80" />
            </div>

            <NmoLogo size="2xl" className="mb-6" />

            <div className="text-center space-y-2 z-10">
              <span className="text-xs font-bold uppercase tracking-widest text-amber-300">
                Official Emblem & Motto
              </span>
              <h3 className="text-2xl font-serif font-black text-amber-200">
                प्राणिनाम् आर्तिनाशनम्
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xs mx-auto leading-relaxed">
                Centered on Lord Dhanvantari, the primordial master of healing, holding the sacred Amrit Kalash of health for all humanity.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-white/10 w-full flex items-center justify-around text-center text-xs">
              <div>
                <span className="block text-xl font-bold text-white">1977</span>
                <span className="text-slate-400 text-[10px]">National Inception</span>
              </div>
              <div className="h-8 w-px bg-white/20" />
              <div>
                <span className="block text-xl font-bold text-white">2 Prants</span>
                <span className="text-slate-400 text-[10px]">Gujarat & Saurashtra</span>
              </div>
              <div className="h-8 w-px bg-white/20" />
              <div>
                <span className="block text-xl font-bold text-white">100%</span>
                <span className="text-slate-400 text-[10px]">Selfless Seva</span>
              </div>
            </div>
          </div>
        </div>

        {/* Core Pillars */}
        <div className="mt-16 pt-12 border-t border-slate-200">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Our Core Foundations
            </h3>
            <p className="text-slate-600 text-sm mt-1">
              Guiding principles embedded in every program conducted by NMO Gujarat.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {pillars.map((p, idx) => {
              const IconComp = p.icon;
              return (
                <div
                  key={idx}
                  className="group p-6 rounded-2xl border border-slate-200 bg-white hover:border-red-200 hover:-translate-y-1.5 hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className={`w-12 h-12 rounded-xl ${p.bg} ${p.color} flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-xs`}>
                      <IconComp className="w-6 h-6" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-red-700 transition-colors">
                      {p.title}
                    </h4>
                    <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
