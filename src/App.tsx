/**
 * National Medicos Organisation (NMO) Gujarat
 * Official Portal & Unified Management System
 * Motto: "प्राणिनाम् आर्तिनाशनम्"
 */

import React, { useState, useEffect } from 'react';
import { NMOProvider, useNMO } from './context/NMOContext';
import { Navbar } from './components/Navbar';
import { HeroSlider } from './components/HeroSlider';
import { DynamicStats } from './components/DynamicStats';
import { AnnouncementsTicker } from './components/AnnouncementsTicker';
import { EventsSection } from './components/EventsSection';
import { AboutSection } from './components/AboutSection';
import { GallerySection } from './components/GallerySection';
import { ActivitiesSection } from './components/ActivitiesSection';
import { ContactUsPage } from './components/ContactUsPage';
import { Footer } from './components/Footer';
import { PublicVerifyModal } from './components/PublicVerifyModal';
import { MemberDashboard } from './components/MemberDashboard';
import { AdminPortal } from './components/admin/AdminPortal';
import { LoginPage } from './components/LoginPage';
import { LoadingScreen } from './components/LoadingScreen';
import { UserRole, PrantType } from './types/nmo';
import { AlertTriangle, X } from 'lucide-react';

export function getRedirectRouteForUser(role?: UserRole, prant?: PrantType): string {
  if (role === 'super_admin') return '/admin/super';
  if (role === 'state_admin') return '/admin/state';
  if (role === 'city_admin') return '/admin/city';
  if (role === 'prant_admin') {
    if (prant === 'Saurashtra') return '/admin/prant/saurashtra';
    return '/admin/prant/gujarat';
  }
  return '/dashboard';
}

