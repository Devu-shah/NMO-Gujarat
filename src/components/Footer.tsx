import React from 'react';
import { NmoLogo } from './NmoLogo';
import { MapPin, Phone, Mail, CheckCircle2, Shield } from 'lucide-react';

interface FooterProps {
  onNavigate: (tab: string) => void;
  onOpenVerify: () => void;
  onOpenAuth: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenVerify, onOpenAuth }) => {
  return (
    <footer className="bg-slate-950 text-white border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Col 1 & 2: Brand & Motto */}
          <div className="lg:col-span-2 space-y-4">
            <NmoLogo size="lg" showText={true} textColor="light" subtext="Gujarat State" />

            <p className="text-xs sm:text-sm text-slate-400 max-w-sm leading-relaxed pt-2">
              National Medicos Organisation (NMO) is a patriotic collective of qualified doctors, clinical specialists, and undergraduate medicos dedicated to selfless healthcare service in Gujarat and Saurashtra.
            </p>

            <div className="pt-2 text-xs font-serif italic text-amber-300">
              ॥ प्राणिनाम् आर्तिनाशनम् ॥ — Relief to the suffering of living beings
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={onOpenVerify}
                className="px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verify Member ID</span>
              </button>
              <button
                onClick={onOpenAuth}
                className="px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-500/40 text-red-300 hover:bg-red-900/60 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Shield className="w-3.5 h-3.5 text-red-400" />
                <span>Member Portal</span>
              </button>
            </div>
          </div>

          {/* Col 3: Prant Headquarters */}
          <div className="space-y-3 text-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200 block">
              Prant Offices
            </span>
            <div className="space-y-2 text-slate-400">
              <div>
                <strong className="text-white block">Gujarat Prant</strong>
                <span>C/o B.J. Medical College Campus, Asarwa, Ahmedabad - 380016</span>
              </div>
              <div className="pt-2">
                <strong className="text-white block">Saurashtra Prant</strong>
                <span>C/o PDU Government Medical College, Hospital Chowk, Rajkot - 360001</span>
              </div>
            </div>
          </div>

          {/* Col 4: Quick Navigation */}
          <div className="space-y-3 text-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200 block">
              Quick Links
            </span>
            <ul className="space-y-2 text-slate-400">
              <li>
                <button onClick={() => onNavigate('home')} className="hover:text-white transition-colors">
                  Home
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('about')} className="hover:text-white transition-colors">
                  About NMO Gujarat
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('events')} className="hover:text-white transition-colors">
                  Events & Medical Camps
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('gallery')} className="hover:text-white transition-colors">
                  Photo Chronicle
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('activities')} className="hover:text-white transition-colors">
                  Seva Initiatives
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('contact')} className="hover:text-amber-400 text-amber-300 font-semibold transition-colors">
                  Contact Us & Helpdesk
                </button>
              </li>
            </ul>
          </div>

          {/* Col 5: Contact & Helpline */}
          <div className="space-y-3 text-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200 block">
              Official Helpline
            </span>
            <div className="space-y-2.5 text-slate-400">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-slate-300">secretary.gujarat@nmogujarat.org</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-slate-300">secretary.saurashtra@nmogujarat.org</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-slate-300 font-bold">+91 79 2658 0000</span>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => onNavigate('contact')}
                  className="w-full py-2 px-3 rounded-lg bg-orange-600/30 hover:bg-orange-600 text-orange-200 hover:text-white border border-orange-500/40 text-[11px] font-semibold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Send Helpdesk Inquiry</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-slate-900 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} National Medicos Organisation (NMO) Gujarat. All rights reserved.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Gujarat Prant</span>
            <span>·</span>
            <span>Saurashtra Prant</span>
            <span>·</span>
            <span>Reg. No. 1977</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
