import React, { useState, useMemo } from 'react';
import { useNMO, isProtectedAdminUser } from '../../context/NMOContext';
import { NMOMember, NMOEvent } from '../../types/nmo';
import {
  Search,
  Filter,
  Columns,
  ChevronDown,
  ArrowUpDown,
  Edit2,
  Trash2,
  Eye,
  CheckSquare,
  Square,
  Download,
  Plus,
  X,
  AlertCircle,
  Save,
  CheckCircle2,
  Sparkles,
  Shield,
  RefreshCw
} from 'lucide-react';

interface AdminMemberDataTableProps {
  onExportSelected?: (selected: NMOMember[]) => void;
}

export const AdminMemberDataTable: React.FC<AdminMemberDataTableProps> = ({
  onExportSelected
}) => {
  const {
    members,
    events,
    eventRegistrations,
    currentUser,
    updateMember,
    deleteMember,
    addMember,
    clearNonAdminUsers,
    clearAllMembers,
    deleteMultipleUsers,
    refreshFromDatabase,
    isSyncing,
    lastSyncTime
  } = useNMO();

  // Clear Non-Admin State
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearMode, setClearMode] = useState<'non_admin' | 'all'>('non_admin');
  const [clearInputText, setClearInputText] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [clearFeedback, setClearFeedback] = useState<string | null>(null);
  const [isSavingMember, setIsSavingMember] = useState(false);

  const nonAdminCount = useMemo(() => {
    return members.filter((m) => !isProtectedAdminUser(m, currentUser)).length;
  }, [members, currentUser]);

  const handleExecuteClearUsers = async () => {
    setIsClearing(true);
    try {
      const res = clearMode === 'all'
        ? await clearAllMembers()
        : await clearNonAdminUsers();

      if (res.success) {
        setClearFeedback(
          `Successfully cleared ${res.deletedCount} members from Firestore. ${res.preservedCount} administrator account${res.preservedCount > 1 ? 's' : ''} preserved.`
        );
        setShowClearModal(false);
        setClearInputText('');
        setTimeout(() => setClearFeedback(null), 5000);
      } else {
        alert(`Failed to clear users: ${res.error}`);
      }
    } catch (e: any) {
      alert(`Error during clearance: ${e.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  // Role filtering
  const isPrantAdmin = currentUser?.role === 'prant_admin';
  const assignedPrant = currentUser?.prant;

  const baseMembers = useMemo(() => {
    if (isPrantAdmin && assignedPrant && assignedPrant !== 'All') {
      return members.filter((m) => m.prant === assignedPrant);
    }
    return members;
  }, [members, isPrantAdmin, assignedPrant]);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPrant, setFilterPrant] = useState<'All' | 'Gujarat' | 'Saurashtra'>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterQual, setFilterQual] = useState<string>('All');

  // Sorting
  const [sortField, setSortField] = useState<keyof NMOMember>('membershipNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selection
  const [selectedNumbers, setSelectedNumbers] = useState<Set<string>>(new Set());

  // Visible Standard Columns
  const [visibleColumns, setVisibleColumns] = useState({
    membershipNumber: true,
    name: true,
    prant: true,
    qualifications: true,
    medicalCollege: true,
    bloodGroup: true,
    phone: true,
    email: false,
    registrationNumber: true,
    status: true,
    validTill: false
  });

  // Dynamic Event Columns (derived scalable relationship)
  // Events flagged as dynamic member field
  const dynamicEvents = useMemo(() => {
    return events.filter((e) => {
      // If prant-specific event, only show if applicable
      if (isPrantAdmin && e.prant !== 'All' && e.prant !== assignedPrant) {
        return false;
      }
      return e.isDynamicMemberField || true; // Allow selecting any event as column
    });
  }, [events, isPrantAdmin, assignedPrant]);

  // Selected dynamic event column IDs
  const [activeEventColumnIds, setActiveEventColumnIds] = useState<string[]>(() => {
    return events.filter((e) => e.isDynamicMemberField).map((e) => e.eventId);
  });

  // UI Dropdowns
  const [showColDropdown, setShowColDropdown] = useState(false);
  const [showEventColDropdown, setShowEventColDropdown] = useState(false);

  // Edit / View Modal
  const [editingMember, setEditingMember] = useState<NMOMember | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Filtered & Sorted Records
  const filteredRecords = useMemo(() => {
    return baseMembers.filter((m) => {
      // Text Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          m.membershipNumber.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.medicalCollege && m.medicalCollege.toLowerCase().includes(q)) ||
          (m.phone && m.phone.toLowerCase().includes(q)) ||
          (m.email && m.email.toLowerCase().includes(q)) ||
          (m.registrationNumber && m.registrationNumber.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Filter Prant
      if (filterPrant !== 'All' && m.prant !== filterPrant) return false;

      // Filter Status
      if (filterStatus !== 'All' && m.status !== filterStatus) return false;

      // Filter Qualification
      if (filterQual !== 'All') {
        const q = (m.qualifications || '').toLowerCase();
        if (!q.includes(filterQual.toLowerCase())) return false;
      }

      return true;
    });
  }, [baseMembers, searchTerm, filterPrant, filterStatus, filterQual]);

  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      const aVal = a[sortField] || '';
      const bVal = b[sortField] || '';
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredRecords, sortField, sortDir]);

  // Paginated Slice
  const totalPages = Math.ceil(sortedRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, page, pageSize]);

  // Helper to get derived event field value for a member
  const getDerivedEventValue = (eventId: string, membershipNo: string, fieldType?: string) => {
    const reg = eventRegistrations.find(
      (r) =>
        r.eventId === eventId &&
        r.membershipNumber.toLowerCase() === membershipNo.toLowerCase()
    );

    if (!reg) {
      if (fieldType === 'Registered/Not Registered') return 'Not Registered';
      if (fieldType === 'Attended/Not Attended') return 'Not Attended';
      if (fieldType === 'Approved/Rejected') return '—';
      if (fieldType === 'Yes/No') return 'No';
      return '—';
    }

    if (fieldType === 'Attended/Not Attended') {
      return reg.attendanceStatus;
    }
    if (fieldType === 'Approved/Rejected') {
      return reg.registrationStatus;
    }
    if (fieldType === 'Yes/No') {
      return reg.attendanceStatus === 'Attended' ? 'Yes' : 'No';
    }
    return reg.attendanceStatus === 'Attended' ? 'Attended' : reg.registrationStatus;
  };

  const handleSort = (field: keyof NMOMember) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedNumbers.size === paginatedRecords.length) {
      setSelectedNumbers(new Set());
    } else {
      setSelectedNumbers(new Set(paginatedRecords.map((m) => m.membershipNumber)));
    }
  };

  const toggleSelectRow = (no: string) => {
    const next = new Set(selectedNumbers);
    if (next.has(no)) next.delete(no);
    else next.add(no);
    setSelectedNumbers(next);
  };

  // Bulk actions
  const handleBulkStatus = async (status: 'Active' | 'Inactive') => {
    for (const no of selectedNumbers) {
      const target = members.find((m) => m.membershipNumber === no);
      if (target) {
        await updateMember({ ...target, status });
      }
    }
    setSelectedNumbers(new Set());
  };

  const handleExportSelected = () => {
    const selected = members.filter((m) => selectedNumbers.has(m.membershipNumber));
    if (onExportSelected) {
      onExportSelected(selected);
    } else {
      // Trigger default CSV download
      const headers = ['Membership Number', 'Name', 'Prant', 'Qualifications', 'Medical College', 'Blood Group', 'Status'];
      const rows = selected.map((m) => [
        m.membershipNumber,
        `"${m.name}"`,
        m.prant,
        `"${m.qualifications}"`,
        `"${m.medicalCollege}"`,
        m.bloodGroup,
        m.status
      ]);
      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NMO_Selected_Members_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    }
  };

  return (
    <div className="space-y-6">
      {clearFeedback && (
        <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{clearFeedback}</span>
          </div>
          <button
            onClick={() => setClearFeedback(null)}
            className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search by Name, No, College, Reg No..."
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 focus:outline-hidden bg-white"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter Bar & Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Prant Filter */}
          {!isPrantAdmin && (
            <select
              value={filterPrant}
              onChange={(e) => {
                setFilterPrant(e.target.value as any);
                setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium text-slate-700"
            >
              <option value="All">All Prants</option>
              <option value="Gujarat">Gujarat Prant</option>
              <option value="Saurashtra">Saurashtra Prant</option>
            </select>
          )}

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium text-slate-700"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Pending">Pending</option>
          </select>

          {/* Dynamic Event Columns Dropdown (Option 7) */}
          <div className="relative">
            <button
              onClick={() => {
                setShowEventColDropdown(!showEventColDropdown);
                setShowColDropdown(false);
              }}
              className="px-3 py-2 text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Event Columns ({activeEventColumnIds.length})</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showEventColDropdown && (
              <div
                className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl p-3 z-30 text-xs space-y-2"
                onMouseLeave={() => setShowEventColDropdown(false)}
              >
                <div className="font-bold text-slate-800 pb-1 border-b border-slate-100 flex items-center justify-between">
                  <span>Dynamic Event Columns</span>
                  <span className="text-[10px] text-slate-500">Live Participation</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pt-1">
                  {dynamicEvents.map((evt) => {
                    const isChecked = activeEventColumnIds.includes(evt.eventId);
                    return (
                      <label
                        key={evt.eventId}
                        className="flex items-center gap-2 text-slate-700 hover:bg-slate-50 p-1.5 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setActiveEventColumnIds(
                                activeEventColumnIds.filter((id) => id !== evt.eventId)
                              );
                            } else {
                              setActiveEventColumnIds([...activeEventColumnIds, evt.eventId]);
                            }
                          }}
                          className="rounded text-red-700 focus:ring-red-600"
                        />
                        <span className="truncate">
                          {evt.fieldDisplayName || evt.title} ({evt.prant})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Standard Columns Selector */}
          <div className="relative">
            <button
              onClick={() => {
                setShowColDropdown(!showColDropdown);
                setShowEventColDropdown(false);
              }}
              className="px-3 py-2 text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Columns</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showColDropdown && (
              <div
                className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-xl p-3 z-30 text-xs space-y-2"
                onMouseLeave={() => setShowColDropdown(false)}
              >
                <div className="font-bold text-slate-800 pb-1 border-b border-slate-100">
                  Toggle Columns
                </div>
                {Object.keys(visibleColumns).map((key) => {
                  const k = key as keyof typeof visibleColumns;
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-slate-700 hover:bg-slate-50 p-1 rounded cursor-pointer capitalize"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[k]}
                        onChange={() =>
                          setVisibleColumns({ ...visibleColumns, [k]: !visibleColumns[k] })
                        }
                        className="rounded text-red-700 focus:ring-red-600"
                      />
                      <span>{k.replace(/([A-Z])/g, ' $1')}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add New Member Button */}
          <button
            onClick={() => {
              setEditingMember({
                membershipNumber: '',
                name: '',
                bloodGroup: 'B+',
                medicalCollege: 'B.J. Medical College, Ahmedabad',
                dob: '1995-01-01',
                email: '',
                gender: 'Male',
                memberOn: new Date().toISOString().split('T')[0],
                studentMembershipValidTill: '2030-01-01',
                address: '',
                pincode: '380001',
                nmoState: 'Gujarat',
                phone: '',
                prant: isPrantAdmin && assignedPrant === 'Saurashtra' ? 'Saurashtra' : 'Gujarat',
                qualifications: 'MBBS',
                registrationNumber: '',
                role: 'member',
                accountStatus: 'Active',
                status: 'Active'
              });
              setIsCreatingNew(true);
            }}
            className="px-3.5 py-2 text-xs font-semibold bg-red-700 hover:bg-red-800 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Member</span>
          </button>

          {/* Refresh Database Button */}
          <button
            onClick={async () => {
              try {
                const res = await refreshFromDatabase(true);
                setClearFeedback(`Successfully synced ${res.usersCount} members from Firestore database.`);
                setTimeout(() => setClearFeedback(null), 4000);
              } catch (err: any) {
                alert('Database sync failed: ' + err.message);
              }
            }}
            disabled={isSyncing}
            className="px-3.5 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Reload latest records from Firestore"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isSyncing ? 'animate-spin text-red-600' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Refresh DB'}</span>
            {lastSyncTime && (
              <span className="text-[10px] text-slate-500 font-mono hidden lg:inline">
                ({lastSyncTime})
              </span>
            )}
          </button>

          {/* Clear Non-Admin Members Button */}
          {(currentUser?.role === 'super_admin' || currentUser?.role === 'state_admin') && (
            <button
              onClick={() => {
                setClearInputText('');
                setShowClearModal(true);
              }}
              className="px-3.5 py-2 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Clear all regular members while strictly keeping admins and superadmin"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Clear Members (Keep Admins)</span>
              {nonAdminCount > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-200 text-rose-800 rounded-full text-[10px] font-mono font-bold">
                  {nonAdminCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions Banner if rows selected */}
      {selectedNumbers.size > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-red-900">
            {selectedNumbers.size} member{selectedNumbers.size > 1 ? 's' : ''} selected
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportSelected}
              className="px-3 py-1.5 bg-white border border-red-300 text-red-800 font-semibold rounded-md hover:bg-red-100 transition-colors flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Selected</span>
            </button>
            <button
              onClick={() => handleBulkStatus('Active')}
              className="px-3 py-1.5 bg-emerald-700 text-white font-semibold rounded-md hover:bg-emerald-800 transition-colors"
            >
              Mark Active
            </button>
            <button
              onClick={() => handleBulkStatus('Inactive')}
              className="px-3 py-1.5 bg-slate-700 text-white font-semibold rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Mark Inactive
            </button>
            <button
              onClick={async () => {
                const count = selectedNumbers.size;
                if (!confirm(`Are you sure you want to permanently delete all ${count} selected members from Firestore and local cache?`)) return;
                try {
                  const deleted = await deleteMultipleUsers(Array.from(selectedNumbers));
                  setSelectedNumbers(new Set());
                  setClearFeedback(`Successfully deleted ${deleted} selected members from Firestore.`);
                  setTimeout(() => setClearFeedback(null), 4000);
                } catch (e: any) {
                  alert('Delete failed: ' + e.message);
                }
              }}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-md transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedNumbers.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Spreadsheet-Like Member Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
              <tr>
                <th className="p-3.5 w-10 text-center">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-700">
                    {selectedNumbers.size > 0 && selectedNumbers.size === paginatedRecords.length ? (
                      <CheckSquare className="w-4 h-4 text-red-700" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>

                {visibleColumns.membershipNumber && (
                  <th
                    onClick={() => handleSort('membershipNumber')}
                    className="p-3.5 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Membership No</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}

                {visibleColumns.name && (
                  <th
                    onClick={() => handleSort('name')}
                    className="p-3.5 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Name</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}

                {visibleColumns.prant && (
                  <th
                    onClick={() => handleSort('prant')}
                    className="p-3.5 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Prant</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                )}

                {visibleColumns.qualifications && (
                  <th className="p-3.5 whitespace-nowrap">Qualifications</th>
                )}

                {visibleColumns.medicalCollege && (
                  <th className="p-3.5 whitespace-nowrap">Medical College</th>
                )}

                {visibleColumns.bloodGroup && (
                  <th className="p-3.5 whitespace-nowrap text-center">Blood</th>
                )}

                {visibleColumns.phone && (
                  <th className="p-3.5 whitespace-nowrap">Phone</th>
                )}

                {visibleColumns.registrationNumber && (
                  <th className="p-3.5 whitespace-nowrap">Reg No</th>
                )}

                {/* DYNAMIC EVENT COLUMNS (Option 7) */}
                {activeEventColumnIds.map((eventId) => {
                  const evt = events.find((e) => e.eventId === eventId);
                  return (
                    <th
                      key={eventId}
                      className="p-3.5 whitespace-nowrap bg-amber-50/70 text-amber-900 border-x border-amber-200/80 font-bold"
                      title={evt?.title}
                    >
                      <div className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>{evt?.fieldDisplayName || evt?.title}</span>
                      </div>
                    </th>
                  );
                })}

                {visibleColumns.status && (
                  <th className="p-3.5 whitespace-nowrap">Status</th>
                )}

                <th className="p-3.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-12 text-center text-slate-500 text-xs space-y-2">
                    <p className="font-semibold text-slate-700 text-sm">
                      {members.length === 0 ? 'No Member Records in Database' : 'No records match the current search filters.'}
                    </p>
                    <p className="text-slate-400 max-w-sm mx-auto">
                      {members.length === 0
                        ? 'Upload your official NMO member spreadsheet via "Import CSV" in the sidebar or click "Add Member" above to create an entry.'
                        : 'Try adjusting your search query or reset the filters.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((m) => {
                  const isSelected = selectedNumbers.has(m.membershipNumber);
                  return (
                    <tr
                      key={m.membershipNumber}
                      className={`hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-red-50/40' : ''
                      }`}
                    >
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => toggleSelectRow(m.membershipNumber)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-red-700" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {visibleColumns.membershipNumber && (
                        <td className="p-3.5 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {m.membershipNumber}
                        </td>
                      )}

                      {visibleColumns.name && (
                        <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                          {m.name}
                        </td>
                      )}

                      {visibleColumns.prant && (
                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              m.prant === 'Saurashtra' ? 'text-blue-700' : 'text-red-700'
                            }`}
                          >
                            {m.prant}
                          </span>
                        </td>
                      )}

                      {visibleColumns.qualifications && (
                        <td className="p-3.5 text-slate-700 whitespace-nowrap">
                          {m.qualifications || '—'}
                        </td>
                      )}

                      {visibleColumns.medicalCollege && (
                        <td className="p-3.5 text-slate-600 whitespace-nowrap max-w-xs truncate">
                          {m.medicalCollege}
                        </td>
                      )}

                      {visibleColumns.bloodGroup && (
                        <td className="p-3.5 text-center font-bold text-red-700 whitespace-nowrap">
                          {m.bloodGroup || '—'}
                        </td>
                      )}

                      {visibleColumns.phone && (
                        <td className="p-3.5 font-mono text-slate-600 whitespace-nowrap">
                          {m.phone || '—'}
                        </td>
                      )}

                      {visibleColumns.registrationNumber && (
                        <td className="p-3.5 font-mono text-slate-700 whitespace-nowrap">
                          {m.registrationNumber || '—'}
                        </td>
                      )}

                      {/* DYNAMIC EVENT COLUMN CELLS */}
                      {activeEventColumnIds.map((eventId) => {
                        const evt = events.find((e) => e.eventId === eventId);
                        const cellVal = getDerivedEventValue(
                          eventId,
                          m.membershipNumber,
                          evt?.fieldType
                        );
                        const isAttended = cellVal === 'Attended' || cellVal === 'Yes';
                        const isRegistered = cellVal === 'Registered' || cellVal === 'Approved';

                        return (
                          <td
                            key={eventId}
                            className="p-3.5 text-center whitespace-nowrap border-x border-amber-100 bg-amber-50/20"
                          >
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                isAttended
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isRegistered
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'text-slate-400'
                              }`}
                            >
                              {cellVal}
                            </span>
                          </td>
                        );
                      })}

                      {visibleColumns.status && (
                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              m.status === 'Active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                      )}

                      {/* Actions */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditingMember(m);
                              setIsCreatingNew(false);
                            }}
                            className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-slate-100 rounded transition-colors"
                            title="Edit Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {currentUser?.role === 'super_admin' && (
                            <button
                              onClick={() => {
                                if (confirm(`Delete member ${m.name} (${m.membershipNumber})?`)) {
                                  deleteMember(m.membershipNumber);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Showing <strong>{(page - 1) * pageSize + 1}</strong> to{' '}
            <strong>{Math.min(page * pageSize, sortedRecords.length)}</strong> of{' '}
            <strong>{sortedRecords.length}</strong> total records
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white disabled:opacity-40 font-medium hover:bg-slate-100"
              >
                Previous
              </button>
              <span className="px-2 font-bold text-slate-700">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white disabled:opacity-40 font-medium hover:bg-slate-100"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit / Add Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">
                {isCreatingNew ? 'Add New Member to Master Database' : `Edit Member: ${editingMember.name}`}
              </h3>
              <button
                onClick={() => setEditingMember(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIsSavingMember(true);
                try {
                  const cleanNo = (editingMember.membershipNumber || '').trim().toUpperCase();
                  if (!cleanNo) {
                    throw new Error('Please provide a valid Membership Number.');
                  }
                  const recordToSave = {
                    ...editingMember,
                    membershipNumber: cleanNo,
                    customPassword: cleanNo,
                    hasCustomPassword: false
                  };
                  if (isCreatingNew) {
                    await addMember(recordToSave);
                    setClearFeedback(
                      `Successfully added ${recordToSave.name || cleanNo} (${cleanNo}). Login ID: ${recordToSave.email || cleanNo}.`
                    );
                  } else {
                    await updateMember(recordToSave);
                    setClearFeedback(`Successfully updated member ${recordToSave.name || cleanNo} (${cleanNo})`);
                  }
                  setEditingMember(null);
                  setIsCreatingNew(false);
                  setTimeout(() => setClearFeedback(null), 6000);
                } catch (err: any) {
                  alert('Error saving member: ' + (err.message || 'Unknown error'));
                } finally {
                  setIsSavingMember(false);
                }
              }}
              className="space-y-4 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-700 font-semibold">
                      Membership Number *
                    </label>
                    {isCreatingNew && (
                      <button
                        type="button"
                        onClick={() => {
                          const autoNo = `NMO-${isPrantAdmin && assignedPrant === 'Saurashtra' ? 'SAU' : 'GUJ'}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
                          setEditingMember({ ...editingMember, membershipNumber: autoNo });
                        }}
                        className="text-[10px] text-red-700 hover:text-red-900 font-semibold hover:underline cursor-pointer"
                      >
                        Auto-Generate
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    disabled={!isCreatingNew}
                    value={editingMember.membershipNumber}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, membershipNumber: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. 231112001791 or NMO-GUJ-2026-001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
                  />
                  {isCreatingNew && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      🔒 Initial member credentials initialized securely for this membership number.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingMember.name}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Prant *
                  </label>
                  <select
                    value={editingMember.prant}
                    disabled={isPrantAdmin && assignedPrant !== 'All'}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, prant: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="Gujarat">Gujarat Prant</option>
                    <option value="Saurashtra">Saurashtra Prant</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Status *
                  </label>
                  <select
                    value={editingMember.status}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, status: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-emerald-800"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-semibold mb-1">
                    Medical College *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingMember.medicalCollege}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, medicalCollege: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Qualifications
                  </label>
                  <input
                    type="text"
                    value={editingMember.qualifications}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, qualifications: e.target.value })
                    }
                    placeholder="e.g. MBBS, MD (Medicine)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Council Reg No
                  </label>
                  <input
                    type="text"
                    value={editingMember.registrationNumber}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, registrationNumber: e.target.value })
                    }
                    placeholder="e.g. G-34582"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Blood Group
                  </label>
                  <input
                    type="text"
                    value={editingMember.bloodGroup}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, bloodGroup: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-red-700"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Phone / Mobile
                  </label>
                  <input
                    type="text"
                    value={editingMember.phone}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, phone: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={editingMember.email}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, email: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Valid Till
                  </label>
                  <input
                    type="date"
                    value={editingMember.studentMembershipValidTill}
                    onChange={(e) =>
                      setEditingMember({
                        ...editingMember,
                        studentMembershipValidTill: e.target.value
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMember}
                  className="px-5 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-lg font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingMember ? 'Saving...' : 'Save Record'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clear Non-Admin Members Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-rose-200 space-y-5">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900">Clear / Wipe Member Data</h4>
                <p className="text-xs text-rose-600 font-semibold">Danger Zone Operation</p>
              </div>
            </div>

            {/* Clear Mode Selector */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setClearMode('non_admin')}
                className={`py-2 px-3 rounded-lg transition-colors cursor-pointer ${
                  clearMode === 'non_admin'
                    ? 'bg-white text-rose-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Purge Non-Admins ({nonAdminCount})
              </button>
              <button
                type="button"
                onClick={() => setClearMode('all')}
                className={`py-2 px-3 rounded-lg transition-colors cursor-pointer ${
                  clearMode === 'all'
                    ? 'bg-rose-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Wipe All Members ({members.length})
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {clearMode === 'all' ? (
                <>
                  This will permanently wipe <strong>all {members.length} member records</strong> from Cloud Firestore <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-red-700 font-bold">Users</code> collection. Only your active Super Administrator account will be kept safe.
                </>
              ) : (
                <>
                  This will permanently delete all <strong>{nonAdminCount} regular member records</strong> from Cloud Firestore <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-red-700 font-bold">Users</code> collection. All verified administrative accounts are preserved untouched.
                </>
              )}
            </p>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>Automated Backup Protection</span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                An automatic JSON backup file of all user records will be immediately downloaded to your device before any deletion executes.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Type <span className="font-mono text-rose-600 font-black">CLEAR</span> to confirm:
              </label>
              <input
                type="text"
                value={clearInputText}
                onChange={(e) => setClearInputText(e.target.value)}
                placeholder="Type CLEAR"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono uppercase focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteClearUsers}
                disabled={clearInputText.trim().toUpperCase() !== 'CLEAR' || isClearing}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {isClearing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Clearing from Firestore...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{clearMode === 'all' ? 'Confirm & Wipe All Members' : 'Confirm & Purge Non-Admins'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
