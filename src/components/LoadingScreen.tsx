import React from 'react';
import { NmoLogo } from './NmoLogo';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
      <div className="relative animate-pulse flex flex-col items-center">
        <NmoLogo size="xl" />
        <div className="mt-6 text-center space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-white font-serif">
            National Medicos Organisation
          </h2>
          <span className="text-xs font-bold text-red-500 uppercase tracking-widest block">
            Gujarat State Chapter
          </span>
          <p className="text-xs font-serif italic text-amber-300">
            ॥ प्राणिनाम् आर्तिनाशनम् ॥
          </p>
        </div>
      </div>
      <div className="mt-8 flex items-center gap-1.5 text-xs text-slate-400">
        <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
        <span>Loading secure medical portal...</span>
      </div>
    </div>
  );
};
