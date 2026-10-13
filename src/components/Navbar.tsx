import React, { useState } from 'react';
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
  Sparkles,
  Info,
  QrCode,
  Camera
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

  const isAdminRole =
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'state_admin' ||
    currentUser?.role === 'prant_admin' ||
    currentUser?.role === 'city_admin';

  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'about', label: 'About NMO' },
    { id: 'events', label: 'Events & CMEs' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'activities', label: 'Seva Initiatives' },
    { id: 'contact', label: 'Contact Us' }
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      {/* Top Clean Bar with Motto */}
      <div className="bg-gradient-to-r from-red-700 via-red-800 to-blue-900 text-white text-xs px-4 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden text-ellipsis whitespace-nowrap">
          <span className="font-serif tracking-widest text-amber-300 font-bold hidden sm:inline">
            ॥ प्राणिनाम् आर्तिनाशनम् ॥
          </span>
          <span className="text-slate-200 text-[11px]">
            National Medicos Organisation Gujarat State (Gujarat & Saurashtra Prants)
          </span>
        </div>

        {/* Right side utility links */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenVerify}
            className="flex items-center gap-1.5 text-[11px] text-amber-200 hover:text-white transition-colors font-semibold underline-offset-2 hover:underline cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5 text-amber-300" />
            <span>Scan QR / Verify Member</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo & Branding */}
          <button
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-3 text-left focus:outline-hidden"
          >
            <NmoLogo size="lg" showText={true} textColor="dark" subtext="Gujarat" />
          </button>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === item.id
                    ? 'text-red-700 bg-red-50/80 font-semibold'
                    : 'text-slate-700 hover:text-red-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}

            {/* Portal Navigation Links based on role */}
            {currentMember && (
              <div className="flex items-center gap-1 pl-1 ml-1 border-l border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('member-portal')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'member-portal' || activeTab === 'dashboard'
                      ? 'text-white bg-blue-700 shadow-xs'
                      : 'text-blue-700 bg-blue-50 hover:bg-blue-100'
                  }`}
                >
                  Member Portal
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('id-card')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'id-card'
                      ? 'text-red-700 bg-red-50 font-bold'
                      : 'text-slate-600 hover:text-red-700 hover:bg-slate-50'
                  }`}
                  title="View my digital ID card"
                >
                  ID Card
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('certificates')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'certificates'
                      ? 'text-emerald-700 bg-emerald-50 font-bold'
                      : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-50'
                  }`}
                  title="Google Drive certificates"
                >
                  Certificates
                </button>
              </div>
            )}

            {isAdminRole && (
              <button
                type="button"
                onClick={() => setActiveTab('admin-portal')}
                className={`px-3.5 py-2 text-sm font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'admin-portal'
                    ? 'text-white bg-red-700 shadow-xs'
                    : 'text-red-700 bg-red-50 hover:bg-red-100'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>Admin Portal</span>
              </button>
            )}
          </nav>

          {/* User Actions & Auth CTA */}
          <div className="hidden sm:flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenVerify}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
              title="Open camera to scan QR Code on Member ID card"
            >
              <QrCode className="w-3.5 h-3.5 text-red-600" />
              <span>Scan QR</span>
            </button>

            {currentUser?.email ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (isAdminRole) {
                      setActiveTab('admin-portal');
                    } else {
                      setActiveTab('member-portal');
                    }
                  }}
                  className="flex items-center gap-2 py-1.5 px-3 rounded-lg border border-slate-200 hover:border-slate-300 text-left bg-slate-50 hover:bg-slate-100/80 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-blue-700 text-white flex items-center justify-center font-bold text-xs">
                    {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
                  </div>
                  <div className="flex flex-col text-xs leading-none">
                    <span className="font-semibold text-slate-800 line-clamp-1">
                      {currentUser.displayName || currentUser.email}
                    </span>
                    <span className="text-[10px] text-slate-500 capitalize">
                      {currentUser.role.replace('_', ' ')}
                    </span>
                  </div>
                </button>

                <button
                  onClick={logout}
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 rounded-lg shadow-sm transition-all active:scale-98 cursor-pointer"
              >
                <User className="w-4 h-4" />
                <span>Portal Login</span>
              </button>
            )}
          </div>

          {/* Mobile menu toggle */}
          <div className="flex items-center lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-hidden"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-2 shadow-lg animate-in slide-in-from-top duration-200">
          {/* Mobile Scan QR quick action */}
          <button
            type="button"
            onClick={() => {
              onOpenVerify();
              setMobileMenuOpen(false);
            }}
            className="w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold text-red-800 bg-red-50 border border-red-200 flex items-center justify-between cursor-pointer shadow-2xs mb-2"
          >
            <span className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-red-600" />
              <span>Scan ID Card QR Code</span>
            </span>
            <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-mono font-bold">Camera Scan</span>
          </button>

          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 rounded-md text-sm font-medium ${
                activeTab === item.id
                  ? 'bg-red-50 text-red-700 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}

          {currentMember && (
            <div className="pt-2 pb-1 border-t border-slate-100 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider px-3 block">
                Member Quick Portal
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('member-portal');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-blue-700 hover:bg-blue-50 flex items-center justify-between cursor-pointer"
              >
                <span>Dashboard Overview</span>
                <User className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('id-card');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-red-700 hover:bg-red-50 flex items-center justify-between cursor-pointer"
              >
                <span>My ID Card</span>
                <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-mono font-bold">QR Verified</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('certificates');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-emerald-700 hover:bg-emerald-50 flex items-center justify-between cursor-pointer"
              >
                <span>Drive Certificates</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">JPG / PNG</span>
              </button>
            </div>
          )}

          {isAdminRole && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('admin-portal');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 rounded-md text-sm font-semibold bg-red-700 text-white flex items-center justify-between cursor-pointer"
            >
              <span>Admin Management Portal</span>
              <Shield className="w-4 h-4" />
            </button>
          )}

          {/* Portal Login / Authenticated User Section in Mobile Menu */}
          <div className="pt-2 pb-1 border-t border-slate-100">
            {currentUser?.email ? (
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-600 to-blue-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
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
                    onClick={() => {
                      if (isAdminRole) {
                        setActiveTab('admin-portal');
                      } else {
                        setActiveTab('member-portal');
                      }
                      setMobileMenuOpen(false);
                    }}
                    className="py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold text-center transition-colors cursor-pointer"
                  >
                    {isAdminRole ? 'Admin Console' : 'My Dashboard'}
                  </button>
                  <button
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
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-red-700 to-red-800 hover:from-red-800 hover:to-red-900 active:scale-[0.99] rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <User className="w-4 h-4" />
                <span>Portal Login</span>
              </button>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={() => {
                onOpenVerify();
                setMobileMenuOpen(false);
              }}
              className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Verify Member ID</span>
            </button>

            {!currentUser?.email && (
              <button
                onClick={() => {
                  onOpenAuth();
                  setMobileMenuOpen(false);
                }}
                className="text-xs font-semibold text-red-700 hover:underline"
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
