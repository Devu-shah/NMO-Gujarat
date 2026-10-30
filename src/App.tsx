/**
 * National Medicos Organisation (NMO) Gujarat
 * Official Portal & Unified Management System
 * Motto: "प्राणिनाम् आर्तिनाशनम्"
 */

import React, { useState, useEffect, useMemo } from 'react';
import { NMOProvider, useNMO } from './context/NMOContext';
import { Navbar } from './components/Navbar';
import { HeroSlider } from './components/HeroSlider';
import { DynamicStats } from './components/DynamicStats';
import { AnnouncementsTicker } from './components/AnnouncementsTicker';
import { EventsSection } from './components/EventsSection';
import { AboutSection } from './components/AboutSection';
import { GallerySection } from './components/GallerySection';
import { ActivitiesSection } from './components/ActivitiesSection';
import { Footer } from './components/Footer';
import { PublicVerifyModal } from './components/PublicVerifyModal';
import { LoginPage } from './components/LoginPage';
import { LoadingScreen } from './components/LoadingScreen';

// Lazy-loaded routes for code splitting and initial bundle size optimization
const DedicatedGalleryPage = React.lazy(() =>
  import('./components/DedicatedGalleryPage').then((m) => ({ default: m.DedicatedGalleryPage }))
);
const ContactUsPage = React.lazy(() =>
  import('./components/ContactUsPage').then((m) => ({ default: m.ContactUsPage }))
);
const MemberDashboard = React.lazy(() =>
  import('./components/MemberDashboard').then((m) => ({ default: m.MemberDashboard }))
);
const AdminPortal = React.lazy(() =>
  import('./components/admin/AdminPortal').then((m) => ({ default: m.AdminPortal }))
);
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

  // Determine active tab for common Navbar (Must be called before any early return)
  const currentActiveNavTab = useMemo(() => {
    if (currentRoute === '/contact') return 'contact';
    if (currentRoute === '/gallery' || currentRoute === '/gallery-archive') return 'gallery';
    if (currentRoute === '/login') return 'login';
    if (currentRoute.startsWith('/admin')) return 'admin-portal';
    if (currentRoute.startsWith('/dashboard')) {
      if (memberActiveTab === 'id-card' || memberActiveTab === 'certificates') {
        return memberActiveTab;
      }
      return 'member-portal';
    }
    return activeTab;
  }, [currentRoute, activeTab, memberActiveTab]);

  if (isLoadingAuth) {
    return <LoadingScreen />;
  }

  // Unified tab & link navigation handler common to all pages
  const handleNavigate = (tab: string) => {
    if (tab === 'home') {
      setActiveTab('home');
      if (currentRoute === '/') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        navigate('/');
      }
    } else if (tab === 'contact') {
      setActiveTab('contact');
      navigate('/contact');
    } else if (tab === 'gallery-archive') {
      setActiveTab('gallery');
      navigate('/gallery');
    } else if (tab === 'login') {
      navigate('/login');
    } else if (tab === 'admin-portal') {
      if (currentUser && currentUser.role !== 'member') {
        navigate(getRedirectRouteForUser(currentUser.role, currentUser.prant));
      } else {
        navigate('/login');
      }
    } else if (tab === 'member-portal' || tab === 'dashboard') {
      if (currentUser || currentMember) {
        setMemberActiveTab('dashboard');
        navigate('/dashboard');
      } else {
        navigate('/login');
      }
    } else if (['id-card', 'profile', 'certificates', 'events', 'history', 'alerts'].includes(tab)) {
      if (currentUser || currentMember) {
        setMemberActiveTab(tab as any);
        navigate('/dashboard');
      } else {
        navigate('/login');
      }
    } else if (['about', 'events', 'gallery', 'activities'].includes(tab)) {
      setActiveTab(tab);
      if (currentRoute === '/') {
        const el = document.getElementById(tab);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate('/');
        setTimeout(() => {
          const el = document.getElementById(tab);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 120);
      }
    } else {
      navigate('/');
    }
  };

  // --- ROUTE 1: UNIFIED LOGIN PAGE (/login) ---
  if (currentRoute === '/login') {
    return (
      <div className="min-h-screen flex flex-col">
        {unauthorizedMessage && (
          <div className="bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-xs flex items-center justify-between sticky top-0 z-50">
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
        <LoginPage
          onSuccessRedirect={(resolvedRole) => {
            const dest = getRedirectRouteForUser(resolvedRole, currentUser?.prant);
            navigate(dest);
          }}
          onNavigateHome={() => navigate('/')}
        />
      </div>
    );
  }

  // --- ROUTE 2-6: DEDICATED ADMIN PORTALS (/admin/*) ---
  if (currentRoute === '/admin/super') {
    return (
      <React.Suspense fallback={<LoadingScreen />}>
        <AdminPortal portalScope="super" onBackToSite={() => navigate('/')} />
      </React.Suspense>
    );
  }

  if (currentRoute === '/admin/state') {
    return (
      <React.Suspense fallback={<LoadingScreen />}>
        <AdminPortal portalScope="state" onBackToSite={() => navigate('/')} />
      </React.Suspense>
    );
  }

  if (currentRoute === '/admin/prant/gujarat') {
    return (
      <React.Suspense fallback={<LoadingScreen />}>
        <AdminPortal portalScope="prant/gujarat" onBackToSite={() => navigate('/')} />
      </React.Suspense>
    );
  }

  if (currentRoute === '/admin/prant/saurashtra') {
    return (
      <React.Suspense fallback={<LoadingScreen />}>
        <AdminPortal portalScope="prant/saurashtra" onBackToSite={() => navigate('/')} />
      </React.Suspense>
    );
  }

  if (currentRoute === '/admin/city' || currentRoute.startsWith('/admin/city/')) {
    return (
      <React.Suspense fallback={<LoadingScreen />}>
        <AdminPortal portalScope="city" onBackToSite={() => navigate('/')} />
      </React.Suspense>
    );
  }

  if (currentRoute.startsWith('/admin')) {
    return (
      <React.Suspense fallback={<LoadingScreen />}>
        <AdminPortal onBackToSite={() => navigate('/')} />
      </React.Suspense>
    );
  }

  // --- ROUTE 7: MEMBER DASHBOARD (/dashboard) ---
  if (currentRoute.startsWith('/dashboard')) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar
          activeTab={currentActiveNavTab}
          setActiveTab={handleNavigate}
          onOpenAuth={() => navigate('/login')}
          onOpenVerify={() => setIsVerifyOpen(true)}
        />
        <main className="flex-1">
          <React.Suspense fallback={<LoadingScreen />}>
            <MemberDashboard
              initialTab={memberActiveTab}
              onTabChange={(t) => setMemberActiveTab(t as any)}
            />
          </React.Suspense>
        </main>
        <Footer
          onNavigate={handleNavigate}
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

  // --- ROUTE 8: CONTACT US PAGE (/contact) ---
  if (currentRoute === '/contact' || activeTab === 'contact') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar
          activeTab="contact"
          setActiveTab={handleNavigate}
          onOpenAuth={() => navigate('/login')}
          onOpenVerify={() => setIsVerifyOpen(true)}
        />
        <main className="flex-1">
          <React.Suspense fallback={<LoadingScreen />}>
            <ContactUsPage
              onNavigateHome={() => {
                setActiveTab('home');
                navigate('/');
              }}
              onNavigate={handleNavigate}
            />
          </React.Suspense>
        </main>
        <Footer
          onNavigate={handleNavigate}
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

  // --- ROUTE 8.5: DEDICATED FULL GALLERY ARCHIVE (/gallery or /gallery-archive) ---
  if (currentRoute === '/gallery' || currentRoute === '/gallery-archive') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <Navbar
          activeTab="gallery"
          setActiveTab={handleNavigate}
          onOpenAuth={() => navigate('/login')}
          onOpenVerify={() => setIsVerifyOpen(true)}
        />
        <main className="flex-1">
          <React.Suspense fallback={<LoadingScreen />}>
            <DedicatedGalleryPage
              onBackToHome={() => {
                setActiveTab('home');
                navigate('/');
              }}
            />
          </React.Suspense>
        </main>
        <Footer
          onNavigate={handleNavigate}
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

  // --- ROUTE 9: MAIN PUBLIC WEBSITE (/) ---
  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 selection:bg-red-700 selection:text-white overflow-x-hidden w-full max-w-full">
      {/* Route Protection Notice (if redirected) */}
      {unauthorizedMessage && (
        <div className="bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-xs flex items-center justify-between sticky top-0 z-50">
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

      {/* Main Public Website Header & Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleNavigate}
        onOpenAuth={() => navigate('/login')}
        onOpenVerify={() => setIsVerifyOpen(true)}
      />

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

        {/* Media & Seva Gallery (6 Featured on Home; Full archive link) */}
        <GallerySection
          onOpenFullGallery={() => {
            setActiveTab('gallery');
            navigate('/gallery');
          }}
        />
      </main>

      {/* Main Public Website Footer */}
      <Footer
        onNavigate={handleNavigate}
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
