import React, { useState } from 'react';
import { useNMO } from '../context/NMOContext';
import { NMOEvent } from '../types/nmo';
import {
  Calendar,
  Clock,
  MapPin,
  Building,
  Users,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Filter,
  Check,
  Search,
  Download,
  X,
  ExternalLink,
  ShieldCheck,
  Copy,
  Printer,
  CheckCircle2
} from 'lucide-react';

interface EventsSectionProps {
  onOpenAuth: () => void;
}

export const EventsSection: React.FC<EventsSectionProps> = ({ onOpenAuth }) => {
  const {
    events,
    cities,
    currentUser,
    currentMember,
    registerForEvent,
    cancelEventRegistration,
    eventRegistrations,
    exportEventParticipantsToCSV,
    updateParticipantApproval,
    updateParticipantAttendance
  } = useNMO();

  const [selectedPrantFilter, setSelectedPrantFilter] = useState<'All' | 'Gujarat' | 'Saurashtra'>('All');
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('All');
  const [searchCityQuery, setSearchCityQuery] = useState<string>('');
  const [registeringEvent, setRegisteringEvent] = useState<NMOEvent | null>(null);
  const [regSuccessMessage, setRegSuccessMessage] = useState<string | null>(null);
  const [cancellingEventId, setCancellingEventId] = useState<string | null>(null);

  // Show Participants Modal State
  const [selectedParticipantsEvent, setSelectedParticipantsEvent] = useState<NMOEvent | null>(null);
  const [searchParticipant, setSearchParticipant] = useState<string>('');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

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
    const memNo = currentMember?.membershipNumber || currentUser?.membershipNumber;
    if (!memNo) return;
    if (!window.confirm(`Are you sure you want to cancel your registration for "${eventTitle}"?`)) {
      return;
    }
    setCancellingEventId(eventId);
    try {
      await cancelEventRegistration(eventId, memNo);
      alert(`Your registration for "${eventTitle}" has been cancelled.`);
    } catch (err: any) {
      alert(err.message || 'Failed to cancel registration.');
    } finally {
      setCancellingEventId(null);
    }
  };

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

  // Quick form for non-logged in or confirming registration
  const [membershipInput, setMembershipInput] = useState(currentMember?.membershipNumber || '');
  const [nameInput, setNameInput] = useState(currentMember?.name || '');

  const filteredEvents = events.filter((e) => {
    if (selectedPrantFilter !== 'All' && e.prant !== selectedPrantFilter && e.prant !== 'All') {
      return false;
    }
    const eCity = (e.city || '').toLowerCase().trim();
    if (selectedCityFilter !== 'All' && eCity !== selectedCityFilter.toLowerCase().trim()) {
      return false;
    }
    if (searchCityQuery && searchCityQuery.trim()) {
      const q = searchCityQuery.toLowerCase().trim();
      const inCity = eCity.includes(q);
      const inTitle = (e.title || '').toLowerCase().includes(q);
      const inVenue = (e.venue || '').toLowerCase().includes(q);
      if (!inCity && !inTitle && !inVenue) {
        return false;
      }
    }
    return true;
  });

  const isUserRegistered = (eventId: string) => {
    if (!currentMember) return false;
    return eventRegistrations.some(
      (r) =>
        r.eventId === eventId &&
        r.membershipNumber.toLowerCase() === currentMember.membershipNumber.toLowerCase()
    );
  };

  const handleStartRegistration = (event: NMOEvent) => {
    if (!currentUser?.email) {
      onOpenAuth();
      return;
    }
    setMembershipInput(currentMember?.membershipNumber || '');
    setNameInput(currentMember?.name || currentUser.displayName || '');
    setRegisteringEvent(event);
    setRegSuccessMessage(null);
  };

  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registeringEvent) return;

    if (!membershipInput.trim() || !nameInput.trim()) {
      alert('Please provide your Membership Number and Full Name.');
      return;
    }

    try {
      await registerForEvent(registeringEvent.eventId, membershipInput.trim(), nameInput.trim());
      setRegSuccessMessage(`Registration submitted successfully for ${registeringEvent.title}!`);
      setTimeout(() => {
        setRegisteringEvent(null);
        setRegSuccessMessage(null);
      }, 2000);
    } catch (err: any) {
      alert('Registration failed: ' + err.message);
    }
  };

  return (
    <section id="events" className="py-16 sm:py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-red-700">
              Conferences · Health Camps · CMEs
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mt-1">
              Upcoming Events & Seva Programs
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-2xl">
              Participate in accredited state medical conferences, regional CME symposiums, and high-impact tribal multi-specialty health camps.
            </p>
          </div>

          {/* Interactive Prant Filter Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg self-start">
            <button
              onClick={() => setSelectedPrantFilter('All')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                selectedPrantFilter === 'All'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Events ({events.length})
            </button>
            <button
              onClick={() => setSelectedPrantFilter('Gujarat')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                selectedPrantFilter === 'Gujarat'
                  ? 'bg-white text-red-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Gujarat Prant
            </button>
            <button
              onClick={() => setSelectedPrantFilter('Saurashtra')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                selectedPrantFilter === 'Saurashtra'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Saurashtra Prant
            </button>
          </div>
        </div>

        {/* City Filter & Search Bar */}
        <div className="mb-8 p-3.5 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchCityQuery}
              onChange={(e) => setSearchCityQuery(e.target.value)}
              placeholder="Search events by city name, venue, or title..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-red-600 focus:bg-white focus:outline-hidden"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            {searchCityQuery && (
              <button
                type="button"
                onClick={() => setSearchCityQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <MapPin className="w-3.5 h-3.5 text-red-600" />
            <select
              value={selectedCityFilter}
              onChange={(e) => setSelectedCityFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-red-600 focus:outline-hidden cursor-pointer"
            >
              <option value="All">All Cities</option>
              {(cities || []).map((cityName) => (
                <option key={cityName} value={cityName}>
                  {cityName}
                </option>
              ))}
            </select>

            {(selectedCityFilter !== 'All' || searchCityQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCityFilter('All');
                  setSearchCityQuery('');
                }}
                className="px-2.5 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Events Grid or Presentable Empty State */}
        {filteredEvents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-2xl mx-auto shadow-xs space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mx-auto">
              <Calendar className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">
                Official Event Schedule Coming Soon
              </h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                State medical camps, clinical CMEs, and regional conclaves for Gujarat and Saurashtra Prants are scheduled throughout the academic calendar. Verified members will receive registration notifications directly on their portal.
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={onOpenAuth}
                className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs sm:text-sm font-semibold transition-colors shadow-xs"
              >
                Access Member Portal
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredEvents.map((evt) => {
            const registered = isUserRegistered(evt.eventId);
            const isRegOpen = evt.status === 'Registration Open' || evt.status === 'Published';

            return (
              <div
                key={evt.eventId}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col overflow-hidden group"
              >
                {/* Event Visual Banner */}
                <div className="h-48 w-full bg-slate-900 relative overflow-hidden">
                  <img
                    src={evt.image || '/assets/nmo/hero/slide-1-healthcare-camp.svg'}
                    alt={evt.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/assets/nmo/hero/slide-2-medical-conference.svg';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />

                  {/* Badges on Visual */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-md text-white shadow-xs ${
                        evt.prant === 'Saurashtra' ? 'bg-blue-600' : 'bg-red-600'
                      }`}
                    >
                      {evt.prant} Prant
                    </span>

                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-black/60 backdrop-blur-xs text-white">
                      {evt.status}
                    </span>
                  </div>

                  <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 text-xs text-white/90">
                    <Calendar className="w-3.5 h-3.5 text-amber-300" />
                    <span className="font-semibold">{evt.date}</span>
                    {evt.startTime && <span>· {evt.startTime}</span>}
                  </div>
                </div>

                {/* Event Body */}
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-red-700 transition-colors leading-snug mb-2">
                      {evt.title}
                    </h3>
                    <p className="text-slate-600 text-xs sm:text-sm line-clamp-3 mb-4 leading-relaxed">
                      {evt.description}
                    </p>

                    {/* Metadata details */}
                    <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{evt.venue}, {evt.city}</span>
                      </div>
                      {evt.maximumParticipants && (
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Max Capacity: {evt.maximumParticipants} medicos</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Action */}
                  <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedParticipantsEvent(evt);
                            setSearchParticipant('');
                          }}
                          className="flex-1 py-2 px-3 border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          title="Show registered participants (Admin only)"
                        >
                          <Users className="w-3.5 h-3.5 text-blue-600" />
                          <span>Show Participants ({(evt.participants || []).length})</span>
                        </button>

                        <a
                          href={`${adminPanelLink}?section=events&eventId=${evt.eventId}`}
                          className="px-2.5 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="Open in Admin Desk"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Admin Desk</span>
                        </a>
                      </div>
                    )}

                    {registered ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg w-full justify-center border border-emerald-200">
                          <Check className="w-4 h-4" />
                          <span>Registered Successfully</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCancelRegistration(evt.eventId, evt.title)}
                          disabled={cancellingEventId === evt.eventId}
                          className="w-full py-1.5 px-3 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5 text-rose-600" />
                          <span>Cancel Registration</span>
                        </button>
                      </div>
                    ) : isRegOpen ? (
                      <button
                        onClick={() => handleStartRegistration(evt)}
                        className="w-full py-2.5 px-4 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <span>Register Now</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full py-2.5 px-4 rounded-lg bg-slate-100 text-slate-400 font-semibold text-xs cursor-not-allowed"
                      >
                        Registration Closed
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Registration Modal */}
      {registeringEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">
              Event Registration
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {registeringEvent.title} ({registeringEvent.prant} Prant)
            </p>

            {regSuccessMessage ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-lg text-sm flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{regSuccessMessage}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmitRegistration} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Membership Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={membershipInput}
                    onChange={(e) => setMembershipInput(e.target.value)}
                    placeholder="e.g. NMO-GUJ-2024-001"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Your unique NMO Gujarat membership ID.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="e.g. Dr. Harshil Patel"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
                  />
                </div>

                <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-600 space-y-1">
                  <div>Date: <strong>{registeringEvent.date}</strong></div>
                  <div>Venue: <strong>{registeringEvent.venue}, {registeringEvent.city}</strong></div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setRegisteringEvent(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors shadow-xs"
                  >
                    Confirm Registration
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Show Participants Modal */}
      {selectedParticipantsEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col my-auto">
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

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyEmails(selectedParticipantsEvent.participants || [])}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Copy registered participant email addresses"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
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
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Participant Name</th>
                    <th className="p-3">Membership No</th>
                    <th className="p-3">College / Prant</th>
                    <th className="p-3">Registered On</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Attendance</th>
                    {isAdmin && <th className="p-3 text-right">Admin Actions</th>}
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
                      <tr key={p.membershipNumber || idx} className="hover:bg-slate-50/70">
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
                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {p.approvalStatus !== 'Approved' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateParticipantApproval(selectedParticipantsEvent.eventId, p.membershipNumber, 'Approved')
                                  }
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition-colors cursor-pointer"
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
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold transition-colors cursor-pointer"
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
                                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold transition-colors cursor-pointer"
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
                Synced directly with Firestore <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">event_registrations</code>
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
    </section>
  );
};
