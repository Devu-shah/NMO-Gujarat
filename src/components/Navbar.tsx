import React, { useState, useEffect, useRef } from 'react';
import { NmoLogo } from './NmoLogo';
import { useNMO } from '../context/NMOContext';
import {
  User,
  Shield,
  Calendar,
  Image as ImageIcon,
  CheckCircle2,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Info,
  QrCode,
  HeartHandshake,
  Award,
  LayoutDashboard,
  CreditCard,
  Mail,
  Home,
  Images
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenAuth: () => void;
  onOpenVerify: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenAuth,
  onOpenVerify
}) => {
  const { currentUser, currentMember, logout } = useNMO();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Mobile collapsible accordion states
  const [mobileActivitiesOpen, setMobileActivitiesOpen] = useState(true);
  const [mobilePortalOpen, setMobilePortalOpen] = useState(true);

  const navRef = useRef<HTMLDivElement>(null);

  const isAdminRole =
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'state_admin' ||
    currentUser?.role === 'prant_admin' ||
    currentUser?.role === 'city_admin';

  const isMemberUser = Boolean(currentMember || (currentUser && currentUser.role === 'member'));

  // Close dropdowns on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  };

  const isActivitiesActive = ['events', 'gallery', 'activities'].includes(activeTab);
  const isPortalActive = ['member-portal', 'dashboard', 'id-card', 'certificates'].includes(activeTab);
  const isAboutActive = activeTab === 'about';

  return (
    <header ref={navRef} className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      {/* Top Bar with Motto & Direct Verification Link */}
      <div className="bg-gradient-to-r from-red-700 via-red-800 to-blue-900 text-white text-xs px-3 sm:px-6 py-1.5 flex items-center justify-between overflow-x-hidden">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-2">
          <span className="font-serif tracking-widest text-amber-300 font-bold hidden md:inline shrink-0">
            ॥ प्राणिनाम् आर्तिनाशनम् ॥
          </span>
          <span className="text-slate-200 text-[11px] truncate">
            National Medicos Organisation Gujarat (Gujarat & Saurashtra Prants)
          </span>
        </div>

        {/* Right side utility links */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenVerify}
            className="flex items-center gap-1.5 text-[11px] text-amber-200 hover:text-white transition-colors font-semibold underline-offset-2 hover:underline cursor-pointer"
            title="Scan QR on Member ID card or verify by membership ID"
          >
            <QrCode className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden xs:inline">Scan QR / Verify Member</span>
            <span className="xs:hidden">Verify</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-2 sm:gap-4">
          {/* Logo & Branding */}
          <button
            type="button"
            onClick={() => handleSelectTab('home')}
            className="flex items-center gap-3 text-left focus:outline-hidden shrink-0 cursor-pointer"
          >
            <NmoLogo size="lg" showText={true} textColor="dark" subtext="Gujarat" />
          </button>

          {/* Desktop Nav Links - Consolidates navigation into clean, accessible dropdowns */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
            {/* 1. Home Direct Link */}
            <button
              type="button"
              onClick={() => handleSelectTab('home')}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'home'
                  ? 'text-red-700 bg-red-50/90 font-bold'
                  : 'text-slate-700 hover:text-red-700 hover:bg-slate-50'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>

            {/* 2. About Direct Link */}
            <button
              type="button"
              onClick={() => handleSelectTab('about')}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                isAboutActive
                  ? 'text-red-700 bg-red-50/90 font-bold'
                  : 'text-slate-700 hover:text-red-700 hover:bg-slate-50'
              }`}
            >
              <Info className="w-4 h-4" />
              <span>About</span>
            </button>

            {/* 3. Activities Dropdown (Events & CMEs, Gallery, Seva Initiatives) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'activities' ? null : 'activities')}
                aria-expanded={openDropdown === 'activities'}
                aria-haspopup="true"
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                  isActivitiesActive
                    ? 'text-red-700 bg-red-50/90 font-bold'
                    : 'text-slate-700 hover:text-red-700 hover:bg-slate-50'
                }`}
              >
                <span>Activities</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'activities' ? 'rotate-180 text-red-700' : 'text-slate-400'}`} />
              </button>

              {openDropdown === 'activities' && (
                <div className="absolute top-full left-0 mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={() => handleSelectTab('events')}
                    className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                      activeTab === 'events' ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50 hover:text-red-700'
                    }`}
                  >
                    <Calendar className="w-4 h-4 text-red-600 shrink-0" />
                    <div>
                      <div className="font-bold">Events & CMEs</div>
                      <div className="text-[10px] text-slate-400 font-normal">State conferences & workshops</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTab('gallery')}
                    className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                      activeTab === 'gallery' ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50 hover:text-red-700'
                    }`}
                  >
                    <ImageIcon className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-bold">Photo Gallery</div>
                      <div className="text-[10px] text-slate-400 font-normal">Health camps & medical yatras</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTab('gallery-archive')}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-slate-700 hover:bg-slate-50 hover:text-red-700"
                  >
                    <Images className="w-4 h-4 text-red-600 shrink-0" />
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span>Full Gallery Archive</span>
                        <span className="text-[9px] bg-red-100 text-red-800 px-1 py-0.2 rounded font-mono font-bold">All</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-normal">Complete Photographic Archive</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTab('activities')}
                    className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                      activeTab === 'activities' ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50 hover:text-red-700'
                    }`}
                  >
                    <HeartHandshake className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold">Seva Initiatives</div>
                      <div className="text-[10px] text-slate-400 font-normal">Tribal health & community care</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* 4. Contact Us Direct Link */}
            <button
              type="button"
              onClick={() => handleSelectTab('contact')}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'contact'
                  ? 'text-red-700 bg-red-50/90 font-bold'
                  : 'text-slate-700 hover:text-red-700 hover:bg-slate-50'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>Contact</span>
            </button>

            {/* 5. My Portal Dropdown (for authenticated members) */}
            {isMemberUser && (
              <div className="relative border-l border-slate-200 pl-2 ml-1">
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'portal' ? null : 'portal')}
                  aria-expanded={openDropdown === 'portal'}
                  aria-haspopup="true"
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isPortalActive
                      ? 'text-blue-800 bg-blue-50 font-bold shadow-2xs'
                      : 'text-slate-700 hover:text-blue-700 hover:bg-slate-50'
                  }`}
                >
                  <User className="w-4 h-4 text-blue-600" />
                  <span>My Portal</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'portal' ? 'rotate-180 text-blue-700' : 'text-slate-400'}`} />
                </button>

                {openDropdown === 'portal' && (
                  <div className="absolute top-full left-0 mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={() => handleSelectTab('member-portal')}
                      className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                        activeTab === 'member-portal' || activeTab === 'dashboard' ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50 hover:text-blue-700'
                      }`}
                    >
                      <LayoutDashboard className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <div className="font-bold">Dashboard Overview</div>
                        <div className="text-[10px] text-slate-400 font-normal">Membership profile & status</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectTab('id-card')}
                      className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                        activeTab === 'id-card' ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50 hover:text-red-700'
                      }`}
                    >
                      <CreditCard className="w-4 h-4 text-red-600 shrink-0" />
                      <div>
                        <div className="font-bold">Digital ID Card</div>
                        <div className="text-[10px] text-slate-400 font-normal">QR verified credential</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectTab('certificates')}
                      className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                        activeTab === 'certificates' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50 hover:text-emerald-700'
                      }`}
                    >
                      <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-bold">Certificates</div>
                        <div className="text-[10px] text-slate-400 font-normal">Verified repository</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 6. Admin Portal (Role-aware access) */}
            {isAdminRole && (
              <button
                type="button"
                onClick={() => handleSelectTab('admin-portal')}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border ${
                  activeTab === 'admin-portal'
                    ? 'text-white bg-red-700 border-red-800 shadow-2xs'
                    : 'text-red-700 bg-red-50/70 border-red-200 hover:bg-red-100'
                }`}
                title="Open Administrative Console"
              >
                <Shield className="w-4 h-4 text-red-600 group-hover:text-red-700" />
                <span>Admin Console</span>
              </button>
            )}
          </nav>

          {/* Right Utility: Scan QR & Auth CTA */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onOpenVerify}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
              title="Open camera to scan QR Code on Member ID card"
            >
              <QrCode className="w-3.5 h-3.5 text-red-600" />
              <span>Scan QR</span>
            </button>

            {currentUser?.email ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isAdminRole) {
                      handleSelectTab('admin-portal');
                    } else {
                      handleSelectTab('member-portal');
                    }
                  }}
                  className="flex items-center gap-2 py-1 px-2 sm:py-1.5 sm:px-3 rounded-lg border border-slate-200 hover:border-slate-300 text-left bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer max-w-[130px] sm:max-w-[190px]"
                  title="View your account portal"
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-red-600 to-blue-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                    {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
                  </div>
                  <div className="flex flex-col text-xs leading-none min-w-0">
                    <span className="font-semibold text-slate-800 truncate">
                      {currentUser.displayName || currentUser.email}
                    </span>
                    <span className="text-[10px] text-slate-500 capitalize truncate mt-0.5">
                      {currentUser.role.replace('_', ' ')}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Sign out from NMO Portal"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 rounded-lg shadow-xs transition-all active:scale-98 cursor-pointer"
              >
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Portal Login</span>
              </button>
            )}

            {/* Mobile menu hamburger button */}
            <div className="flex items-center lg:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-hidden cursor-pointer"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="w-6 h-6 text-red-700" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu - Collapsible, Organized Groups, No Horizontal Overflow */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-8 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-top duration-200">
          {/* Quick Member QR Scan Camera Button */}
          <button
            type="button"
            onClick={() => {
              onOpenVerify();
              setMobileMenuOpen(false);
            }}
            className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold text-red-900 bg-red-50 border border-red-200 flex items-center justify-between cursor-pointer shadow-2xs"
          >
            <span className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-red-600" />
              <span>Scan Member ID QR Code</span>
            </span>
            <span className="text-[10px] bg-red-700 text-white px-2 py-0.5 rounded font-mono font-bold">Instant Scan</span>
          </button>

          {/* Group 1: Main Navigation */}
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 pb-1">
              General
            </div>
            <button
              type="button"
              onClick={() => handleSelectTab('home')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2.5 cursor-pointer ${
                activeTab === 'home' ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Home className="w-4 h-4 text-slate-400" />
              <span>Home</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('about')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2.5 cursor-pointer ${
                activeTab === 'about' ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Info className="w-4 h-4 text-slate-400" />
              <span>About NMO Gujarat</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('contact')}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2.5 cursor-pointer ${
                activeTab === 'contact' ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Mail className="w-4 h-4 text-slate-400" />
              <span>Contact Us</span>
            </button>
          </div>

          {/* Group 2: Activities & Initiatives (Collapsible) */}
          <div className="border-t border-slate-100 pt-3 space-y-1">
            <button
              type="button"
              onClick={() => setMobileActivitiesOpen(!mobileActivitiesOpen)}
              className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 pb-1 cursor-pointer"
            >
              <span>Activities & Seva</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${mobileActivitiesOpen ? 'rotate-180' : ''}`} />
            </button>

            {mobileActivitiesOpen && (
              <div className="space-y-1 pl-1">
                <button
                  type="button"
                  onClick={() => handleSelectTab('events')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between cursor-pointer ${
                    activeTab === 'events' ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-red-600" />
                    <span>Events & CMEs</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTab('gallery')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between cursor-pointer ${
                    activeTab === 'gallery' ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <ImageIcon className="w-4 h-4 text-amber-600" />
                    <span>Photo Gallery</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTab('gallery-archive')}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between cursor-pointer text-slate-700 hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2.5">
                    <Images className="w-4 h-4 text-red-600" />
                    <span>Full Gallery Archive</span>
                  </span>
                  <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-mono font-bold">
                    All
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTab('activities')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between cursor-pointer ${
                    activeTab === 'activities' ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <HeartHandshake className="w-4 h-4 text-emerald-600" />
                    <span>Seva Initiatives</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Group 3: Member Services (if authenticated) */}
          {isMemberUser && (
            <div className="border-t border-slate-100 pt-3 space-y-1">
              <button
                type="button"
                onClick={() => setMobilePortalOpen(!mobilePortalOpen)}
                className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 pb-1 cursor-pointer"
              >
                <span>My Member Portal</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${mobilePortalOpen ? 'rotate-180' : ''}`} />
              </button>

              {mobilePortalOpen && (
                <div className="space-y-1 pl-1">
                  <button
                    type="button"
                    onClick={() => handleSelectTab('member-portal')}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-50 flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Dashboard Overview</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('id-card')}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <CreditCard className="w-4 h-4" />
                      <span>Digital ID Card</span>
                    </span>
                    <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-mono font-bold">QR Verified</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('certificates')}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-emerald-700 hover:bg-emerald-50 flex items-center justify-between cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Award className="w-4 h-4" />
                      <span>My Certificates</span>
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Verified</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Group 4: Admin Portal (if authorized administrator) */}
          {isAdminRole && (
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => handleSelectTab('admin-portal')}
                className="w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold bg-red-700 text-white flex items-center justify-between cursor-pointer shadow-xs"
              >
                <span className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  <span>Admin Management Console</span>
                </span>
                <span className="text-[10px] bg-red-900 text-white px-2 py-0.5 rounded uppercase tracking-wider font-bold">Admin</span>
              </button>
            </div>
          )}

          {/* Group 5: Account & Session Management */}
          <div className="border-t border-slate-100 pt-3">
            {currentUser?.email ? (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-600 to-blue-700 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
                    {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800 text-xs truncate">
                      {currentUser.displayName || currentUser.email}
                    </div>
                    <div className="text-[10px] text-slate-500 capitalize">
                      {currentUser.role.replace('_', ' ')}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => {
                      if (isAdminRole) {
                        handleSelectTab('admin-portal');
                      } else {
                        handleSelectTab('member-portal');
                      }
                    }}
                    className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold text-center transition-colors cursor-pointer"
                  >
                    {isAdminRole ? 'Admin Console' : 'My Dashboard'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="py-1.5 px-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold text-center flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onOpenAuth();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 active:scale-[0.99] rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <User className="w-4 h-4" />
                <span>Portal Login / Register</span>
              </button>
            )}
          </div>

          {/* Quick verification text link */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                onOpenVerify();
                setMobileMenuOpen(false);
              }}
              className="font-semibold text-emerald-700 hover:underline flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verify Member ID</span>
            </button>

            {!currentUser?.email && (
              <button
                type="button"
                onClick={() => {
                  onOpenAuth();
                  setMobileMenuOpen(false);
                }}
                className="font-semibold text-red-700 hover:underline cursor-pointer"
              >
                New Member Sign Up
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
