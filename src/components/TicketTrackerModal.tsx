import React, { useState } from 'react';
import {
  getInquiryByTicketId,
  approveTicketSolution,
  SupportInquiry
} from '../lib/inquiryService';
import {
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  X,
  MessageSquare,
  ShieldCheck,
  Send,
  Sparkles,
  AlertCircle,
  HelpCircle,
  FileCheck
} from 'lucide-react';

interface TicketTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTicketId?: string;
}

export const TicketTrackerModal: React.FC<TicketTrackerModalProps> = ({
  isOpen,
  onClose,
  initialTicketId = ''
}) => {
  const [ticketInput, setTicketInput] = useState<string>(initialTicketId);
  const [ticket, setTicket] = useState<SupportInquiry | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Approval state
  const [feedbackNote, setFeedbackNote] = useState<string>('');
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [approvalSuccess, setApprovalSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = ticketInput.trim();
    if (!cleanId) {
      setSearchError('Please enter your Ticket Reference ID (e.g. NMO-TKT-123456)');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setTicket(null);
    setApprovalSuccess(false);

    try {
      const found = await getInquiryByTicketId(cleanId);
      if (found) {
        setTicket(found);
      } else {
        setSearchError(`No support ticket found for Reference ID "${cleanId}". Please check your Reference ID and try again.`);
      }
    } catch (err: any) {
      setSearchError('Search failed: ' + err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleApproveSolution = async () => {
    if (!ticket) return;
    setIsApproving(true);
    try {
      const res = await approveTicketSolution(ticket.id, feedbackNote);
      if (res.success) {
        setApprovalSuccess(true);
        setTicket({
          ...ticket,
          userApprovedResolution: true,
          status: 'closed',
          userFeedback: feedbackNote || 'Solution accepted by user',
          closedAt: new Date().toISOString()
        });
      } else {
        alert('Failed to record approval: ' + res.error);
      }
    } catch (err: any) {
      alert('Error approving solution: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200 text-slate-800"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 text-xs max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center font-bold">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">
                Track Ticket & Approve Solution
              </h3>
              <p className="text-[11px] text-slate-500">
                Enter your Ticket Reference ID to check real-time progress and approve the resolution.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Enter Reference ID e.g. NMO-TKT-123456"
              value={ticketInput}
              onChange={(e) => setTicketInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500 uppercase"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold rounded-xl transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Track Ticket'}
          </button>
        </form>

        {searchError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {/* Ticket Details View */}
        {ticket && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Status Strip */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                  {ticket.ticketId}
                </span>
                <span className="ml-2 text-[11px] font-semibold text-slate-600">
                  Category: <strong>{ticket.category}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
                    ticket.status === 'open'
                      ? 'bg-amber-100 text-amber-800'
                      : ticket.status === 'in_progress'
                      ? 'bg-blue-100 text-blue-800'
                      : ticket.status === 'resolved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      ticket.status === 'open'
                        ? 'bg-amber-500'
                        : ticket.status === 'in_progress'
                        ? 'bg-blue-500'
                        : ticket.status === 'resolved'
                        ? 'bg-emerald-500'
                        : 'bg-slate-500'
                    }`}
                  />
                  <span>
                    Status: {ticket.status.replace('_', ' ').toUpperCase()}
                  </span>
                </span>
              </div>
            </div>

            {/* Inquiry Summary */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
              <div className="font-bold text-slate-900 text-sm">{ticket.subject}</div>
              <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                {ticket.message}
              </p>
              <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                Created: {new Date(ticket.createdAt).toLocaleString()}
              </div>
            </div>

            {/* Administrative Solution Section */}
            {ticket.adminSolution ? (
              <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Official Administrative Resolution</span>
                  </div>
                  {ticket.resolvedAt && (
                    <span className="text-[10px] text-emerald-700">
                      Resolved: {new Date(ticket.resolvedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-emerald-200/80 text-slate-800 leading-relaxed whitespace-pre-wrap font-sans text-xs">
                  {ticket.adminSolution}
                </div>

                {/* User Approval Box */}
                {ticket.userApprovedResolution ? (
                  <div className="p-3 bg-emerald-100/80 border border-emerald-300 rounded-xl text-emerald-900 font-semibold flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>You have approved this solution. Ticket closed.</span>
                    </div>
                    {ticket.closedAt && (
                      <span className="text-[10px] text-emerald-800">
                        {new Date(ticket.closedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-white rounded-xl border border-emerald-300 space-y-3">
                    <div className="font-bold text-slate-900">
                      Does this solution resolve your inquiry?
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Please confirm that the solution provided by the secretariat meets your requirements. Once approved, this ticket will be marked as closed.
                    </p>

                    <input
                      type="text"
                      placeholder="Optional feedback (e.g. Received certificate, issue resolved)"
                      value={feedbackNote}
                      onChange={(e) => setFeedbackNote(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />

                    <button
                      type="button"
                      onClick={handleApproveSolution}
                      disabled={isApproving}
                      className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isApproving ? 'Recording Approval...' : 'Approve Solution & Close Ticket'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">Under Administrative Review</div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Our team is currently reviewing your ticket. As soon as a resolution or official response is posted, it will appear right here for your review and approval.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
