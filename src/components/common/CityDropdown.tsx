import React, { useState, useRef, useEffect } from 'react';
import { useNMO } from '../../context/NMOContext';
import { MapPin, Search, ChevronDown, Check, Plus, X } from 'lucide-react';

interface CityDropdownProps {
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  showAllOption?: boolean;
  allOptionLabel?: string;
  allowCustomAdd?: boolean;
  label?: string;
}

export const CityDropdown: React.FC<CityDropdownProps> = ({
  value,
  onChange,
  placeholder = 'Select City / District',
  required = false,
  disabled = false,
  className = '',
  showAllOption = false,
  allOptionLabel = 'All Cities',
  allowCustomAdd = true,
  label
}) => {
  const { cities, addCityToDatabase } = useNMO();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Filter cities by search query
  const cleanQuery = searchQuery.trim().toLowerCase();
  const filteredCities = cities.filter((city) =>
    city.toLowerCase().includes(cleanQuery)
  );

  const isExactMatch = cities.some(
    (c) => c.toLowerCase() === cleanQuery
  );

  const handleSelectCity = (city: string) => {
    onChange(city);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleAddNewCity = async () => {
    const newName = searchQuery.trim();
    if (!newName) return;
    setIsAdding(true);
    try {
      await addCityToDatabase(newName);
      onChange(newName);
      setIsOpen(false);
      setSearchQuery('');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-white border rounded-xl text-left text-xs font-medium transition-all shadow-xs cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed ${
          isOpen
            ? 'border-red-600 ring-2 ring-red-600/20 shadow-sm'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className={`w-4 h-4 shrink-0 ${value ? 'text-red-700' : 'text-slate-400'}`} />
          <span className={`truncate ${value ? 'text-slate-900 font-bold' : 'text-slate-400'}`}>
            {value === '' && showAllOption ? allOptionLabel : value || placeholder}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-slate-400">
          {value && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="p-0.5 hover:text-slate-700 hover:bg-slate-100 rounded-full cursor-pointer"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-red-600' : ''
            }`}
          />
        </div>
      </button>

      {/* Hidden input for form requirement validation */}
      {required && (
        <input
          type="text"
          value={value}
          required={required}
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
        />
      )}

      {/* Popover Dropdown with Search Bar */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-72">
          {/* Search Bar at Top */}
          <div className="p-2.5 bg-slate-50 border-b border-slate-200/80 sticky top-0 z-10">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search database cities..."
                className="w-full pl-8 pr-7 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-red-600 focus:outline-hidden"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 px-1 font-medium">
              <span>{filteredCities.length} of {cities.length} cities</span>
              <span className="text-emerald-700 font-bold">● Database Synced</span>
            </div>
          </div>

          {/* Cities List */}
          <div className="overflow-y-auto p-1.5 divide-y divide-slate-100/60 flex-1">
            {showAllOption && (
              <button
                type="button"
                onClick={() => handleSelectCity('')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-left transition-colors cursor-pointer ${
                  value === ''
                    ? 'bg-red-50 text-red-700 font-extrabold'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{allOptionLabel}</span>
                </div>
                {value === '' && <Check className="w-4 h-4 text-red-600" />}
              </button>
            )}

            {filteredCities.length > 0 ? (
              filteredCities.map((cityName) => {
                const isSelected = value.toLowerCase() === cityName.toLowerCase();
                return (
                  <button
                    key={cityName}
                    type="button"
                    onClick={() => handleSelectCity(cityName)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-red-50 text-red-700 font-bold'
                        : 'text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className={`w-3.5 h-3.5 ${isSelected ? 'text-red-600' : 'text-slate-400'}`} />
                      <span>{cityName}</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-red-600 shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="py-6 px-4 text-center">
                <p className="text-xs text-slate-500 mb-2">
                  No existing city matching "{searchQuery}"
                </p>
                {allowCustomAdd && searchQuery.trim() && !isExactMatch && (
                  <button
                    type="button"
                    onClick={handleAddNewCity}
                    disabled={isAdding}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAdding ? 'Adding...' : `Add "${searchQuery.trim()}" to Database`}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
