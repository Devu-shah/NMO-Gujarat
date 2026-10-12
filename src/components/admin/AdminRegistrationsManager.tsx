import React, { useState, useMemo } from 'react';
import { useNMO } from '../../context/NMOContext';
import { ApprovalStatus, AttendanceStatus } from '../../types/nmo';
import {
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  Search,
  Filter,
  Calendar,
  Download,
  ShieldCheck,
  RefreshCw,
  Plus,
  X,
  UserPlus,
  Copy,
  Trash2
} from 'lucide-react';

interface AdminRegistrationsManagerProps {
  initialEventId?: string | null;
}

export const AdminRegistrationsManager: React.FC<AdminRegistrationsManagerProps> = ({
  initialEventId
}) => {
  const {
    events,
    users,
    updateParticipantApproval,
    updateParticipantAttendance,
    deleteParticipantFromEvent,
    addEventRSVPManually,
    exportEventParticipantsToCSV,
    refreshFromDatabase,
    isSyncing,
    lastSyncTime,
    currentUser,
    eventRegistrations
  } = useNMO();

  const isPrantAdmin = currentUser?.role === 'prant_admin';
  const assignedPrant = currentUser?.prant;

  const [selectedEventId, setSelectedEventId] = useState<string>(initialEventId || 'All');
  const [approvalFilter, setApprovalFilter] = useState<string>('All');
  const [attendanceFilter, setAttendanceFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialEventId) {
      setSelectedEventId(initialEventId);
    }
  }, [initialEventId]);

  // Manual RSVP Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [targetEventId, setTargetEventId] = useState<string>('');
  const [targetMemNo, setTargetMemNo] = useState<string>('');
  const [targetApproval, setTargetApproval] = useState<ApprovalStatus>('Approved');
  const [targetAttendance, setTargetAttendance] = useState<AttendanceStatus>('Attended');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Flatten and merge participants from Events collection and eventRegistrations
  const allRegistrations = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();

    events.forEach((evt) => {
      (evt.participants || []).forEach((p) => {
        const key = `${evt.eventId}_${p.membershipNumber.toUpperCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            ...p,
            eventId: evt.eventId,
            eventTitle: evt.title,
            eventPrant: evt.prant,
            eventDate: evt.date
          });
        }
      });
    });

    (eventRegistrations || []).forEach((r) => {
      const evtId = r.eventId;
      const memNo = (r.membershipNumber || '').toUpperCase();
      const key = `${evtId}_${memNo}`;
      if (!seen.has(key)) {
        seen.add(key);
        const parentEvent = events.find((e) => e.eventId === evtId);
        list.push({
          membershipNumber: memNo,
          uid: r.uid,
          name: r.name || 'Member',
          email: r.email || '',
          phone: r.phone || '',
          medicalCollege: r.medicalCollege || '',
          prant: r.prant || parentEvent?.prant || 'Gujarat',
          registrationDate: r.registrationDate || new Date().toISOString().split('T')[0],
          approvalStatus: r.registrationStatus || r.status || 'Pending',
          attendanceStatus: r.attendanceStatus || 'Pending',
          eventId: evtId,
          eventTitle: r.eventTitle || parentEvent?.title || 'Medical Event',
          eventPrant: r.eventPrant || parentEvent?.prant || 'Gujarat',
          eventDate: r.eventDate || parentEvent?.date || '—'
        });
      }
    });

    return list;
  }, [events, eventRegistrations]);

  const filteredRegistrations = allRegistrations.filter((r: any) => {
    if (selectedEventId !== 'All' && r.eventId !== selectedEventId) return false;
    if (approvalFilter !== 'All' && r.approvalStatus !== approvalFilter) return false;
    if (attendanceFilter !== 'All' && r.attendanceStatus !== attendanceFilter) return false;

    // Prant scope check for Prant Admin
    if (isPrantAdmin && assignedPrant !== 'All') {
      if (r.prant !== assignedPrant && r.eventPrant !== assignedPrant) return false;
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = (r.name || '').toLowerCase().includes(q);
      const matchMem = (r.membershipNumber || '').toLowerCase().includes(q);
      const matchEmail = (r.email || '').toLowerCase().includes(q);
      const matchEvent = (r.eventTitle || '').toLowerCase().includes(q);
      if (!matchName && !matchMem && !matchEmail && !matchEvent) return false;
    }

    return true;
  });

  const pendingApprovalsCount = allRegistrations.filter((r: any) => r.approvalStatus === 'Pending').length;
  const approvedCount = allRegistrations.filter((r: any) => r.approvalStatus === 'Approved').length;
  const attendedCount = allRegistrations.filter((r: any) => r.attendanceStatus === 'Attended').length;

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEventId || !targetMemNo.trim()) return;

    setIsSubmitting(true);
    try {
      const cleanNo = targetMemNo.trim().toUpperCase();
      const matchedUser = users.find((u) => u.membershipNumber.toUpperCase() === cleanNo);

      await addEventRSVPManually(targetEventId, {
        membershipNumber: cleanNo,
        name: matchedUser?.name || 'Registered Doctor',
        email: matchedUser?.email || '',
        phone: matchedUser?.phone || '',
        medicalCollege: matchedUser?.medicalCollege || '',
        prant: matchedUser?.prant || 'Gujarat',
        approvalStatus: targetApproval,
        attendanceStatus: targetAttendance
      });

      setFeedback(`Added member ${cleanNo} to event registration list.`);
      setShowAddModal(false);
      setTargetMemNo('');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      alert('Error saving participant: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900">
            Event Participants & Attendance Desk
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Embedded inside Events collection (Events/{'{eventId}'}.participants[]). Review submissions, grant approvals, and record attendance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={async () => {
              try {
                const res = await refreshFromDatabase(true);
                setFeedback(`Synced ${res.eventsCount} events and ${res.registrationsCount} registrations from database.`);
                setTimeout(() => setFeedback(null), 4000);
              } catch (e: any) {
                alert('Sync error: ' + e.message);
              }
            }}
            disabled={isSyncing}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh participant records from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isSyncing ? 'animate-spin text-red-600' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Refresh DB'}</span>
            {lastSyncTime && <span className="text-[10px] text-slate-500 font-mono hidden md:inline">({lastSyncTime})</span>}
          </button>

          <button
            onClick={() => {
              setTargetEventId(selectedEventId !== 'All' ? selectedEventId : (events[0]?.eventId || ''));
              setShowAddModal(true);
            }}
            className="px-3.5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Participant</span>
          </button>

          <button
            onClick={() => {
              const emails = filteredRegistrations
                .map((r: any) => r.email)
                .filter(Boolean);
              if (emails.length === 0) {
                alert('No emails found in currently filtered registrations.');
                return;
              }
              navigator.clipboard.writeText(emails.join(', '));
              setFeedback(`Copied ${emails.length} email addresses to clipboard!`);
              setTimeout(() => setFeedback(null), 4000);
            }}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy email addresses of currently filtered participants"
          >
            <Copy className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Copy Emails</span>
          </button>

          {selectedEventId !== 'All' && (
            <button
              onClick={() => exportEventParticipantsToCSV(selectedEventId)}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{feedback}</span>
        </div>
      )}

      {/* Workflow Indicator */}
      <div className="bg-slate-900 text-white p-4 rounded-xl shadow-xs border border-slate-800">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-300 mb-2">
          <ShieldCheck className="w-4 h-4" />
          <span>NMO Gujarat Participant Workflow</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">Step 1</span>
            <span className="font-semibold text-white">Member Registers</span>
            <span className="text-[11px] text-amber-300 block mt-0.5">Status: Pending Review</span>
          </div>
          <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">Step 2</span>
            <span className="font-semibold text-white">Committee Reviews</span>
            <span className="text-[11px] text-slate-300 block mt-0.5">Approve / Reject Action</span>
          </div>
          <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">Step 3</span>
            <span className="font-semibold text-white">If Approved</span>
            <span className="text-[11px] text-emerald-300 block mt-0.5">Confirmed in participants[]</span>
          </div>
          <div className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">Step 4</span>
            <span className="font-semibold text-white">Attendance</span>
            <span className="text-[11px] text-blue-300 block mt-0.5">Attended / Not Attended</span>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Pending Approvals</span>
          <div className="text-2xl font-black text-amber-600 mt-1">{pendingApprovalsCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Approved Participants</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{approvedCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Verified Attended</span>
          <div className="text-2xl font-black text-blue-600 mt-1">{attendedCount}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by member, number, or event..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
        >
          <option value="All">All Events ({events.length})</option>
          {events.map((e) => (
            <option key={e.eventId} value={e.eventId}>
              {e.title} ({e.prant})
            </option>
          ))}
        </select>

        <select
          value={approvalFilter}
          onChange={(e) => setApprovalFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
        >
          <option value="All">All Approvals</option>
          <option value="Pending">Pending Review</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <select
          value={attendanceFilter}
          onChange={(e) => setAttendanceFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
        >
          <option value="All">All Attendance</option>
          <option value="Pending">Attendance Pending</option>
          <option value="Attended">Attended</option>
          <option value="Not Attended">Not Attended</option>
        </select>
      </div>

      {/* Registrations & Participants Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Event</th>
                <th className="p-3.5">Member Details</th>
                <th className="p-3.5">Prant / College</th>
                <th className="p-3.5">Registered On</th>
                <th className="p-3.5">Approval Status</th>
                <th className="p-3.5">Attendance Status</th>
                <th className="p-3.5 text-right">Committee Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No registrations found matching selected criteria.
                  </td>
                </tr>
              ) : (
                filteredRegistrations.map((r: any) => (
                  <tr key={`${r.eventId}-${r.membershipNumber}`} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5">
                      <span className="font-bold text-slate-900 block">{r.eventTitle}</span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3 text-red-600" />
                        {r.eventDate} ({r.eventPrant})
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span className="font-bold text-slate-900 block">{r.name}</span>
                      <span className="font-mono text-[11px] text-red-700 block font-semibold">
                        {r.membershipNumber}
                      </span>
                      {r.email && <span className="text-[10px] text-slate-500 block">{r.email}</span>}
                    </td>

                    <td className="p-3.5">
                      <span className="font-semibold text-slate-800 block">{r.prant} Prant</span>
                      <span className="text-[10px] text-slate-500 block truncate max-w-[150px]">
                        {r.medicalCollege || 'Medical College'}
                      </span>
                    </td>

                    <td className="p-3.5 font-mono text-slate-600">
                      {r.registrationDate}
                    </td>

                    {/* Approval Status Badge & Dropdown */}
                    <td className="p-3.5">
                      <select
                        value={r.approvalStatus}
                        onChange={(e) =>
                          updateParticipantApproval(r.eventId, r.membershipNumber, e.target.value as ApprovalStatus)
                        }
                        className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                          r.approvalStatus === 'Approved'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : r.approvalStatus === 'Rejected'
                            ? 'bg-red-50 text-red-700 border-red-300'
                            : 'bg-amber-50 text-amber-700 border-amber-300'
                        }`}
                      >
                        <option value="Pending">Pending Review</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                      {r.approvedBy && (
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          By: {r.approvedBy}
                        </span>
                      )}
                    </td>

                    {/* Attendance Status Badge & Dropdown */}
                    <td className="p-3.5">
                      <select
                        value={r.attendanceStatus}
                        onChange={(e) =>
                          updateParticipantAttendance(r.eventId, r.membershipNumber, e.target.value as AttendanceStatus)
                        }
                        className={`px-2 py-1 rounded text-[11px] font-bold border cursor-pointer ${
                          r.attendanceStatus === 'Attended'
                            ? 'bg-blue-50 text-blue-700 border-blue-300'
                            : r.attendanceStatus === 'Not Attended'
                            ? 'bg-slate-100 text-slate-700 border-slate-300'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Attended">Present (Attended)</option>
                        <option value="Not Attended">Absent (Not Attended)</option>
                      </select>
                      {r.attendanceMarkedBy && (
                        <span className="text-[9px] text-slate-400 block mt-0.5">
                          Marked: {r.attendanceMarkedBy}
                        </span>
                      )}
                    </td>

                    {/* Quick Action Buttons */}
                    <td className="p-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {r.approvalStatus !== 'Approved' && (
                          <button
                            onClick={() => updateParticipantApproval(r.eventId, r.membershipNumber, 'Approved')}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition-colors cursor-pointer"
                            title="Approve registration"
                          >
                            Approve
                          </button>
                        )}
                        {r.attendanceStatus !== 'Attended' ? (
                          <button
                            onClick={async () => {
                              if (r.approvalStatus !== 'Approved') {
                                await updateParticipantApproval(r.eventId, r.membershipNumber, 'Approved');
                              }
                              await updateParticipantAttendance(r.eventId, r.membershipNumber, 'Attended');
                            }}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold transition-colors cursor-pointer"
                            title="Mark as Present"
                          >
                            Mark Present
                          </button>
                        ) : (
                          <button
                            onClick={() => updateParticipantAttendance(r.eventId, r.membershipNumber, 'Not Attended')}
                            className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold transition-colors cursor-pointer"
                            title="Mark as Absent"
                          >
                            Mark Absent
                          </button>
                        )}
                        {r.approvalStatus === 'Pending' && (
                          <button
                            onClick={() => updateParticipantApproval(r.eventId, r.membershipNumber, 'Rejected')}
                            className="px-2 py-1 bg-slate-200 hover:bg-red-100 hover:text-red-700 text-slate-700 rounded text-[10px] font-bold transition-colors cursor-pointer"
                            title="Reject registration"
                          >
                            Reject
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (
                              window.confirm(
                                `Are you sure you want to remove ${r.name || r.membershipNumber} from ${r.eventTitle || 'this event'}?`
                              )
                            ) {
                              await deleteParticipantFromEvent(r.eventId, r.membershipNumber);
                              setFeedback(`Removed ${r.name || r.membershipNumber} from attendees list.`);
                              setTimeout(() => setFeedback(null), 3000);
                            }
                          }}
                          className="p-1 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 rounded transition-colors cursor-pointer"
                          title="Delete entry from attendee list"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
