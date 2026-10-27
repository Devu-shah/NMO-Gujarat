import React, { useState } from 'react';
import { useNMO } from '../context/NMOContext';
import { MemberIdCard } from './MemberIdCard';
import { MemberProfile } from './MemberProfile';
import { NMOEvent } from '../types/nmo';
import {
  LayoutDashboard,
  CreditCard,
  UserCircle,
  Calendar,
  History,
  Bell,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  MapPin,
  Users,
  AlertCircle,
  Download,
  Search,
  X,
  ExternalLink,
  Copy,
  Printer,
  ChevronDown,
  ChevronRight,
  Building2,
  Globe,
  XCircle,
  Award,
  Upload,
  Eye,
  LifeBuoy
} from 'lucide-react';
import { NmoLogo } from './NmoLogo';
import { MemberCertificatesTab } from './MemberCertificatesTab';
import { UploadCertificateModal } from './UploadCertificateModal';
import { ShowCertificateModal } from './ShowCertificateModal';
import { TicketTrackerModal } from './TicketTrackerModal';
import { setMemberIdCookie } from '../lib/memberCookie';

interface MemberDashboardProps {
  initialTab?: 'dashboard' | 'id-card' | 'profile' | 'events' | 'history' | 'certificates' | 'alerts';
  onTabChange?: (tab: string) => void;
}

