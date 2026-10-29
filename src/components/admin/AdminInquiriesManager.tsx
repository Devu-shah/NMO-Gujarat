import React, { useState, useEffect } from 'react';
import { useNMO } from '../../context/NMOContext';
import {
  SupportInquiry,
  InquiryCategory,
  TicketStatus,
  fetchAllInquiries,
  updateInquiryStatusByAdmin
} from '../../lib/inquiryService';
import {
  Inbox,
  Filter,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  RefreshCw,
  Mail,
  Phone,
  User,
  Calendar,
  Tag,
  MessageSquare,
  ChevronRight,
  X,
  ExternalLink,
  ShieldCheck,
  Send,
  Sparkles,
  Check
} from 'lucide-react';

const CATEGORIES: ('All' | InquiryCategory)[] = [
  'All',
  'Membership & ID Card',
  'Certificate Verification',
  'CME & Academic Conferences',
  'Health Camps & Seva',
  'Technical & Portal Support',
  'Financial & Donations',
  'General Inquiry'
];

function formatTicketStatus(status?: string): string {
  if (!status) return 'OPEN';
  return String(status).replace(/_/g, ' ').toUpperCase();
}

function getStatusBadgeConfig(status?: string): { bg: string; text: string; dot: string } {
  const s = String(status || 'open').toLowerCase();
  if (s === 'in_progress') {
    return { bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' };
  }
  if (s === 'resolved') {
    return { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500' };
  }
  if (s === 'closed') {
    return { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' };
  }
  return { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500' };
}

export const AdminInquiriesManager: React.FC = () => {
  const { currentUser } = useNMO();
  const [inquiries, setInquiries] = useState<SupportInquiry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [categoryFilter, setCategoryFilter] = useState<'All' | InquiryCategory>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTicket, setSelectedTicket] = useState<SupportInquiry | null>(null);

  // Resolution form state inside modal
  const [solutionText, setSolutionText] = useState<string>('');
  const [adminNotesText, setAdminNotesText] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadInquiries = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAllInquiries();
      setInquiries(data);
    } catch (err) {
      console.warn('Failed to load inquiries:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInquiries();
  }, []);

  const openTicketDetail = (ticket: SupportInquiry) => {
    setSelectedTicket(ticket);
    setSolutionText(ticket.adminSolution || '');
    setAdminNotesText(ticket.adminNotes || '');
    setActionFeedback(null);
  };

  const handleUpdateStatus = async (newStatus: TicketStatus) => {
    if (!selectedTicket) return;
    setIsUpdating(true);
    setActionFeedback(null);
    try {
      const res = await updateInquiryStatusByAdmin(selectedTicket.id, {
        status: newStatus,
        adminSolution: solutionText.trim(),
        adminNotes: adminNotesText.trim(),
        resolvedBy: currentUser?.name || currentUser?.email || 'Administrator'
      });

      if (res.success) {
        setActionFeedback(`Ticket status updated to "${newStatus.replace('_', ' ').toUpperCase()}".`);
        // Update local state
        const updatedTicket: SupportInquiry = {
          ...selectedTicket,
          status: newStatus,
          adminSolution: solutionText.trim(),
          adminNotes: adminNotesText.trim(),
          updatedAt: new Date().toISOString(),
          resolvedAt: newStatus === 'resolved' ? new Date().toISOString() : selectedTicket.resolvedAt,
          resolvedBy: newStatus === 'resolved' ? (currentUser?.name || 'Administrator') : selectedTicket.resolvedBy
        };
        setSelectedTicket(updatedTicket);
        setInquiries((prev) => prev.map((item) => (item.id === selectedTicket.id ? updatedTicket : item)));
        setTimeout(() => setActionFeedback(null), 3000);
      } else {
        alert('Failed to update status: ' + (res.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error updating ticket: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Filter inquiries
  const filteredInquiries = inquiries.filter((item) => {
    if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;
    const itemStatus = (item.status || 'open').toLowerCase();
    if (statusFilter !== 'all' && itemStatus !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        (item.ticketId || '')?.toLowerCase().includes(q) ||
        (item.name || '')?.toLowerCase().includes(q) ||
        (item.email || '')?.toLowerCase().includes(q) ||
        (item.subject || '')?.toLowerCase().includes(q) ||
        (item.message || '')?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // Aggregate stats
  const totalCount = inquiries.length;
  const openCount = inquiries.filter((i) => (i.status || 'open') === 'open').length;
  const inProgressCount = inquiries.filter((i) => i.status === 'in_progress').length;
  const resolvedCount = inquiries.filter((i) => i.status === 'resolved').length;
  const closedCount = inquiries.filter((i) => i.status === 'closed').length;
  const userApprovedCount = inquiries.filter((i) => Boolean(i.userApprovedResolution)).length;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold uppercase tracking-wider mb-1.5">
            <Inbox className="w-3.5 h-3.5" />
            <span>Support Desk & Inquiries</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Inquiries & Support Tickets
          </h2>
          <p className="text-slate-600 text-xs sm:text-sm mt-0.5">
            Review incoming public requests, track reference IDs, provide administrative resolutions, and manage ticket lifecycle.
          </p>
        </div>

        <button
          type="button"
          onClick={loadInquiries}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Tickets</span>
        </button>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setStatusFilter('all')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-md'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">All Tickets</div>
          <div className="text-2xl font-black mt-1">{totalCount}</div>
        </div>

        <div
          onClick={() => setStatusFilter('open')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'open'
              ? 'bg-amber-600 text-white border-amber-600 shadow-md'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">Open</div>
          <div className="text-2xl font-black mt-1 text-amber-600 ${statusFilter === 'open' ? 'text-white' : ''}">
            {openCount}
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('in_progress')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'in_progress'
              ? 'bg-blue-600 text-white border-blue-600 shadow-md'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">In Progress</div>
          <div className="text-2xl font-black mt-1 text-blue-600 ${statusFilter === 'in_progress' ? 'text-white' : ''}">
            {inProgressCount}
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('resolved')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'resolved'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">Resolved</div>
          <div className="text-2xl font-black mt-1 text-emerald-600 ${statusFilter === 'resolved' ? 'text-white' : ''}">
            {resolvedCount}
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('closed')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer col-span-2 sm:col-span-1 ${
            statusFilter === 'closed'
              ? 'bg-slate-700 text-white border-slate-700 shadow-md'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">Closed & Approved</div>
          <div className="text-2xl font-black mt-1 text-slate-700 ${statusFilter === 'closed' ? 'text-white' : ''}">
            {closedCount}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        {/* Category Pills Preview */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>Filter By Inquiry Category</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Search input & Active Filters reset */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Ticket ID (e.g. NMO-TKT-123456), sender, subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500 bg-slate-50 focus:bg-white"
            />
          </div>

          <div className="text-xs text-slate-500 self-end sm:self-center font-medium">
            Showing <strong>{filteredInquiries.length}</strong> of {totalCount} inquiries
          </div>
        </div>
      </div>

      {/* Tickets List Table / Preview Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-2 border-red-700 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs">Loading inquiries from database...</p>
          </div>
        ) : filteredInquiries.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="font-bold text-slate-700 text-sm">No Inquiries Found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No inquiries match the current category or status filter. Change filters above or wait for new visitor submissions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3.5">Ticket Reference</th>
                  <th className="p-3.5">Sender</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Subject & Preview</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">User Approved</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInquiries.map((ticket) => {
                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => openTicketDetail(ticket)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      {/* Ticket Reference ID */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-xs bg-slate-100 text-slate-900 px-2 py-0.5 rounded border border-slate-200">
                          {ticket.ticketId || ticket.id}
                        </span>
                      </td>

                      {/* Sender */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{ticket.name}</div>
                        <div className="text-[11px] text-slate-500">{ticket.email}</div>
                      </td>

                      {/* Category */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {ticket.category}
                        </span>
                      </td>

                      {/* Subject & Preview */}
                      <td className="p-3.5 max-w-xs">
                        <div className="font-bold text-slate-800 truncate">{ticket.subject}</div>
                        <div className="text-[11px] text-slate-500 truncate">{ticket.message}</div>
                      </td>

                      {/* Date */}
                      <td className="p-3.5 whitespace-nowrap text-slate-500 text-[11px]">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </td>

                      {/* Status */}
                      <td className="p-3.5 whitespace-nowrap">
                        {(() => {
                          const badge = getStatusBadgeConfig(ticket.status);
                          return (
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${badge.bg} ${badge.text}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                              <span>{formatTicketStatus(ticket.status)}</span>
                            </span>
                          );
                        })()}
                      </td>

                      {/* User Approved */}
                      <td className="p-3.5 whitespace-nowrap">
                        {ticket.userApprovedResolution ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Approved</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Pending</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTicketDetail(ticket);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        >
                          Manage &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail & Resolution Modal */}
      {selectedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedTicket(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-7 space-y-5 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 text-xs max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs bg-slate-100 text-slate-900 px-2.5 py-1 rounded-md border border-slate-200">
                    {selectedTicket.ticketId || selectedTicket.id}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    {selectedTicket.category}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 mt-2">
                  {selectedTicket.subject}
                </h3>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Submitted on {new Date(selectedTicket.createdAt).toLocaleString()}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Message */}
            {actionFeedback && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{actionFeedback}</span>
              </div>
            )}

            {/* Sender Details Capsule */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-slate-400 font-medium block">Sender Name:</span>
                <span className="font-bold text-slate-800">{selectedTicket.name}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Email:</span>
                <a
                  href={`mailto:${selectedTicket.email}`}
                  className="font-bold text-blue-700 hover:underline flex items-center gap-1"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span className="truncate">{selectedTicket.email}</span>
                </a>
              </div>
              <div>
                <span className="text-slate-400 font-medium block">Phone:</span>
                <span className="font-bold text-slate-800">
                  {selectedTicket.phone || 'Not provided'}
                </span>
              </div>
            </div>

            {/* Original Inquiry Message */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 block">
                Inquiry Message:
              </label>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-800 whitespace-pre-wrap leading-relaxed text-xs">
                {selectedTicket.message}
              </div>
            </div>

            {/* User Resolution Approval Status */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>User Solution Approval:</span>
                </span>
                {selectedTicket.userApprovedResolution ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                    Approved by User
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                    Awaiting User Confirmation
                  </span>
                )}
              </div>
              {selectedTicket.userFeedback && (
                <div className="text-[11px] text-slate-600 italic">
                  User note: "{selectedTicket.userFeedback}"
                </div>
              )}
            </div>

            {/* Administrative Resolution Form */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="font-bold text-slate-800 block">
                Official Administrative Solution / Response:
              </label>
              <p className="text-[11px] text-slate-500">
                This response will be visible to the user when they track their Ticket Reference ID (<code>{selectedTicket.ticketId}</code>) on the portal.
              </p>
              <textarea
                rows={3}
                value={solutionText}
                onChange={(e) => setSolutionText(e.target.value)}
                placeholder="Enter the official solution, resolution steps, or instructions for the user..."
                className="w-full p-3 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Internal Admin Notes */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 block">
                Internal Administrative Notes (Private):
              </label>
              <input
                type="text"
                value={adminNotesText}
                onChange={(e) => setAdminNotesText(e.target.value)}
                placeholder="Internal notes, assigned officer, or action logs..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            {/* Lifecycle Control Buttons */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-bold">Set Ticket Status:</span>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => handleUpdateStatus('open')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer border ${
                    selectedTicket.status === 'open'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Open
                </button>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => handleUpdateStatus('in_progress')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer border ${
                    selectedTicket.status === 'in_progress'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  In Progress
                </button>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => handleUpdateStatus('resolved')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer border ${
                    selectedTicket.status === 'resolved'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Resolved
                </button>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => handleUpdateStatus('closed')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs cursor-pointer border ${
                    selectedTicket.status === 'closed'
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Close Ticket
                </button>
              </div>

              <a
                href={`mailto:${selectedTicket.email}?subject=${encodeURIComponent(
                  `[${selectedTicket.ticketId}] NMO Gujarat Support: ${selectedTicket.subject}`
                )}&body=${encodeURIComponent(
                  `Namaste ${selectedTicket.name},\n\nRegarding your inquiry (${selectedTicket.ticketId}):\n\n${solutionText}\n\nWarm regards,\nNational Medicos Organisation Gujarat`
                )}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Email to User</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
