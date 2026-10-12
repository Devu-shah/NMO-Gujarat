import React, { useState } from 'react';
import { useNMO } from '../../context/NMOContext';
import { Download, FileSpreadsheet, Filter, CheckSquare, Sparkles, Calendar, Users } from 'lucide-react';
import { NMOUserRecord, NMOEvent, PrantType } from '../../types/nmo';

export const AdminCsvExport: React.FC = () => {
  const { users, events, currentUser, logAudit, exportUsersToCSV, exportEventParticipantsToCSV } = useNMO();

  // Role permissions
  const isPrantAdmin = currentUser?.role === 'prant_admin';
  const assignedPrant = currentUser?.prant;

  const scopedUsers = isPrantAdmin && assignedPrant !== 'All'
    ? users.filter((u) => u.prant === assignedPrant)
    : users;

  // Export modes: 'complete' | 'gujarat' | 'saurashtra' | 'filtered' | 'event-participants'
  const [exportMode, setExportMode] = useState<'complete' | 'gujarat' | 'saurashtra' | 'filtered' | 'event-participants'>('complete');

  // Filters for 'filtered' mode
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [qualFilter, setQualFilter] = useState<string>('All');

  // Event Selection for 'event-participants' mode
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.eventId || '');

  const handleDownloadCSV = async (csvContent: string, filename: string, recordCount: number) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    await logAudit(
      'CSV_EXPORT',
      'EXPORT',
      filename,
      `Exported ${recordCount} records to CSV (${filename})`
    );
  };

  const executeExport = () => {
    const dateStr = new Date().toISOString().split('T')[0];

    // MODE 1: Complete Database
    if (exportMode === 'complete') {
      const targetPrant = isPrantAdmin ? assignedPrant : 'All_Gujarat';
      const filename = `NMO_Users_${targetPrant}_${dateStr}.csv`;
      exportUsersToCSV(isPrantAdmin ? (assignedPrant as any) : undefined);
      return;
    }

    // MODE 2: Gujarat Prant
    if (exportMode === 'gujarat') {
      exportUsersToCSV('Gujarat');
      return;
    }

    // MODE 3: Saurashtra Prant
    if (exportMode === 'saurashtra') {
      exportUsersToCSV('Saurashtra');
      return;
    }

    // MODE 4: Filtered Custom View
    if (exportMode === 'filtered') {
      const filtered = scopedUsers.filter((u) => {
        if (roleFilter !== 'All' && u.role !== roleFilter) return false;
        if (statusFilter !== 'All' && u.accountStatus !== statusFilter) return false;
        if (qualFilter !== 'All' && !(u.qualifications || '').includes(qualFilter)) return false;
        return true;
      });

      const filename = `NMO_Users_Filtered_${dateStr}.csv`;
      const headers = [
        'Membership Number',
        'Name',
        'Role',
        'Account Status',
        'Prant',
        'Email',
        'Phone',
        'Medical College',
        'Qualifications',
        'Registration Number',
        'Blood Group',
        'DOB',
        'Gender'
      ];

      const rows = filtered.map((u) => [
        `"${u.membershipNumber}"`,
        `"${(u.name || '').replace(/"/g, '""')}"`,
        `"${u.role || 'member'}"`,
        `"${u.accountStatus || 'Active'}"`,
        `"${u.prant || ''}"`,
        `"${u.email || ''}"`,
        `"${u.phone || ''}"`,
        `"${(u.medicalCollege || '').replace(/"/g, '""')}"`,
        `"${(u.qualifications || '').replace(/"/g, '""')}"`,
        `"${u.registrationNumber || ''}"`,
        `"${u.bloodGroup || ''}"`,
        `"${u.dob || ''}"`,
        `"${u.gender || ''}"`
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      handleDownloadCSV(csv, filename, filtered.length);
      return;
    }

    // MODE 5: Event Participants (Embedded inside Events collection)
    if (exportMode === 'event-participants') {
      if (!selectedEventId) {
        alert('Please select an event to export.');
        return;
      }
      exportEventParticipantsToCSV(selectedEventId);
      return;
    }
  };

  const selectedEvent = events.find((e) => e.eventId === selectedEventId);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h3 className="text-xl font-black text-slate-900">
          Export Users & Event Data to CSV
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Export official CSV files from the top-level Users collection and Events participants[] array.
        </p>
      </div>

      {/* Export Options Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setExportMode('complete')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            exportMode === 'complete'
              ? 'border-red-600 bg-red-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-900 text-xs sm:text-sm">Complete Database</span>
            <FileSpreadsheet className="w-4 h-4 text-red-700" />
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            All {scopedUsers.length} user records with full medical identity fields.
          </p>
        </button>

        <button
          onClick={() => setExportMode('gujarat')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            exportMode === 'gujarat'
              ? 'border-red-600 bg-red-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-900 text-xs sm:text-sm">Gujarat Prant</span>
            <Users className="w-4 h-4 text-red-700" />
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            Users registered under Gujarat Prant chapters.
          </p>
        </button>

        <button
          onClick={() => setExportMode('saurashtra')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            exportMode === 'saurashtra'
              ? 'border-red-600 bg-red-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-900 text-xs sm:text-sm">Saurashtra Prant</span>
            <Users className="w-4 h-4 text-blue-700" />
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            Users registered under Saurashtra Prant chapters.
          </p>
        </button>

        <button
          onClick={() => setExportMode('event-participants')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            exportMode === 'event-participants'
              ? 'border-red-600 bg-red-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-900 text-xs sm:text-sm">Event Participants</span>
            <Calendar className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            Export participants[] with approval & attendance status.
          </p>
        </button>
      </div>

      {/* Sub-Configurations based on Selected Mode */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
        {exportMode === 'event-participants' && (
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800">
              Select Target Event for Participant Export:
            </label>
            {events.length === 0 ? (
              <p className="text-xs text-slate-500">No events currently scheduled in the Events collection.</p>
            ) : (
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
              >
                {events.map((evt) => (
                  <option key={evt.eventId} value={evt.eventId}>
                    {evt.title} ({evt.prant}) — {evt.participants?.length || 0} Participants
                  </option>
                ))}
              </select>
            )}

            {selectedEvent && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                <span>
                  <strong>Date:</strong> {selectedEvent.date} · <strong>Venue:</strong> {selectedEvent.venue}, {selectedEvent.city}
                </span>
                <span className="font-semibold text-emerald-700">
                  {selectedEvent.participants?.length || 0} Registered Medicos
                </span>
              </div>
            )}
          </div>
        )}

        {exportMode === 'filtered' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Filter by Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="All">All Roles</option>
                <option value="member">Member</option>
                <option value="prant_admin">Prant Admin</option>
                <option value="state_admin">State Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Account Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Qualification</label>
              <select
                value={qualFilter}
                onChange={(e) => setQualFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="All">All Qualifications</option>
                <option value="MBBS">MBBS</option>
                <option value="MD">MD / MS</option>
                <option value="BDS">BDS / MDS</option>
                <option value="Student">Undergraduate Student</option>
              </select>
            </div>
          </div>
        )}

        <div className="pt-2 flex items-center justify-between border-t border-slate-100">
          <span className="text-xs text-slate-500">
            Export complies with NMO Gujarat RBAC permissions.
          </span>

          <button
            onClick={executeExport}
            className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download CSV Export</span>
          </button>
        </div>
      </div>
    </div>
  );
};