export const MemberDashboard: React.FC<MemberDashboardProps> = ({
  initialTab,
  onTabChange
}) => {
  const {
    currentUser,
    currentMember,
    logout,
    events,
    cities,
    getMemberRegistrations,
    announcements,
    registerForEvent,
    cancelEventRegistration,
    exportEventParticipantsToCSV,
    updateParticipantApproval,
    updateParticipantAttendance
  } = useNMO();

  const [activeTab, setActiveTabState] = useState<'dashboard' | 'id-card' | 'profile' | 'events' | 'history' | 'certificates' | 'alerts'>(initialTab || 'dashboard');

  const setActiveTab = (tab: 'dashboard' | 'id-card' | 'profile' | 'events' | 'history' | 'certificates' | 'alerts') => {
    setActiveTabState(tab);
    if (onTabChange) onTabChange(tab);
  };

  React.useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTabState(initialTab);
    }
  }, [initialTab]);

  React.useEffect(() => {
    const memNo = currentMember?.membershipNumber || currentUser?.membershipNumber;
    if (memNo) {
      setMemberIdCookie(memNo);
    }
  }, [currentMember?.membershipNumber, currentUser?.membershipNumber]);

  // Certificate Modal States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isShowCertModalOpen, setIsShowCertModalOpen] = useState<boolean>(false);
  const [isTicketTrackerOpen, setIsTicketTrackerOpen] = useState<boolean>(false);
  const [certModalEvent, setCertModalEvent] = useState<{ id?: string; title?: string }>({});
  const [rsvpSubmittingId, setRsvpSubmittingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [rsvpFeedback, setRsvpFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Show Participants Modal State (Admin only)
  const [selectedParticipantsEvent, setSelectedParticipantsEvent] = useState<NMOEvent | null>(null);
  const [searchParticipant, setSearchParticipant] = useState<string>('');

  // Event Tier Dropdowns State (Exact requested order: City, Branch, State, National)
  const [selectedTierFilter, setSelectedTierFilter] = useState<'All' | 'City' | 'Branch' | 'State' | 'National'>('All');
  const [cityEventsOpen, setCityEventsOpen] = useState(true);
  const [branchEventsOpen, setBranchEventsOpen] = useState(true);
  const [stateEventsOpen, setStateEventsOpen] = useState(true);
  const [nationalEventsOpen, setNationalEventsOpen] = useState(true);

  // City-Wise Filter & City Search Bar State
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('All');
  const [citySearchQuery, setCitySearchQuery] = useState<string>('');

  // Extract cities with their active event counts
  const citiesWithEventCount = React.useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => {
      if (e.city && e.city.trim()) {
        const c = e.city.trim();
        counts[c] = (counts[c] || 0) + 1;
      }
    });
    return counts;
  }, [events]);

  const activeCitiesList = React.useMemo(() => {
    const set = new Set<string>();
    (cities || []).forEach((c) => {
      if (c && c.trim()) set.add(c.trim());
    });
    events.forEach((e) => {
      if (e.city && e.city.trim()) set.add(e.city.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cities, events]);

  // Filter events city-wise (both from selected dropdown / pills and search query)
  const cityFilteredEvents = React.useMemo(() => {
    return events.filter((e) => {
      const eCity = (e.city || '').toLowerCase().trim();

      if (selectedCityFilter && selectedCityFilter !== 'All') {
        if (eCity !== selectedCityFilter.toLowerCase().trim()) {
          return false;
        }
      }

      if (citySearchQuery && citySearchQuery.trim()) {
        const q = citySearchQuery.toLowerCase().trim();
        const inCity = eCity.includes(q);
        const inVenue = (e.venue || '').toLowerCase().includes(q);
        const inTitle = (e.title || '').toLowerCase().includes(q);
        if (!inCity && !inVenue && !inTitle) {
          return false;
        }
      }

      return true;
    });
  }, [events, selectedCityFilter, citySearchQuery]);

  const getEventTier = (evt: NMOEvent): 'City' | 'Branch' | 'State' | 'National' => {
    if (evt.tier) return evt.tier;
    const text = (evt.title + ' ' + (evt.description || '')).toLowerCase();
    if (text.includes('national') || text.includes('all india')) return 'National';
    if (text.includes('branch') || evt.branch) return 'Branch';
    if (evt.city && evt.city.toLowerCase() !== 'all' && !text.includes('state')) return 'City';
    return 'State';
  };

  const cityEvents = React.useMemo(() => cityFilteredEvents.filter((e) => getEventTier(e) === 'City'), [cityFilteredEvents]);
  const branchEvents = React.useMemo(() => cityFilteredEvents.filter((e) => getEventTier(e) === 'Branch'), [cityFilteredEvents]);
  const stateEvents = React.useMemo(() => cityFilteredEvents.filter((e) => getEventTier(e) === 'State'), [cityFilteredEvents]);
  const nationalEvents = React.useMemo(() => cityFilteredEvents.filter((e) => getEventTier(e) === 'National'), [cityFilteredEvents]);

  const isAdmin = Boolean(currentUser && currentUser.role && currentUser.role !== 'member');
  const adminPanelLink =
    currentUser?.role === 'super_admin'
      ? '/admin/super'
      : currentUser?.role === 'state_admin'
      ? '/admin/state'
      : currentUser?.role === 'prant_admin'
      ? currentUser?.prant === 'Saurashtra'
        ? '/admin/prant/saurashtra'
        : '/admin/prant/gujarat'
      : '/admin/state';

  const handleCopyEmails = (participants: any[]) => {
    const emails = participants.map((p) => p.email).filter(Boolean);
    if (emails.length === 0) {
      alert('No email addresses recorded for registered participants.');
      return;
    }
    navigator.clipboard.writeText(emails.join(', '));
    setCopyFeedback(`Copied ${emails.length} email addresses to clipboard!`);
    setTimeout(() => setCopyFeedback(null), 3000);
  };

  const handleCancelRegistration = async (eventId: string, eventTitle: string) => {
    const memberNo = currentMember?.membershipNumber || currentUser?.membershipNumber;
    if (!memberNo) return;
    if (!window.confirm(`Are you sure you want to cancel your registration for "${eventTitle}"?`)) {
      return;
    }
    setCancellingId(eventId);
    setRsvpFeedback(null);
    try {
      await cancelEventRegistration(eventId, memberNo);
      setRsvpFeedback({
        message: `Your registration for "${eventTitle}" has been cancelled successfully.`,
        type: 'success'
      });
      setTimeout(() => setRsvpFeedback(null), 5000);
    } catch (err: any) {
      setRsvpFeedback({
        message: err.message || 'Failed to cancel registration.',
        type: 'error'
      });
    } finally {
      setCancellingId(null);
    }
  };

  const handleRsvp = async (eventId: string, eventTitle: string) => {
    if (!currentMember) return;
    setRsvpSubmittingId(eventId);
    setRsvpFeedback(null);
    try {
      await registerForEvent(
        eventId,
        currentMember.membershipNumber,
        currentMember.name
      );
      setRsvpFeedback({
        message: `Registration Confirmed for "${eventTitle}"! Registration recorded with status: Pending Review in Firestore ('event_registrations').`,
        type: 'success'
      });
      setTimeout(() => setRsvpFeedback(null), 6000);
    } catch (err: any) {
      setRsvpFeedback({
        message: err.message || 'Failed to submit registration.',
        type: 'error'
      });
    } finally {
      setRsvpSubmittingId(null);
    }
  };

  if (!currentMember) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <NmoLogo size="lg" className="mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-800">
          No Member Record Linked
        </h3>
        <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
          Please link your NMO Gujarat Membership Number to view your dashboard, digital ID card, and registration history.
        </p>
      </div>
    );
  }

  const myRegistrations = getMemberRegistrations(currentMember.membershipNumber);
  const attendedCount = myRegistrations.filter((r) => r.attendanceStatus === 'Attended').length;

  const memberAlerts = announcements.filter(
    (a) => a.active && (a.targetAudience === 'All' || a.targetAudience === 'Members')
  );

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-blue-800 text-white flex items-center justify-center font-bold text-xl shadow-md shrink-0">
              {currentMember.name.replace('Dr. ', '')[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900">
                  {currentMember.name}
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{currentMember.status}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1 font-medium">
                <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  {currentMember.membershipNumber}
                </span>
                <span>·</span>
                <span className="text-red-700 font-semibold">{currentMember.prant} Prant</span>
                <span>·</span>
                <span>{currentMember.medicalCollege}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-end md:self-center">
            <button
              type="button"
              onClick={() => {
                setCertModalEvent({});
                setIsUploadModalOpen(true);
              }}
              className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Upload your certificate (JPG/PNG) to NMO Repository"
            >
              <Award className="w-4 h-4 text-emerald-200" />
              <span>Upload Certificate (JPG/PNG)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCertModalEvent({});
                setIsShowCertModalOpen(true);
              }}
              className="px-3 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Show my verified certificates"
            >
              <CheckCircle2 className="w-4 h-4 text-blue-200" />
              <span>Show Certificates</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('id-card')}
              className="px-3.5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              <span>My ID Card</span>
            </button>
            <button
              type="button"
              onClick={() => setIsTicketTrackerOpen(true)}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Track inquiries, support tickets, and approve administrative solutions"
            >
              <LifeBuoy className="w-4 h-4 text-slate-950" />
              <span>Support Tickets</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 mb-8 overflow-x-auto gap-2">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'id-card', label: 'My ID Card', icon: CreditCard },
            { id: 'profile', label: 'My Profile', icon: UserCircle },
            { id: 'events', label: 'Events & Registration', icon: Calendar },
            { id: 'history', label: `My History (${myRegistrations.length})`, icon: History },
            { id: 'certificates', label: 'My Certificates', icon: Award },
            { id: 'alerts', label: `Alerts (${memberAlerts.length})`, icon: Bell }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-red-700 text-red-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Dashboard Overview */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Quick Stat Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-semibold block">
                  Membership Status
                </span>
                <div className="text-xl font-black text-emerald-700 mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{currentMember.status}</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Verified Medico Record
                </span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-semibold block">
                  Events Attended
                </span>
                <div className="text-2xl font-black text-blue-700 mt-1">
                  {attendedCount}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Conferences & Seva Camps
                </span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-semibold block">
                  Total Registrations
                </span>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {myRegistrations.length}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Active in State Programs
                </span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-semibold block">
                  Assigned Prant
                </span>
                <div className="text-xl font-black text-red-700 mt-1">
                  {currentMember.prant}
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  State Chapter Division
                </span>
              </div>
            </div>

            {/* Quick Actions Strip for Certificates */}
            <div className="bg-gradient-to-r from-red-950 via-slate-900 to-blue-950 rounded-2xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm border border-slate-800">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm tracking-tight text-white flex items-center gap-2">
                    <span>Official Certificate Repository</span>
                    <span className="text-[10px] bg-amber-400 text-slate-950 font-extrabold px-2 py-0.5 rounded-full">Verified Record</span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Upload your participation certificates (JPG/PNG only) or retrieve your official certificates issued to Membership ID: <strong className="font-mono text-amber-300">{currentMember.membershipNumber}</strong>.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsShowCertModalOpen(true)}
                  className="px-4 py-2 bg-white text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4 text-red-700" />
                  <span>Show Certificates</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCertModalEvent({});
                    setIsUploadModalOpen(true);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload (JPG/PNG)</span>
                </button>
              </div>
            </div>

            {/* Upcoming Registered Events & Recent Announcements */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: My Registrations */}
              <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-900 text-base">
                    My Upcoming Event Registrations
                  </h3>
                  <button
                    onClick={() => setActiveTab('events')}
                    className="text-xs font-semibold text-red-700 hover:underline flex items-center gap-1"
                  >
                    <span>Browse Events</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {myRegistrations.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    You have not registered for any upcoming events yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myRegistrations.map((reg) => {
                      const evt = events.find((e) => e.eventId === reg.eventId);
                      return (
                        <div
                          key={reg.registrationId}
                          className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-4"
                        >
                          <div>
                            <h4 className="font-bold text-sm text-slate-900">
                              {evt?.title || reg.eventId}
                            </h4>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                              <span>Registered on {reg.registrationDate}</span>
                              {evt?.venue && <span>· {evt.venue}</span>}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Registered
                            </span>
                            {reg.attendanceStatus === 'Attended' && (
                              <span className="block text-[10px] text-blue-700 font-bold mt-1">
                                ✓ Present (Attended)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Alerts */}
              <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                <h3 className="font-bold text-slate-900 text-base mb-4">
                  Active Alerts & Member Circulars
                </h3>

                <div className="space-y-3">
                  {memberAlerts.map((ann) => (
                    <div
                      key={ann.id}
                      className="p-3.5 rounded-lg bg-amber-50/60 border border-amber-200/80"
                    >
                      <h4 className="font-bold text-xs text-slate-900">
                        {ann.title}
                      </h4>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-3">
                        {ann.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: ID Card */}
        {activeTab === 'id-card' && <MemberIdCard member={currentMember} />}

        {/* Tab 3: Profile */}
        {activeTab === 'profile' && <MemberProfile member={currentMember} />}

        {/* Tab 4: Events Browser */}
        {activeTab === 'events' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  NMO Events & Programs Portal
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Browse and register for medical conferences, seva camps, symposiums, and workshops across City, Branch, State, and National tiers.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Select Tier:</label>
                <select
                  value={selectedTierFilter}
                  onChange={(e) => setSelectedTierFilter(e.target.value as any)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-red-600"
                >
                  <option value="All">All Tiers ({cityFilteredEvents.length} Events)</option>
                  <option value="City">1. City Events ({cityEvents.length})</option>
                  <option value="Branch">2. Branch Events ({branchEvents.length})</option>
                  <option value="State">3. State Events ({stateEvents.length})</option>
                  <option value="National">4. National Events ({nationalEvents.length})</option>
                </select>
              </div>
            </div>

            {/* City-Wise Filter & City Search Bar */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3.5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Search Bar for Cities */}
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={citySearchQuery}
                    onChange={(e) => {
                      setCitySearchQuery(e.target.value);
                      if (e.target.value && selectedCityFilter !== 'All') {
                        setSelectedCityFilter('All');
                      }
                    }}
                    placeholder="Search events by city (e.g. Ahmedabad, Surat, Rajkot, Vadodara...)"
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-red-600 focus:bg-white focus:outline-hidden transition-all"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  {citySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCitySearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown to Filter Events City-Wise */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700 whitespace-nowrap flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-red-600" />
                    <span>Filter City:</span>
                  </label>
                  <select
                    value={selectedCityFilter}
                    onChange={(e) => {
                      setSelectedCityFilter(e.target.value);
                      if (e.target.value !== 'All') {
                        setCitySearchQuery('');
                      }
                    }}
                    className="px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-red-600 focus:outline-hidden cursor-pointer"
                  >
                    <option value="All">All Cities ({events.length} total events)</option>
                    {activeCitiesList.map((cityName) => {
                      const count = citiesWithEventCount[cityName] || 0;
                      return (
                        <option key={cityName} value={cityName}>
                          {cityName} {count > 0 ? `(${count} event${count === 1 ? '' : 's'})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Quick City Selector Chips / Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  Quick City:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCityFilter('All');
                    setCitySearchQuery('');
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCityFilter === 'All' && !citySearchQuery
                      ? 'bg-red-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All Cities
                </button>
                {['Ahmedabad', 'Surat', 'Rajkot', 'Vadodara', 'Jamnagar', 'Bhavnagar'].map((c) => {
                  const isSelected = selectedCityFilter.toLowerCase() === c.toLowerCase();
                  const count = citiesWithEventCount[c] || 0;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setSelectedCityFilter(c);
                        setCitySearchQuery('');
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-red-700 text-white font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>{c}</span>
                      {count > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}

                {(selectedCityFilter !== 'All' || citySearchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCityFilter('All');
                      setCitySearchQuery('');
                    }}
                    className="ml-auto text-xs font-bold text-red-700 hover:text-red-800 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear Filter</span>
                  </button>
                )}
              </div>

              {/* Active Filter Status Line */}
              {(selectedCityFilter !== 'All' || citySearchQuery) && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 text-[11px] font-bold">
                      Filtered: {selectedCityFilter !== 'All' ? selectedCityFilter : citySearchQuery}
                    </span>
                    <span className="text-slate-500 text-xs">
                      Found <strong>{cityFilteredEvents.length}</strong> event{cityFilteredEvents.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {cityFilteredEvents.length === 0 && (
                    <span className="text-amber-700 font-semibold text-xs">
                      No active events found in this city. Try selecting another city.
                    </span>
                  )}
                </div>
              )}
            </div>

            {rsvpFeedback && (
              <div
                className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
                  rsvpFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {rsvpFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  )}
                  <span className="font-medium leading-relaxed">{rsvpFeedback.message}</span>
                </div>
                <button
                  onClick={() => setRsvpFeedback(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Reusable Event Card Helper */}
            {(() => {
              const renderCard = (evt: NMOEvent) => {
                const reg = myRegistrations.find((r) => r.eventId === evt.eventId);
                const isRegistered = !!reg;
                const isSubmitting = rsvpSubmittingId === evt.eventId;
                const participantCount = (evt.participants || []).length;

                return (
                  <div
                    key={evt.eventId}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between"
                  >
                    <div>
                      {/* Event Header badges */}
                      <div className="flex items-center justify-between text-xs mb-3">
                        <span className="font-bold text-red-700 bg-red-50 px-2.5 py-0.5 rounded-full">
                          {evt.tier || getEventTier(evt)} • {evt.prant} Prant
                        </span>
                        <span className="text-slate-500 font-medium flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {evt.date}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h4 className="font-bold text-slate-900 text-base mb-2 leading-snug">
                        {evt.title}
                      </h4>
                      <p className="text-xs text-slate-600 line-clamp-3 mb-4 leading-relaxed">
                        {evt.description}
                      </p>

                      {/* Location Details */}
                      <div className="space-y-1.5 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span className="font-medium text-slate-700 truncate">
                            {evt.venue}, {evt.city}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                          {isAdmin ? (
                            <span className="flex items-center gap-1 font-medium text-slate-700">
                              <Users className="w-3 h-3 text-slate-400" />
                              <span>{participantCount} medicos registered</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-500">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Registration Open</span>
                            </span>
                          )}
                          <span className="text-emerald-700 font-semibold">
                            {evt.status || 'Active'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Event Card Action Area */}
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                      {/* Show Participants Button - Accessible only to Admins */}
                      {isAdmin && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedParticipantsEvent(evt);
                              setSearchParticipant('');
                            }}
                            className="flex-1 py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            title="Show participants registered for this event (Admin View)"
                          >
                            <Users className="w-3.5 h-3.5 text-blue-600" />
                            <span>Show Participants ({participantCount})</span>
                          </button>

                          <a
                            href={`${adminPanelLink}?section=events&eventId=${evt.eventId}`}
                            className="px-2.5 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Open in Admin Panel"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Admin Desk</span>
                          </a>
                        </div>
                      )}

                      {/* Registration Button / Status & Cancel Registration */}
                      {isRegistered ? (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>Registered</span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900">
                              Confirmed
                            </span>
                          </div>
                          {reg?.attendanceStatus === 'Attended' && (
                            <div className="flex items-center justify-between text-[10px] text-blue-700 font-bold">
                              <span>Attendance:</span>
                              <span>✓ Present (Attended)</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCancelRegistration(evt.eventId, evt.title)}
                            disabled={cancellingId === evt.eventId}
                            className="w-full mt-1.5 py-1.5 px-3 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {cancellingId === evt.eventId ? (
                              <>
                                <div className="w-3 h-3 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                                <span>Cancelling...</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>Cancel Registration</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRsvp(evt.eventId, evt.title)}
                          disabled={isSubmitting}
                          className="w-full py-2.5 px-4 bg-red-700 hover:bg-red-800 active:scale-[0.99] disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {isSubmitting ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Registering...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Register Now</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              };

              return (
                <div className="space-y-6">
                  {/* DROPDOWN 1: CITY EVENTS */}
                  {(selectedTierFilter === 'All' || selectedTierFilter === 'City') && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setCityEventsOpen(!cityEventsOpen)}
                        className="w-full p-4 sm:p-5 flex items-center justify-between text-left bg-slate-50/70 hover:bg-slate-100/80 transition-colors border-b border-slate-200 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-sm">
                            <MapPin className="w-4 h-4 text-blue-700" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                                1. City Events
                              </h4>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                {cityEvents.length} Events
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              City & district chapter workshops, health screening camps, and local CME seminars
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 font-semibold text-xs">
                          <span className="hidden sm:inline">{cityEventsOpen ? 'Hide' : 'Show'}</span>
                          {cityEventsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </button>

                      {cityEventsOpen && (
                        <div className="p-4 sm:p-6 bg-slate-50/30">
                          {cityEvents.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-xs">
                              No city-level events currently active.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {cityEvents.map(renderCard)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* DROPDOWN 2: BRANCH EVENTS */}
                  {(selectedTierFilter === 'All' || selectedTierFilter === 'Branch') && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setBranchEventsOpen(!branchEventsOpen)}
                        className="w-full p-4 sm:p-5 flex items-center justify-between text-left bg-slate-50/70 hover:bg-slate-100/80 transition-colors border-b border-slate-200 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                            <Building2 className="w-4 h-4 text-emerald-700" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                                2. Branch Events
                              </h4>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                {branchEvents.length} Events
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Medical college branches, student wing assemblies, and hospital unit conclaves
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 font-semibold text-xs">
                          <span className="hidden sm:inline">{branchEventsOpen ? 'Hide' : 'Show'}</span>
                          {branchEventsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </button>

                      {branchEventsOpen && (
                        <div className="p-4 sm:p-6 bg-slate-50/30">
                          {branchEvents.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-xs">
                              No branch-level events currently active.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {branchEvents.map(renderCard)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* DROPDOWN 3: STATE EVENTS */}
                  {(selectedTierFilter === 'All' || selectedTierFilter === 'State') && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setStateEventsOpen(!stateEventsOpen)}
                        className="w-full p-4 sm:p-5 flex items-center justify-between text-left bg-slate-50/70 hover:bg-slate-100/80 transition-colors border-b border-slate-200 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-red-100 text-red-800 flex items-center justify-center font-bold text-sm">
                            <Calendar className="w-4 h-4 text-red-700" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                                3. State Events
                              </h4>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                                {stateEvents.length} Events
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Gujarat & Saurashtra state conferences, annual general meetings, and state-wide seva yatras
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 font-semibold text-xs">
                          <span className="hidden sm:inline">{stateEventsOpen ? 'Hide' : 'Show'}</span>
                          {stateEventsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </button>

                      {stateEventsOpen && (
                        <div className="p-4 sm:p-6 bg-slate-50/30">
                          {stateEvents.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-xs">
                              No state-level events currently active.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {stateEvents.map(renderCard)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* DROPDOWN 4: NATIONAL EVENTS */}
                  {(selectedTierFilter === 'All' || selectedTierFilter === 'National') && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setNationalEventsOpen(!nationalEventsOpen)}
                        className="w-full p-4 sm:p-5 flex items-center justify-between text-left bg-slate-50/70 hover:bg-slate-100/80 transition-colors border-b border-slate-200 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-sm">
                            <Globe className="w-4 h-4 text-purple-700" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                                4. National Events
                              </h4>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                                {nationalEvents.length} Events
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              National NMO conventions, All-India research symposiums, and national council assemblies
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 font-semibold text-xs">
                          <span className="hidden sm:inline">{nationalEventsOpen ? 'Hide' : 'Show'}</span>
                          {nationalEventsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </button>

                      {nationalEventsOpen && (
                        <div className="p-4 sm:p-6 bg-slate-50/30">
                          {nationalEvents.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-xs">
                              No national-level events currently active.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {nationalEvents.map(renderCard)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Tab 5: Event History */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              My Participation & Attendance History
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Event</th>
                    <th className="p-3">Registration Date</th>
                    <th className="p-3">Registration Status</th>
                    <th className="p-3">Attendance</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myRegistrations.map((r) => {
                    const evt = events.find((e) => e.eventId === r.eventId);
                    return (
                      <tr key={r.registrationId} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-800">
                          {evt?.title || r.eventId}
                        </td>
                        <td className="p-3 text-slate-600">{r.registrationDate}</td>
                        <td className="p-3">
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            {r.registrationStatus}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`font-bold px-2 py-0.5 rounded ${
                              r.attendanceStatus === 'Attended'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {r.attendanceStatus}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {r.attendanceStatus === 'Attended' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCertModalEvent({ id: r.eventId, title: evt?.title });
                                    setIsUploadModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Upload certificate (JPG/PNG) for this event"
                                >
                                  <Upload className="w-3 h-3 text-emerald-600" />
                                  <span>Upload Cert</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCertModalEvent({ id: r.eventId, title: evt?.title });
                                    setIsShowCertModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Show verified certificates"
                                >
                                  <Award className="w-3 h-3 text-blue-600" />
                                  <span>Show Cert</span>
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCancelRegistration(r.eventId, evt?.title || r.eventId)}
                              disabled={cancellingId === r.eventId}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                              title="Cancel this event registration"
                            >
                              <XCircle className="w-3 h-3 text-rose-600" />
                              <span>Cancel</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5.5: Certificates Vault */}
        {activeTab === 'certificates' && <MemberCertificatesTab />}

        {/* Tab 6: Alerts */}
        {activeTab === 'alerts' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              State & Prant Notifications
            </h3>
            {memberAlerts.map((ann) => (
              <div
                key={ann.id}
                className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded uppercase">
                    Notice
                  </span>
                  <span>{ann.createdAt?.split('T')[0]}</span>
                </div>
                <h4 className="text-base font-bold text-slate-900">{ann.title}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{ann.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Show Participants Modal */}
      {selectedParticipantsEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-5xl xl:max-w-6xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                    {selectedParticipantsEvent.prant} Prant
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {selectedParticipantsEvent.eventId}
                  </span>
                  {isAdmin && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Admin View
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  Registered Participants: {selectedParticipantsEvent.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-3">
                  <span>📅 {selectedParticipantsEvent.date}</span>
                  <span>📍 {selectedParticipantsEvent.venue}, {selectedParticipantsEvent.city}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedParticipantsEvent(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-700">
                  Total Registered:{' '}
                  <strong className="text-blue-700 font-bold">
                    {(selectedParticipantsEvent.participants || []).length}
                  </strong>
                  {selectedParticipantsEvent.maximumParticipants && (
                    <span className="text-slate-400 font-normal">
                      {' '}
                      / {selectedParticipantsEvent.maximumParticipants} capacity
                    </span>
                  )}
                </span>
                <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                  {(selectedParticipantsEvent.participants || []).filter((p) => p.attendanceStatus === 'Attended').length} Present
                </span>
              </div>

              {/* Action Buttons for Admins & Members */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyEmails(selectedParticipantsEvent.participants || [])}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Copy registered participant email addresses"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Emails</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportEventParticipantsToCSV(selectedParticipantsEvent.eventId)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Print Attendance List"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Sheet</span>
                </button>
                {isAdmin && (
                  <a
                    href={`${adminPanelLink}?section=events&eventId=${selectedParticipantsEvent.eventId}`}
                    className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Admin Desk</span>
                  </a>
                )}
              </div>
            </div>

            {copyFeedback && (
              <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{copyFeedback}</span>
              </div>
            )}

            {/* Search Filter */}
            <div className="py-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchParticipant}
                  onChange={(e) => setSearchParticipant(e.target.value)}
                  placeholder="Filter participants by name, membership number, or college..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Participants Table */}
            <div className="flex-1 overflow-x-auto overflow-y-auto border border-slate-200 rounded-xl min-h-[260px] bg-white">
              <table className="w-full text-left text-xs min-w-[850px] border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-20">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Participant Name</th>
                    <th className="p-3">Membership No</th>
                    <th className="p-3">College / Prant</th>
                    <th className="p-3">Registered On</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Attendance</th>
                    {isAdmin && (
                      <th className="p-3 text-right sticky right-0 bg-slate-50 z-30 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] min-w-[170px]">
                        Admin Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const rawList = selectedParticipantsEvent.participants || [];
                    const q = searchParticipant.trim().toLowerCase();
                    const filtered = rawList.filter(
                      (p) =>
                        !q ||
                        (p.name || '').toLowerCase().includes(q) ||
                        (p.membershipNumber || '').toLowerCase().includes(q) ||
                        (p.medicalCollege || '').toLowerCase().includes(q)
                    );

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={isAdmin ? 8 : 7} className="p-8 text-center text-slate-500">
                            {rawList.length === 0
                              ? 'No participants have registered for this event yet.'
                              : 'No matching participants found.'}
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((p, idx) => (
                      <tr key={p.membershipNumber || idx} className="hover:bg-slate-50/70 group">
                        <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-semibold text-slate-900">
                          <div>{p.name || 'Member'}</div>
                          {isAdmin && p.email && <div className="text-[10px] text-slate-400 font-normal">{p.email}</div>}
                        </td>
                        <td className="p-3 font-mono text-slate-600 font-semibold">{p.membershipNumber}</td>
                        <td className="p-3 text-slate-600">
                          <span className="truncate block max-w-[130px] font-medium">{p.medicalCollege || '—'}</span>
                          <span className="text-[10px] text-slate-400">{p.prant ? `${p.prant} Prant` : ''}</span>
                        </td>
                        <td className="p-3 text-slate-500 text-[11px]">
                          {p.registeredAt ? p.registeredAt.split('T')[0] : p.registrationDate || 'Confirmed'}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.approvalStatus === 'Approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : p.approvalStatus === 'Rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {p.approvalStatus || 'Approved'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              p.attendanceStatus === 'Attended'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {p.attendanceStatus === 'Attended' ? 'Present' : 'Pending'}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="p-3 text-right whitespace-nowrap sticky right-0 bg-white group-hover:bg-slate-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] min-w-[170px]">
                            <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                              {p.approvalStatus !== 'Approved' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateParticipantApproval(selectedParticipantsEvent.eventId, p.membershipNumber, 'Approved')
                                  }
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
                                  title="Approve registration"
                                >
                                  Approve
                                </button>
                              )}
                              {p.attendanceStatus !== 'Attended' ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (p.approvalStatus !== 'Approved') {
                                      await updateParticipantApproval(selectedParticipantsEvent.eventId, p.membershipNumber, 'Approved');
                                    }
                                    await updateParticipantAttendance(selectedParticipantsEvent.eventId, p.membershipNumber, 'Attended');
                                  }}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
                                  title="Mark Present"
                                >
                                  Present
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateParticipantAttendance(selectedParticipantsEvent.eventId, p.membershipNumber, 'Not Attended')
                                  }
                                  className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px] font-bold transition-colors cursor-pointer shrink-0"
                                  title="Mark Absent"
                                >
                                  Absent
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Official NMO Gujarat Registration Registry
              </span>
              <button
                type="button"
                onClick={() => setSelectedParticipantsEvent(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Certificate Modal (JPG / PNG Only) */}
      <UploadCertificateModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        defaultEventId={certModalEvent.id}
        defaultEventTitle={certModalEvent.title}
        onSuccess={() => {
          setIsUploadModalOpen(false);
          setIsShowCertModalOpen(true);
        }}
      />

      {/* Show Certificate Modal (Calls Membership ID) */}
      <ShowCertificateModal
        isOpen={isShowCertModalOpen}
        onClose={() => {
          setIsShowCertModalOpen(false);
          setCertModalEvent({});
        }}
        membershipNumber={currentMember?.membershipNumber || currentUser?.membershipNumber}
        memberName={currentMember?.name || currentUser?.name}
        selectedEventId={certModalEvent.id}
        selectedEventTitle={certModalEvent.title}
        onOpenUpload={(eventInfo) => {
          if (eventInfo) {
            setCertModalEvent({ id: eventInfo.eventId, title: eventInfo.eventTitle });
          }
          setIsUploadModalOpen(true);
        }}
      />

      {/* Ticket Tracker Modal (User Review and Resolution Approval) */}
      <TicketTrackerModal
        isOpen={isTicketTrackerOpen}
        onClose={() => setIsTicketTrackerOpen(false)}
      />
    </div>
  );
};
