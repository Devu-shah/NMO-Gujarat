import React from 'react';

export const NMO_LOGO_IMAGE_URL =
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTYhbKvL5-7H3hS8j3gaP1Jsgu4cf-4m0YMpg&s';

interface NmoLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'custom';
  className?: string;
  showText?: boolean;
  textColor?: 'dark' | 'light';
  subtext?: string;
}

export const NmoLogo: React.FC<NmoLogoProps> = ({
  size = 'md',
  className = '',
  showText = false,
  textColor = 'dark',
  subtext = 'Gujarat'
}) => {
  const sizeMap = {
    xs: 'w-7 h-7',
    sm: 'w-9 h-9',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
    '2xl': 'w-32 h-32',
    custom: ''
  };

  const imageSize = sizeMap[size] || sizeMap.md;

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <div className={`relative shrink-0 ${imageSize} transition-transform hover:scale-105 duration-200`}>
        <img
          src={NMO_LOGO_IMAGE_URL}
          alt="National Medicos Organisation Logo"
          className="w-full h-full object-contain filter drop-shadow-sm rounded-full"
          onError={(e) => {
            const target = e.currentTarget;
            if (target.src !== '/assets/nmo/logo.png') {
              target.src = '/assets/nmo/logo.png';
            }
          }}
        />
      </div>

      {showText && (
        <div className="flex flex-col text-left leading-tight">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black tracking-tight ${
                textColor === 'light' ? 'text-white' : 'text-slate-900'
              } text-base sm:text-lg font-serif`}
            >
              NMO
            </span>
            <span
              className={`font-bold tracking-normal ${
                textColor === 'light' ? 'text-blue-200' : 'text-red-700'
              } text-sm sm:text-base`}
            >
              {subtext}
            </span>
          </div>
          <span
            className={`text-[10px] sm:text-[11px] font-medium tracking-wide ${
              textColor === 'light' ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            National Medicos Organisation
          </span>
          <span
            className={`text-[9px] font-serif italic ${
              textColor === 'light' ? 'text-amber-300' : 'text-amber-800'
            }`}
          >
            प्राणिनाम् आर्तिनाशनम्
          </span>
        </div>
      )}
    </div>
  );
};