function MainLayout() {
  const { isLoadingAuth, currentUser, currentMember } = useNMO();

  // Current client route: '/', '/login', '/dashboard', '/admin/super', '/admin/state', '/admin/prant/gujarat', '/admin/prant/saurashtra'
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const path = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';
    return path;
  });

  const [activeTab, setActiveTab] = useState<string>('home');
  const [memberActiveTab, setMemberActiveTab] = useState<'dashboard' | 'id-card' | 'profile' | 'events' | 'history' | 'certificates' | 'alerts'>('dashboard');
  const [isVerifyOpen, setIsVerifyOpen] = useState<boolean>(false);
  const [unauthorizedMessage, setUnauthorizedMessage] = useState<string | null>(null);

  // Synchronize route with browser history
  const navigate = (path: string) => {
    const cleanPath = path.toLowerCase().replace(/\/$/, '') || '/';
    if (window.location.pathname !== cleanPath) {
      window.history.pushState({}, '', cleanPath);
    }
    setCurrentRoute(cleanPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';
      setCurrentRoute(path);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Route Protection & Authorization Guard
  useEffect(() => {
    if (isLoadingAuth) return;

    // 1. If at login and already authenticated, auto-redirect to designated dashboard
    if (currentRoute === '/login' && currentUser) {
      const destination = getRedirectRouteForUser(currentUser.role, currentUser.prant);
      navigate(destination);
      return;
    }

    // 2. If accessing protected admin route
    if (currentRoute.startsWith('/admin')) {
      if (!currentUser) {
        setUnauthorizedMessage('Authentication required to access the Administrative Console. Please sign in.');
        navigate('/login');
        return;
      }

      // Check Super Admin route protection
      if (currentRoute === '/admin/super' && currentUser.role !== 'super_admin') {
        setUnauthorizedMessage(`Unauthorized access to /admin/super. Your account role (${currentUser.role}) has been redirected to your permitted console.`);
        navigate(getRedirectRouteForUser(currentUser.role, currentUser.prant));
        return;
      }

      // Check State Admin route protection
      if (currentRoute === '/admin/state' && currentUser.role !== 'super_admin' && currentUser.role !== 'state_admin') {
        setUnauthorizedMessage(`Unauthorized access to /admin/state. State Admin privileges required.`);
        navigate(getRedirectRouteForUser(currentUser.role, currentUser.prant));
        return;
      }

      // Check Gujarat Prant route protection
      if (currentRoute === '/admin/prant/gujarat') {
        if (currentUser.role === 'prant_admin' && currentUser.prant === 'Saurashtra') {
          setUnauthorizedMessage('Access Restricted: You are designated as Saurashtra Prant Admin only.');
          navigate('/admin/prant/saurashtra');
          return;
        }
        if (currentUser.role === 'member') {
          setUnauthorizedMessage('Administrative privileges required for Gujarat Prant.');
          navigate('/dashboard');
          return;
        }
      }

      // Check Saurashtra Prant route protection
      if (currentRoute === '/admin/prant/saurashtra') {
        if (currentUser.role === 'prant_admin' && currentUser.prant === 'Gujarat') {
          setUnauthorizedMessage('Access Restricted: You are designated as Gujarat Prant Admin only.');
          navigate('/admin/prant/gujarat');
          return;
        }
        if (currentUser.role === 'member') {
          setUnauthorizedMessage('Administrative privileges required for Saurashtra Prant.');
          navigate('/dashboard');
          return;
        }
      }
    }

    // 3. If accessing /dashboard
    if (currentRoute.startsWith('/dashboard')) {
      if (!currentUser && !currentMember) {
        setUnauthorizedMessage('Please sign in with your NMO credentials to access your Member Dashboard.');
        navigate('/login');
      }
    }
  }, [currentRoute, currentUser, currentMember, isLoadingAuth]);

  if (isLoadingAuth) {
    return <LoadingScreen />;
  }

  // --- VIEW 1: SINGLE UNIFIED LOGIN PAGE (/login) ---
  if (currentRoute === '/login') {
    return (
      <>
        {unauthorizedMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full px-4">
            <div className="p-3.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-between shadow-xl border border-amber-600">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{unauthorizedMessage}</span>
              </div>
              <button
                onClick={() => setUnauthorizedMessage(null)}
                className="p-1 hover:bg-amber-600/30 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <LoginPage
          onSuccessRedirect={(resolvedRole) => {
            const dest = getRedirectRouteForUser(resolvedRole, currentUser?.prant);
            navigate(dest);
          }}
          onNavigateHome={() => navigate('/')}
        />
      </>
    );
  }

  // --- VIEW 2: SUPER ADMIN DASHBOARD (/admin/super) ---
  if (currentRoute === '/admin/super') {
    return (
      <>
        <AdminPortal portalScope="super" onBackToSite={() => navigate('/')} />
      </>
    );
  }

  // --- VIEW 3: STATE ADMIN DASHBOARD (/admin/state) ---
  if (currentRoute === '/admin/state') {
    return (
      <>
        <AdminPortal portalScope="state" onBackToSite={() => navigate('/')} />
      </>
    );
  }

  // --- VIEW 4: GUJARAT PRANT ADMIN (/admin/prant/gujarat) ---
  if (currentRoute === '/admin/prant/gujarat') {
    return (
      <>
        <AdminPortal portalScope="prant/gujarat" onBackToSite={() => navigate('/')} />
      </>
    );
  }

  // --- VIEW 5: SAURASHTRA PRANT ADMIN (/admin/prant/saurashtra) ---
  if (currentRoute === '/admin/prant/saurashtra') {
    return (
      <>
        <AdminPortal portalScope="prant/saurashtra" onBackToSite={() => navigate('/')} />
      </>
    );
  }

  // --- VIEW 6: CITY ADMIN (/admin/city) ---
  if (currentRoute === '/admin/city' || currentRoute.startsWith('/admin/city/')) {
    return (
      <>
        <AdminPortal portalScope="city" onBackToSite={() => navigate('/')} />
      </>
    );
  }

  // --- VIEW 6: MEMBER DASHBOARD (/dashboard) ---
  if (currentRoute === '/dashboard') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar
          activeTab={memberActiveTab === 'dashboard' ? 'member-portal' : memberActiveTab}
          setActiveTab={(tab) => {
            if (tab === 'home') {
              navigate('/');
            } else if (tab === 'contact') {
              navigate('/contact');
            } else if (tab === 'admin-portal') {
              navigate(getRedirectRouteForUser(currentUser?.role, currentUser?.prant));
            } else if (['about', 'events', 'gallery', 'activities'].includes(tab)) {
              navigate('/');
              setTimeout(() => {
                const el = document.getElementById(tab);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 120);
            } else if (tab === 'member-portal' || tab === 'dashboard') {
              setMemberActiveTab('dashboard');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (['id-card', 'profile', 'certificates', 'history', 'alerts'].includes(tab)) {
              setMemberActiveTab(tab as any);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          onOpenAuth={() => navigate('/login')}
          onOpenVerify={() => setIsVerifyOpen(true)}
        />
        <main className="flex-1">
          <MemberDashboard
            initialTab={memberActiveTab}
            onTabChange={(t) => setMemberActiveTab(t as any)}
          />
        </main>
        <Footer
          onNavigate={(tab) => {
            if (tab === 'home') navigate('/');
            else if (tab === 'contact') navigate('/contact');
            else {
              navigate('/');
              setTimeout(() => {
                const el = document.getElementById(tab);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }
          }}
          onOpenVerify={() => setIsVerifyOpen(true)}
          onOpenAuth={() => navigate('/login')}
        />
        <PublicVerifyModal
          isOpen={isVerifyOpen}
          onClose={() => setIsVerifyOpen(false)}
        />
      </div>
    );
  }

  // --- VIEW 7: CONTACT US PAGE (/contact) ---
  if (currentRoute === '/contact' || activeTab === 'contact') {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-red-700 selection:text-white">
        <Navbar
          activeTab="contact"
          setActiveTab={(tab) => {
            if (tab === 'contact') {
              navigate('/contact');
            } else if (tab === 'home') {
              setActiveTab('home');
              navigate('/');
            } else if (tab === 'member-portal' || ['id-card', 'certificates', 'profile', 'history', 'alerts'].includes(tab)) {
              setMemberActiveTab(tab === 'member-portal' ? 'dashboard' : (tab as any));
              navigate('/dashboard');
            } else if (tab === 'admin-portal') {
              navigate(getRedirectRouteForUser(currentUser?.role, currentUser?.prant));
            } else {
              setActiveTab(tab);
              navigate('/');
              setTimeout(() => {
                const el = document.getElementById(tab);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 120);
            }
          }}
          onOpenAuth={() => navigate('/login')}
          onOpenVerify={() => setIsVerifyOpen(true)}
        />
        <main className="flex-1">
          <ContactUsPage
            onNavigateHome={() => {
              setActiveTab('home');
              navigate('/');
            }}
            onNavigate={(tab) => {
              if (tab === 'home') {
                setActiveTab('home');
                navigate('/');
              } else if (tab === 'contact') {
                navigate('/contact');
              } else {
                setActiveTab(tab);
                navigate('/');
                setTimeout(() => {
                  const el = document.getElementById(tab);
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 120);
              }
            }}
          />
        </main>
        <Footer
          onNavigate={(tab) => {
            if (tab === 'home') {
              setActiveTab('home');
              navigate('/');
            } else if (tab === 'contact') {
              navigate('/contact');
            } else {
              setActiveTab(tab);
              navigate('/');
              setTimeout(() => {
                const el = document.getElementById(tab);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 120);
            }
          }}
          onOpenVerify={() => setIsVerifyOpen(true)}
          onOpenAuth={() => navigate('/login')}
        />
        <PublicVerifyModal
          isOpen={isVerifyOpen}
          onClose={() => setIsVerifyOpen(false)}
        />
      </div>
    );
  }

  // --- VIEW 8: PUBLIC WEBSITE (/) ---
  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 selection:bg-red-700 selection:text-white">
      {/* Route Protection Notice (if redirected) */}
      {unauthorizedMessage && (
        <div className="bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 max-w-5xl mx-auto w-full">
            <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0" />
            <span className="font-semibold">{unauthorizedMessage}</span>
          </div>
          <button
            onClick={() => setUnauthorizedMessage(null)}
            className="text-amber-900 font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 'contact') {
            navigate('/contact');
          } else if (tab === 'member-portal' || ['id-card', 'certificates', 'profile', 'history', 'alerts'].includes(tab)) {
            setMemberActiveTab(tab === 'member-portal' ? 'dashboard' : (tab as any));
            navigate('/dashboard');
          } else if (tab === 'admin-portal') {
            navigate(getRedirectRouteForUser(currentUser?.role, currentUser?.prant));
          } else {
            setActiveTab(tab);
            if (['about', 'events', 'gallery', 'activities'].includes(tab)) {
              const el = document.getElementById(tab);
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
        }}
        onOpenAuth={() => navigate('/login')}
        onOpenVerify={() => setIsVerifyOpen(true)}
      />

      {/* Main Public Content */}
      <main className="flex-1">
        {/* Active Announcements / Alerts from Firestore */}
        <AnnouncementsTicker />

        {/* Full-Width Background Hero Slider */}
        <HeroSlider
          onNavigate={(tab) => {
            setActiveTab(tab);
            const el = document.getElementById(tab);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          onOpenVerify={() => setIsVerifyOpen(true)}
          onOpenAuth={() => navigate('/login')}
        />

        {/* Dynamic Verified Statistics Strip */}
        <DynamicStats />

        {/* About Section */}
        <AboutSection />

        {/* Dynamic Events & Conferences */}
        <EventsSection onOpenAuth={() => navigate('/login')} />

        {/* Core Activities */}
        <ActivitiesSection />

        {/* Media & Seva Gallery */}
        <GallerySection />
      </main>

      {/* Footer */}
      <Footer
        onNavigate={(tab) => {
          if (tab === 'home') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else if (tab === 'contact') {
            navigate('/contact');
          } else {
            const el = document.getElementById(tab);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }
        }}
        onOpenVerify={() => setIsVerifyOpen(true)}
        onOpenAuth={() => navigate('/login')}
      />

      {/* Public Member ID Verification Modal */}
      <PublicVerifyModal
        isOpen={isVerifyOpen}
        onClose={() => setIsVerifyOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <NMOProvider>
      <MainLayout />
    </NMOProvider>
  );
}
