import React, { useState, useMemo } from 'react';
import { useNMO } from '../../context/NMOContext';
import {
  NMOEvent,
  EventStatus,
  EventFieldType,
  PrantType,
  ApprovalStatus,
  AttendanceStatus,
  EventParticipant
} from '../../types/nmo';
import {
  Calendar,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  MapPin,
  Clock,
  Users,
  CheckCircle,
  X,
  Save,
  Check,
  Search,
  Download,
  UserCheck,
  RefreshCw,
  AlertCircle,
  Filter,
  CheckCircle2,
  XCircle,
  UserPlus,
  Printer,
  Copy,
  ExternalLink,
  FolderOpen,
  ShieldAlert
} from 'lucide-react';
import {
  connectGoogleDrive,
  getDriveAccessToken,
  ensureDriveAccessToken,
  reconcileAllEventDriveFolders,
  ensureEventDriveFolders
} from '../../lib/googleDrive';
import { CityDropdown } from '../common/CityDropdown';

interface AdminEventsManagerProps {
  initialEventId?: string | null;
  onNavigateToRegistrations?: (eventId: string) => void;
}

export const AdminEventsManager: React.FC<AdminEventsManagerProps> = ({
  initialEventId,
  onNavigateToRegistrations
}) => {
  const {
    events,
    users,
    currentUser,
    addEvent,
    updateEvent,
    deleteEvent,
    createEventDriveSubfolder,
    updateParticipantApproval,
    updateParticipantAttendance,
    deleteParticipantFromEvent,
    addEventRSVPManually,
    exportEventParticipantsToCSV,
    refreshFromDatabase,
    isSyncing,
    lastSyncTime
  } = useNMO();

  const isCityAdmin = currentUser?.role === 'city_admin';
  const isPrantAdmin = currentUser?.role === 'prant_admin';
  const assignedPrant = currentUser?.prant;
  const assignedCity = currentUser?.city;

  const scopedEvents = isCityAdmin && assignedCity
    ? events.filter((e) => !e.city || e.city.toLowerCase() === assignedCity.toLowerCase())
    : isPrantAdmin && assignedPrant !== 'All'
    ? events.filter((e) => e.prant === assignedPrant || e.prant === 'All')
    : events;

  const [editingEvent, setEditingEvent] = useState<NMOEvent | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Filter events city-wise & search bar states
  const [filterCity, setFilterCity] = useState<string>('');
  const [searchCityQuery, setSearchCityQuery] = useState<string>('');

  const displayedEvents = useMemo(() => {
    return scopedEvents.filter((evt) => {
      if (filterCity && filterCity.trim()) {
        if ((evt.city || '').toLowerCase() !== filterCity.toLowerCase()) {
          return false;
        }
      }
      if (searchCityQuery && searchCityQuery.trim()) {
        const q = searchCityQuery.toLowerCase();
        const inCity = (evt.city || '').toLowerCase().includes(q);
        const inTitle = (evt.title || '').toLowerCase().includes(q);
        const inVenue = (evt.venue || '').toLowerCase().includes(q);
        if (!inCity && !inTitle && !inVenue) {
          return false;
        }
      }
      return true;
    });
  }, [scopedEvents, filterCity, searchCityQuery]);

  // Event Participants Modal State
  const [selectedRsvpEventId, setSelectedRsvpEventId] = useState<string | null>(initialEventId || null);
  const [searchRsvp, setSearchRsvp] = useState('');
  const [filterApproval, setFilterApproval] = useState<string>('All');
  const [filterAttendance, setFilterAttendance] = useState<string>('All');
  const [rsvpFeedback, setRsvpFeedback] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Sync with initialEventId if it updates externally
  React.useEffect(() => {
    if (initialEventId) {
      setSelectedRsvpEventId(initialEventId);
    }
  }, [initialEventId]);

  // Manual Add Participant Form State
  const [showAddRsvpForm, setShowAddRsvpForm] = useState(false);
  const [newRsvpMemNo, setNewRsvpMemNo] = useState('');
  const [newRsvpApproval, setNewRsvpApproval] = useState<ApprovalStatus>('Approved');
  const [newRsvpAttendance, setNewRsvpAttendance] = useState<AttendanceStatus>('Attended');
  const [isAddingRsvp, setIsAddingRsvp] = useState(false);

  // The active event whose participants are currently being inspected
  const activeRsvpEvent = useMemo(() => {
    if (!selectedRsvpEventId) return null;
    return events.find((e) => e.eventId === selectedRsvpEventId) || null;
  }, [events, selectedRsvpEventId]);

  const [driveActionId, setDriveActionId] = useState<string | null>(null);
  const [isReconcilingFolders, setIsReconcilingFolders] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<NMOEvent | null>(null);
  const [deleteDriveFoldersChecked, setDeleteDriveFoldersChecked] = useState(true);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);

  const handleCreateDriveSubfolder = async (evt: NMOEvent) => {
    setDriveActionId(evt.eventId);
    try {
      const folder = await createEventDriveSubfolder(evt.eventId, evt.title, evt.driveFolderId);
      if (folder) {
        setRsvpFeedback(`Successfully linked Google Drive folders for "${evt.title}" (Approved & Pending).`);
        setTimeout(() => setRsvpFeedback(null), 4000);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to generate event subfolders in Google Drive. Verify Drive is connected.');
    } finally {
      setDriveActionId(null);
    }
  };

  const handleReconcileFolders = async () => {
    setIsReconcilingFolders(true);
    try {
      const res = await reconcileAllEventDriveFolders();
      setRsvpFeedback(`Drive Folders Reconciled: ${res.reconciledCount} of ${res.totalEvents} events verified with Approved & Pending subfolders.`);
      await refreshFromDatabase(true);
      setTimeout(() => setRsvpFeedback(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Failed to reconcile event Drive folders. Please verify Google Drive connection.');
    } finally {
      setIsReconcilingFolders(false);
    }
  };

  const handleCopyEmails = () => {
    if (!activeRsvpEvent?.participants?.length) {
      alert('No participants registered yet.');
      return;
    }
    const emails = activeRsvpEvent.participants
      .map((p) => p.email)
      .filter(Boolean);
    if (emails.length === 0) {
      alert('No email addresses recorded for these participants.');
      return;
    }
    navigator.clipboard.writeText(emails.join(', '));
    setCopyFeedback(`Copied ${emails.length} email addresses!`);
    setTimeout(() => setCopyFeedback(null), 3000);
  };

  const filteredParticipants = useMemo(() => {
    if (!activeRsvpEvent) return [];
    return (activeRsvpEvent.participants || []).filter((p) => {
      if (filterApproval !== 'All' && p.approvalStatus !== filterApproval) return false;
      if (filterAttendance !== 'All' && p.attendanceStatus !== filterAttendance) return false;
      if (searchRsvp.trim()) {
        const q = searchRsvp.toLowerCase();
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchMem = (p.membershipNumber || '').toLowerCase().includes(q);
        const matchEmail = (p.email || '').toLowerCase().includes(q);
        if (!matchName && !matchMem && !matchEmail) return false;
      }
      return true;
    });
  }, [activeRsvpEvent, filterApproval, filterAttendance, searchRsvp]);

  const handleManualAddRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRsvpEventId || !newRsvpMemNo.trim()) return;

    setIsAddingRsvp(true);
    try {
      const cleanNo = newRsvpMemNo.trim().toUpperCase();
      const matchedUser = users.find((u) => u.membershipNumber.toUpperCase() === cleanNo);

      await addEventRSVPManually(selectedRsvpEventId, {
        membershipNumber: cleanNo,
        name: matchedUser?.name || 'Registered Doctor',
        email: matchedUser?.email || '',
        phone: matchedUser?.phone || '',
        medicalCollege: matchedUser?.medicalCollege || '',
        prant: matchedUser?.prant || activeRsvpEvent?.prant,
        approvalStatus: newRsvpApproval,
        attendanceStatus: newRsvpAttendance,
        registrationDate: new Date().toISOString().split('T')[0]
      });

      setRsvpFeedback(`Added member ${cleanNo} to registered participant list.`);
      setNewRsvpMemNo('');
      setShowAddRsvpForm(false);
      setTimeout(() => setRsvpFeedback(null), 4000);
    } catch (err: any) {
      alert('Error adding participant: ' + err.message);
    } finally {
      setIsAddingRsvp(false);
    }
  };

  const emptyEvent: Omit<NMOEvent, 'eventId' | 'createdAt' | 'updatedAt'> = {
    title: '',
    description: '',
    eventImage: '/assets/nmo/hero/slide-1-healthcare-camp.svg',
    image: '/assets/nmo/hero/slide-1-healthcare-camp.svg',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00 AM',
    endTime: '05:00 PM',
    venue: '',
    city: '',
    state: 'Gujarat',
    prant: isPrantAdmin && assignedPrant === 'Saurashtra' ? 'Saurashtra' : 'Gujarat',
    registrationStart: new Date().toISOString().split('T')[0],
    registrationEnd: '',
    maximumParticipants: 150,
    registrationRequired: true,
    status: 'Registration Open',
    participants: [],
    isDynamicMemberField: true,
    fieldDisplayName: '',
    fieldType: 'Attended/Not Attended'
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;

    if (isCreating) {
      await addEvent(editingEvent);
    } else {
      await updateEvent(editingEvent);
    }
    setEditingEvent(null);
    setIsCreating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900">
            Events & Medical CME Management
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Create conferences, health camps, and configure dynamic member spreadsheet columns.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={async () => {
              try {
                const res = await refreshFromDatabase(true);
                setRsvpFeedback(`Synced ${res.eventsCount} events and ${res.registrationsCount} registrations from Firestore.`);
                setTimeout(() => setRsvpFeedback(null), 4000);
              } catch (e: any) {
                alert('Sync failed: ' + e.message);
              }
            }}
            disabled={isSyncing}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh events and registrations from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isSyncing ? 'animate-spin text-red-600' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Refresh DB'}</span>
            {lastSyncTime && <span className="text-[10px] text-slate-500 font-mono hidden md:inline">({lastSyncTime})</span>}
          </button>

          <button
            onClick={handleReconcileFolders}
            disabled={isReconcilingFolders || isSyncing}
            className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Audit and ensure both Approved and Pending Drive subfolders exist for all events"
          >
            <FolderOpen className={`w-3.5 h-3.5 text-amber-700 ${isReconcilingFolders ? 'animate-spin' : ''}`} />
            <span>{isReconcilingFolders ? 'Reconciling Drive...' : 'Reconcile Folders'}</span>
          </button>

          <button
            onClick={() => {
              setEditingEvent({
                ...emptyEvent,
                eventId: `EVT-${Date.now()}`
              });
              setIsCreating(true);
            }}
            className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Event</span>
          </button>
        </div>
      </div>

      {rsvpFeedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{rsvpFeedback}</span>
        </div>
      )}

      {/* City Wise Filter & Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
          {/* City Dropdown with search bar */}
          <div className="w-full sm:w-64">
            <CityDropdown
              showAllOption
              allOptionLabel={`All Cities (${scopedEvents.length} Events)`}
              value={filterCity}
              onChange={setFilterCity}
              placeholder="Filter by City from Database"
            />
          </div>

          {/* Search bar for cities & events */}
          <div className="relative flex-1">
            <input
              type="text"
              value={searchCityQuery}
              onChange={(e) => setSearchCityQuery(e.target.value)}
              placeholder="Search events by city name, venue, or title..."
              className="w-full pl-8 pr-7 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-red-600 focus:bg-white focus:outline-hidden"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
            {searchCityQuery && (
              <button
                type="button"
                onClick={() => setSearchCityQuery('')}
                className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {(filterCity || searchCityQuery) && (
          <button
            type="button"
            onClick={() => {
              setFilterCity('');
              setSearchCityQuery('');
            }}
            className="px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-colors shrink-0 flex items-center justify-center gap-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reset Filter</span>
          </button>
        )}
      </div>

      {/* Events List or Empty State */}
      {displayedEvents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-base">
              {filterCity || searchCityQuery ? `No Events in Selected City` : `No Events Created Yet`}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {filterCity || searchCityQuery
                ? `No event records match city "${filterCity || searchCityQuery}". Try resetting the city filter.`
                : `Click "Create New Event" above to publish a medical camp, state CME symposium, or conclave.`}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedEvents.map((evt) => (
          <div
            key={evt.eventId}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    evt.prant === 'Saurashtra'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {evt.prant} Prant
                </span>
                <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {evt.status}
                </span>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-base leading-snug">
                  {evt.title}
                </h4>
                <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                  {evt.description}
                </p>
              </div>

              <div className="text-xs text-slate-600 space-y-1 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{evt.date} · {evt.startTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">{evt.venue}, {evt.city}</span>
                </div>
              </div>

              {/* Participants / Attendance Summary */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span>{evt.participants?.length || 0} Participants</span>
                </span>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                    {evt.participants?.filter((p) => p.attendanceStatus === 'Attended').length || 0} Attended
                  </span>
                  {(evt.participants?.filter((p) => p.approvalStatus === 'Pending').length || 0) > 0 && (
                    <span className="text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                      {evt.participants?.filter((p) => p.approvalStatus === 'Pending').length} Pending
                    </span>
                  )}
                </div>
              </div>

              {/* Dynamic Member Field Indicator (Option 7) */}
              {evt.isDynamicMemberField && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200/80 text-[11px] text-amber-900 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Member Table Column:</span>
                  </div>
                  <span className="font-bold font-mono">
                    "{evt.fieldDisplayName || evt.title}"
                  </span>
                </div>
              )}

              {/* NMO Gujarat Dual Google Drive Subfolder Status */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium text-slate-600">
                    <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Approved Folder:</span>
                  </span>
                  {evt.driveFolderId ? (
                    <a
                      href={evt.driveFolderLink || `https://drive.google.com/drive/folders/${evt.driveFolderId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md transition-colors"
                      title="Open Approved Certificates Folder in Google Drive"
                    >
                      <span className="truncate max-w-[130px]">Events/{evt.driveFolderName || evt.title}</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400 italic">Not initialized</span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium text-slate-600">
                    <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
                    <span>Pending Folder:</span>
                  </span>
                  {evt.pendingDriveFolderId ? (
                    <a
                      href={evt.pendingDriveFolderLink || `https://drive.google.com/drive/folders/${evt.pendingDriveFolderId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md transition-colors"
                      title="Open Pending Verification Folder in Google Drive"
                    >
                      <span className="truncate max-w-[130px]">pending/{evt.pendingDriveFolderName || evt.title}</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400 italic">Not initialized</span>
                  )}
                </div>

                {(!evt.driveFolderId || !evt.pendingDriveFolderId) && (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleCreateDriveSubfolder(evt)}
                      disabled={driveActionId === evt.eventId}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${driveActionId === evt.eventId ? 'animate-spin' : ''}`} />
                      <span>{driveActionId === evt.eventId ? 'Initializing...' : '+ Initialize Drive Folders'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  setSelectedRsvpEventId(evt.eventId);
                  setSearchRsvp('');
                  setFilterApproval('All');
                  setFilterAttendance('All');
                }}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="View participant list, grant approvals, and mark attendance / presence"
              >
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span>Show Participants ({evt.participants?.length || 0})</span>
              </button>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditingEvent(evt);
                    setIsCreating(false);
                  }}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => {
                    setEventToDelete(evt);
                    setDeleteDriveFoldersChecked(true);
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  title="Safe Delete Event"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Edit / Create Event Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">
                {isCreating ? 'Create New Event / Health Camp' : `Edit Event: ${editingEvent.title}`}
              </h3>
              <button
                onClick={() => setEditingEvent(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-semibold mb-1">
                    Event Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingEvent.title}
                    onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                    placeholder="e.g. Dang Seva Samarpan Mega Health Camp"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-semibold mb-1">
                    Description *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={editingEvent.description}
                    onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={editingEvent.date}
                    onChange={(e) => setEditingEvent({ ...editingEvent, date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Time</label>
                  <input
                    type="text"
                    value={editingEvent.startTime}
                    onChange={(e) => setEditingEvent({ ...editingEvent, startTime: e.target.value })}
                    placeholder="09:00 AM - 05:00 PM"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Venue *</label>
                  <input
                    type="text"
                    required
                    value={editingEvent.venue}
                    onChange={(e) => setEditingEvent({ ...editingEvent, venue: e.target.value })}
                    placeholder="Hospital Auditorium / Community Hall"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <CityDropdown
                    label="City / District"
                    required
                    value={editingEvent.city}
                    onChange={(chosenCity) => setEditingEvent({ ...editingEvent, city: chosenCity })}
                    placeholder="Select or search city from database..."
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Prant *</label>
                  <select
                    value={editingEvent.prant}
                    disabled={isPrantAdmin && assignedPrant !== 'All'}
                    onChange={(e) => setEditingEvent({ ...editingEvent, prant: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="Gujarat">Gujarat Prant</option>
                    <option value="Saurashtra">Saurashtra Prant</option>
                    <option value="All">All Gujarat (Both Prants)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Event Tier Level *</label>
                  <select
                    value={editingEvent.tier || 'State'}
                    onChange={(e) => setEditingEvent({ ...editingEvent, tier: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                  >
                    <option value="City">1. City Event</option>
                    <option value="Branch">2. Branch Event</option>
                    <option value="State">3. State Event</option>
                    <option value="National">4. National Event</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Status *</label>
                  <select
                    value={editingEvent.status}
                    onChange={(e) => setEditingEvent({ ...editingEvent, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Published">Published</option>
                    <option value="Registration Open">Registration Open</option>
                    <option value="Registration Closed">Registration Closed</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Max Participants</label>
                  <input
                    type="number"
                    value={editingEvent.maximumParticipants || 150}
                    onChange={(e) => setEditingEvent({ ...editingEvent, maximumParticipants: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Registration Cut-off</label>
                  <input
                    type="date"
                    value={editingEvent.registrationEnd || ''}
                    onChange={(e) => setEditingEvent({ ...editingEvent, registrationEnd: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Requirement 7: Option "Add Event Field to Member Database" */}
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-700" />
                    <span className="font-bold text-amber-950 text-xs">
                      Add Event Field to Member Database
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editingEvent.isDynamicMemberField}
                    onChange={(e) =>
                      setEditingEvent({ ...editingEvent, isDynamicMemberField: e.target.checked })
                    }
                    className="w-4 h-4 text-red-700 rounded focus:ring-red-600"
                  />
                </div>

                <p className="text-[11px] text-amber-900 leading-relaxed">
                  Enabling this renders this event as a dynamic, interactive column in the administrative member table derived from live registration and attendance records.
                </p>

                {editingEvent.isDynamicMemberField && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-amber-950 font-semibold mb-1">
                        Column Header Name
                      </label>
                      <input
                        type="text"
                        value={editingEvent.fieldDisplayName || ''}
                        onChange={(e) =>
                          setEditingEvent({ ...editingEvent, fieldDisplayName: e.target.value })
                        }
                        placeholder={editingEvent.title ? editingEvent.title.slice(0, 20) : 'e.g. Camp 2026'}
                        className="w-full px-3 py-1.5 border border-amber-300 rounded-lg bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-amber-950 font-semibold mb-1">
                        Field Display Type
                      </label>
                      <select
                        value={editingEvent.fieldType || 'Attended/Not Attended'}
                        onChange={(e) =>
                          setEditingEvent({ ...editingEvent, fieldType: e.target.value as any })
                        }
                        className="w-full px-3 py-1.5 border border-amber-300 rounded-lg bg-white"
                      >
                        <option value="Attended/Not Attended">Attended / Not Attended</option>
                        <option value="Approved/Rejected">Approved / Rejected</option>
                        <option value="Registered/Not Registered">Registered / Not Registered</option>
                        <option value="Yes/No">Yes / No</option>
                        <option value="Text">Custom Status Text</option>
                        <option value="Date">Registration Date</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Event</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event RSVP & Attendance Desk Modal */}
      {activeRsvpEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-5xl xl:max-w-6xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                    {activeRsvpEvent.prant} Prant
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {activeRsvpEvent.eventId}
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900 mt-1">
                  Participants & Attendance: {activeRsvpEvent.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-3">
                  <span>📅 {activeRsvpEvent.date} ({activeRsvpEvent.startTime} - {activeRsvpEvent.endTime})</span>
                  <span>📍 {activeRsvpEvent.venue}, {activeRsvpEvent.city}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedRsvpEventId(null);
                  setShowAddRsvpForm(false);
                }}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics & Action Bar */}
            <div className="py-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 block">Total Participants</span>
                  <span className="text-lg font-black text-slate-900">
                    {activeRsvpEvent.participants?.length || 0}
                  </span>
                </div>
                <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <span className="text-[10px] text-amber-700 block">Pending Approvals</span>
                  <span className="text-lg font-black text-amber-800">
                    {activeRsvpEvent.participants?.filter((p) => p.approvalStatus === 'Pending').length || 0}
                  </span>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 block">Approved</span>
                  <span className="text-lg font-black text-emerald-800">
                    {activeRsvpEvent.participants?.filter((p) => p.approvalStatus === 'Approved').length || 0}
                  </span>
                </div>
                <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-200">
                  <span className="text-[10px] text-blue-700 block">Present (Attended)</span>
                  <span className="text-lg font-black text-blue-800">
                    {activeRsvpEvent.participants?.filter((p) => p.attendanceStatus === 'Attended').length || 0}
                  </span>
                </div>
              </div>

              {/* Filter controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={searchRsvp}
                      onChange={(e) => setSearchRsvp(e.target.value)}
                      placeholder="Search participant name, membership #..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                    />
                  </div>

                  <select
                    value={filterApproval}
                    onChange={(e) => setFilterApproval(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="All">All Approvals</option>
                    <option value="Pending">Pending Review</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>

                  <select
                    value={filterAttendance}
                    onChange={(e) => setFilterAttendance(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                  >
                    <option value="All">All Attendance / Presence</option>
                    <option value="Attended">Present (Attended)</option>
                    <option value="Not Attended">Absent (Not Attended)</option>
                    <option value="Pending">Pending Status</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowAddRsvpForm(!showAddRsvpForm)}
                    className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Register Member</span>
                  </button>
                  <button
                    onClick={handleCopyEmails}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Copy all participant email addresses to clipboard"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-600" />
                    <span className="hidden sm:inline">Copy Emails</span>
                  </button>
                  <button
                    onClick={() => exportEventParticipantsToCSV(activeRsvpEvent.eventId)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Export CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Print Attendance Sheet"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Print Sheet</span>
                  </button>
                  {onNavigateToRegistrations && (
                    <button
                      type="button"
                      onClick={() => onNavigateToRegistrations(activeRsvpEvent.eventId)}
                      className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Switch to full registrations desk"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Registrations Desk</span>
                    </button>
                  )}
                </div>
              </div>

              {copyFeedback && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold">{copyFeedback}</span>
                </div>
              )}
            </div>

            {/* Inline Add Participant Subform */}
            {showAddRsvpForm && (
              <form
                onSubmit={handleManualAddRsvp}
                className="mb-4 p-3 bg-red-50/70 border border-red-200 rounded-xl space-y-2 text-xs animate-in fade-in"
              >
                <div className="font-bold text-red-950 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-red-700" />
                  <span>Register Member to this Event</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      required
                      placeholder="Enter Membership Number (e.g. 231112001791)"
                      value={newRsvpMemNo}
                      onChange={(e) => setNewRsvpMemNo(e.target.value)}
                      className="w-full px-3 py-1.5 border border-red-300 rounded-lg bg-white font-mono uppercase font-bold"
                    />
                  </div>
                  <div>
                    <select
                      value={newRsvpApproval}
                      onChange={(e) => setNewRsvpApproval(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 border border-red-300 rounded-lg bg-white font-medium"
                    >
                      <option value="Approved">Approved</option>
                      <option value="Pending">Pending Review</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <select
                      value={newRsvpAttendance}
                      onChange={(e) => setNewRsvpAttendance(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 border border-red-300 rounded-lg bg-white font-medium"
                    >
                      <option value="Attended">Present (Attended)</option>
                      <option value="Not Attended">Absent (Not Attended)</option>
                      <option value="Pending">Attendance Pending</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddRsvpForm(false)}
                    className="px-3 py-1 border border-slate-300 bg-white rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingRsvp}
                    className="px-4 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {isAddingRsvp ? 'Saving...' : 'Add Participant'}
                  </button>
                </div>
              </form>
            )}

            {/* RSVPs Table */}
            <div className="flex-1 overflow-x-auto overflow-y-auto border border-slate-200 rounded-xl min-h-[260px] bg-white">
              <table className="w-full text-left text-xs min-w-[940px] border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-20">
                  <tr>
                    <th className="p-3">Member Details</th>
                    <th className="p-3">College / Prant</th>
                    <th className="p-3">Registered On</th>
                    <th className="p-3">Approval Status</th>
                    <th className="p-3">Presence / Attendance</th>
                    <th className="p-3 text-right sticky right-0 bg-slate-50 z-30 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] min-w-[210px]">
                      One-Click Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No participants registered for this event yet. Click "Register Member" above to add participants.
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.map((p) => {
                      const isApproved = p.approvalStatus === 'Approved';
                      const isRejected = p.approvalStatus === 'Rejected';
                      const isAttended = p.attendanceStatus === 'Attended';
                      const isAbsent = p.attendanceStatus === 'Not Attended';

                      return (
                        <tr key={p.membershipNumber} className="hover:bg-slate-50 transition-colors group">
                          <td className="p-3">
                            <span className="font-bold text-slate-900 block">{p.name}</span>
                            <span className="font-mono text-[11px] text-red-700 font-semibold block">
                              {p.membershipNumber}
                            </span>
                            {p.email && <span className="text-[10px] text-slate-400 block">{p.email}</span>}
                          </td>

                          <td className="p-3">
                            <span className="text-slate-700 font-medium block truncate max-w-[140px]">
                              {p.medicalCollege || 'Medical College'}
                            </span>
                            <span className="text-[10px] text-slate-400 block">{p.prant} Prant</span>
                          </td>

                          <td className="p-3 font-mono text-slate-600">
                            {p.registrationDate || '—'}
                          </td>

                          {/* Approval Status */}
                          <td className="p-3">
                            <select
                              value={p.approvalStatus}
                              onChange={(e) =>
                                updateParticipantApproval(activeRsvpEvent.eventId, p.membershipNumber, e.target.value as ApprovalStatus)
                              }
                              className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                                isApproved
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : isRejected
                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                  : 'bg-amber-50 text-amber-800 border-amber-300'
                              }`}
                            >
                              <option value="Pending">Pending Review</option>
                              <option value="Approved">Approved</option>
                              <option value="Rejected">Rejected</option>
                            </select>
                            {p.approvedBy && (
                              <span className="text-[9px] text-slate-400 block mt-0.5">
                                By: {p.approvedBy}
                              </span>
                            )}
                          </td>

                          {/* Presence / Attendance Status */}
                          <td className="p-3">
                            <select
                              value={p.attendanceStatus}
                              onChange={(e) =>
                                updateParticipantAttendance(activeRsvpEvent.eventId, p.membershipNumber, e.target.value as AttendanceStatus)
                              }
                              className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                                isAttended
                                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                                  : isAbsent
                                  ? 'bg-slate-100 text-slate-700 border-slate-300'
                                  : 'bg-slate-50 text-slate-500 border-slate-200'
                              }`}
                            >
                              <option value="Pending">Pending Status</option>
                              <option value="Attended">Present (Attended)</option>
                              <option value="Not Attended">Absent (Not Attended)</option>
                            </select>
                            {p.attendanceMarkedBy && (
                              <span className="text-[9px] text-slate-400 block mt-0.5">
                                Marked: {p.attendanceMarkedBy}
                              </span>
                            )}
                          </td>

                          {/* One-Click Action Buttons */}
                          <td className="p-3 text-right whitespace-nowrap sticky right-0 bg-white group-hover:bg-slate-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)] min-w-[210px]">
                            <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                              {!isApproved && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateParticipantApproval(activeRsvpEvent.eventId, p.membershipNumber, 'Approved')
                                  }
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
                                  title="Approve participant registration"
                                >
                                  Approve
                                </button>
                              )}
                              {!isAttended ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!isApproved) {
                                      await updateParticipantApproval(activeRsvpEvent.eventId, p.membershipNumber, 'Approved');
                                    }
                                    await updateParticipantAttendance(activeRsvpEvent.eventId, p.membershipNumber, 'Attended');
                                  }}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
                                  title="Mark participant as Present"
                                >
                                  Mark Present
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateParticipantAttendance(activeRsvpEvent.eventId, p.membershipNumber, 'Not Attended')
                                  }
                                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold transition-colors cursor-pointer shrink-0"
                                  title="Mark participant as Absent"
                                >
                                  Mark Absent
                                </button>
                              )}
                              {p.approvalStatus === 'Pending' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateParticipantApproval(activeRsvpEvent.eventId, p.membershipNumber, 'Rejected')
                                  }
                                  className="px-2 py-1 bg-slate-200 hover:bg-rose-100 hover:text-rose-700 text-slate-700 rounded text-[10px] font-bold transition-colors cursor-pointer shrink-0"
                                  title="Reject participant"
                                >
                                  Reject
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  if (
                                    window.confirm(
                                      `Are you sure you want to remove ${p.name || p.membershipNumber} from the attendees list of this event?`
                                    )
                                  ) {
                                    await deleteParticipantFromEvent(activeRsvpEvent.eventId, p.membershipNumber);
                                    setCopyFeedback(`Removed ${p.name || p.membershipNumber} from attendees list.`);
                                    setTimeout(() => setCopyFeedback(null), 3000);
                                  }
                                }}
                                className="p-1 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 rounded transition-colors cursor-pointer shrink-0"
                                title="Delete entry from attendees list"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">
                Showing {filteredParticipants.length} of {activeRsvpEvent.participants?.length || 0} Participants
              </span>
              <button
                onClick={() => {
                  setSelectedRsvpEventId(null);
                  setShowAddRsvpForm(false);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Event Deletion Confirmation Modal */}
      {eventToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-red-200">
            <div className="flex items-start gap-3.5 mb-4">
              <div className="p-2.5 bg-red-100 text-red-700 rounded-xl shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Confirm Event Deletion
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Are you sure you want to delete <span className="font-bold text-slate-900">"{eventToDelete.title}"</span>?
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900 mb-4">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Drive Folders & Files Safeguard</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800/90">
                Deleting this event will remove its registration and participant records from NMO Gujarat.
              </p>

              <div className="mt-2 space-y-1.5 pt-2 border-t border-amber-200/80 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Approved Folder:</span>
                  <span className="font-mono text-[10px] text-slate-600 truncate max-w-[240px]">
                    {eventToDelete.driveFolderId ? `Events/${eventToDelete.driveFolderName || eventToDelete.title}` : 'Not linked'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Pending Folder:</span>
                  <span className="font-mono text-[10px] text-slate-600 truncate max-w-[240px]">
                    {eventToDelete.pendingDriveFolderId ? `pending/${eventToDelete.pendingDriveFolderName || eventToDelete.title}` : 'Not linked'}
                  </span>
                </div>
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer mb-5 text-xs select-none">
              <input
                type="checkbox"
                checked={deleteDriveFoldersChecked}
                onChange={(e) => setDeleteDriveFoldersChecked(e.target.checked)}
                className="mt-0.5 rounded text-red-600 focus:ring-red-500 h-4 w-4"
              />
              <div>
                <span className="font-bold text-slate-800 block">
                  Also move associated Google Drive folders to Trash
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Trash the specific event folders in Drive. Central root and parent directories are strictly protected and will never be deleted.
                </span>
              </div>
            </label>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeletingEvent}
                onClick={() => setEventToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingEvent}
                onClick={async () => {
                  setIsDeletingEvent(true);
                  try {
                    await deleteEvent(eventToDelete.eventId, {
                      deleteDriveFolders: deleteDriveFoldersChecked,
                      confirmationTitle: eventToDelete.title
                    });
                    setRsvpFeedback(`Deleted event "${eventToDelete.title}" successfully.`);
                    setEventToDelete(null);
                    setTimeout(() => setRsvpFeedback(null), 4000);
                  } catch (err: any) {
                    alert('Failed to delete event: ' + err.message);
                  } finally {
                    setIsDeletingEvent(false);
                  }
                }}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingEvent ? 'Deleting...' : 'Confirm & Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
