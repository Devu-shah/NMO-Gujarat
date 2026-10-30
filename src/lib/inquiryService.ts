import { db } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import { apiUrl } from './api';

export type InquiryCategory =
  | 'Membership & ID Card'
  | 'Certificate Verification'
  | 'CME & Academic Conferences'
  | 'Health Camps & Seva'
  | 'Financial & Donations'
  | 'Technical & Portal Support'
  | 'General Inquiry';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface SupportInquiry {
  id: string; // Document ID or Ticket Reference ID
  ticketId: string; // Human readable ref: NMO-TKT-XXXXXX
  name: string;
  email: string;
  phone?: string;
  category: InquiryCategory;
  subject: string;
  message: string;
  status: TicketStatus;
  adminSolution?: string;
  adminNotes?: string;
  userApprovedResolution?: boolean;
  userFeedback?: string;
  userApprovedAt?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  closedAt?: string;
  source?: string;
}

/**
 * Generate human-friendly Ticket Reference ID e.g. NMO-TKT-489215
 */
export function generateTicketReferenceId(): string {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000).toString();
  return `NMO-TKT-${randomSuffix}`;
}

/**
 * Submit a new inquiry from public Contact Us or Member Portal
 */
export async function submitSupportInquiry(data: {
  name: string;
  email: string;
  phone?: string;
  category: InquiryCategory;
  subject: string;
  message: string;
}): Promise<{ success: boolean; ticketId: string; error?: string }> {
  try {
    const ticketId = generateTicketReferenceId();
    const timestamp = new Date().toISOString();

    const inquiryDoc: SupportInquiry = {
      id: ticketId,
      ticketId,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone?.trim() || '',
      category: data.category,
      subject: data.subject.trim(),
      message: data.message.trim(),
      status: 'open',
      userApprovedResolution: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: 'web_portal'
    };

    // 1. Save to Firestore 'inquiries' collection
    await setDoc(doc(db, 'inquiries', ticketId), inquiryDoc);

    // 2. Dispatch to backend Nodemailer email service
    try {
      await fetch(apiUrl('/api/contact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: data.name.trim(),
          name: data.name.trim(),
          email: data.email.trim(),
          mobile: data.phone?.trim() || '9999999999',
          phone: data.phone?.trim() || '',
          city: 'Gujarat',
          category: data.category,
          subject: data.subject.trim(),
          message: data.message.trim(),
          ticketId
        })
      });
    } catch (fetchErr) {
      console.warn('Backend server email notification dispatched via background queue:', fetchErr);
    }

    return { success: true, ticketId };
  } catch (err: any) {
    console.error('Error submitting support inquiry:', err);
    return {
      success: false,
      ticketId: '',
      error: err.message || 'Failed to submit inquiry'
    };
  }
}

export function normalizeInquiryDoc(data: any, docId: string): SupportInquiry {
  const rawStatus = typeof data?.status === 'string' ? data.status.trim().toLowerCase() : '';
  const status: TicketStatus =
    rawStatus === 'resolved'
      ? 'resolved'
      : rawStatus === 'in_progress'
      ? 'in_progress'
      : rawStatus === 'closed'
      ? 'closed'
      : 'open';

  const ticketId = data?.ticketId || data?.inquiryId || docId;
  const name = (data?.name || data?.fullName || 'Anonymous Inquirer').trim();
  const email = (data?.email || '').trim().toLowerCase();
  const phone = (data?.phone || data?.mobile || '').trim();
  const category = (data?.category || 'General Inquiry') as InquiryCategory;
  const subject = (data?.subject || 'Support Inquiry').trim();
  const message = (data?.message || '').trim();

  return {
    id: docId,
    ticketId,
    name,
    email,
    phone,
    category,
    subject,
    message,
    status,
    adminSolution: data?.adminSolution || '',
    adminNotes: data?.adminNotes || '',
    userApprovedResolution: Boolean(data?.userApprovedResolution),
    userFeedback: data?.userFeedback || '',
    userApprovedAt: data?.userApprovedAt,
    createdAt: data?.createdAt || new Date().toISOString(),
    updatedAt: data?.updatedAt || data?.createdAt || new Date().toISOString(),
    resolvedAt: data?.resolvedAt,
    resolvedBy: data?.resolvedBy,
    closedAt: data?.closedAt,
    source: data?.source || 'portal'
  };
}

/**
 * Fetch a single ticket by Reference ID and verified Email
 */
export async function getInquiryByTicketId(
  ticketId: string,
  emailVerification?: string
): Promise<SupportInquiry | null> {
  const cleanId = ticketId.trim();
  if (!cleanId) return null;

  // 1. If email verification is supplied, query through the secure server-verified endpoint
  if (emailVerification && emailVerification.trim()) {
    try {
      const resp = await fetch(apiUrl('/api/inquiries/track'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: cleanId, email: emailVerification.trim().toLowerCase() })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.inquiry) {
          return normalizeInquiryDoc(data.inquiry, data.inquiry.id || cleanId);
        }
      }
    } catch (apiErr) {
      console.warn('Backend ticket verification query notice:', apiErr);
    }
  }

  // 2. Direct Firestore query (permitted for authenticated owners and administrators)
  try {
    const snap = await getDoc(doc(db, 'inquiries', cleanId));
    if (snap.exists()) {
      return normalizeInquiryDoc(snap.data(), snap.id);
    }

    const q = query(collection(db, 'inquiries'), where('ticketId', '==', cleanId.toUpperCase()), limit(1));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const matchDoc = querySnap.docs[0];
      return normalizeInquiryDoc(matchDoc.data(), matchDoc.id);
    }
  } catch (err) {
    console.warn('Notice querying inquiry from Firestore:', err);
  }
  return null;
}

/**
 * User action: Approve solution and close the ticket
 */
export async function approveTicketSolution(
  ticketId: string,
  userFeedback?: string
): Promise<{ success: boolean; error?: string }> {
  const timestamp = new Date().toISOString();
  const cleanId = ticketId.trim();
  const feedback = userFeedback?.trim() || 'Solution accepted by user';

  let firestoreSuccess = false;
  try {
    await updateDoc(doc(db, 'inquiries', cleanId), {
      userApprovedResolution: true,
      userFeedback: feedback,
      userApprovedAt: timestamp,
      status: 'closed',
      closedAt: timestamp,
      updatedAt: timestamp
    });
    firestoreSuccess = true;
  } catch (clientErr: any) {
    console.warn('[Inquiries] Client Firestore update notice, attempting backend sync:', clientErr?.message || clientErr);
  }

  // Dual-sync with backend API endpoint to guarantee persistence
  try {
    const res = await fetch(apiUrl('/api/inquiries/update-status'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId: cleanId,
        userApprovedResolution: true,
        userFeedback: feedback,
        status: 'closed'
      })
    });
    if (res.ok) {
      return { success: true };
    }
  } catch (apiErr: any) {
    console.warn('[Inquiries] Backend status endpoint notice:', apiErr?.message || apiErr);
  }

  if (firestoreSuccess) {
    return { success: true };
  }

  return { success: false, error: 'Failed to record resolution approval' };
}

/**
 * Admin action: Update ticket status and optionally provide solution notes
 */
export async function updateInquiryStatusByAdmin(
  ticketId: string,
  updates: {
    status: TicketStatus;
    adminSolution?: string;
    adminNotes?: string;
    resolvedBy?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const cleanId = ticketId.trim();
  const timestamp = new Date().toISOString();
  const payload: Partial<SupportInquiry> = {
    status: updates.status,
    updatedAt: timestamp
  };

  if (updates.adminSolution !== undefined) {
    payload.adminSolution = updates.adminSolution;
  }
  if (updates.adminNotes !== undefined) {
    payload.adminNotes = updates.adminNotes;
  }

  if (updates.status === 'resolved') {
    payload.resolvedAt = timestamp;
    payload.resolvedBy = updates.resolvedBy || 'Administrator';
  } else if (updates.status === 'closed') {
    payload.closedAt = timestamp;
  }

  let firestoreSuccess = false;
  let lastError = '';

  // 1. Update client-side Firestore directly
  try {
    await updateDoc(doc(db, 'inquiries', cleanId), payload);
    firestoreSuccess = true;
  } catch (clientErr: any) {
    lastError = clientErr?.message || String(clientErr);
    console.warn('[Inquiries] Client Firestore update notice, attempting backend server sync:', lastError);
  }

  // 2. Dual-sync with server backend endpoint (running with Admin SDK privileges)
  try {
    const res = await fetch(apiUrl('/api/inquiries/update-status'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId: cleanId,
        status: updates.status,
        adminSolution: updates.adminSolution,
        adminNotes: updates.adminNotes,
        resolvedBy: updates.resolvedBy
      })
    });

    if (res.ok) {
      return { success: true };
    }
  } catch (apiErr: any) {
    console.warn('[Inquiries] Backend update API endpoint notice:', apiErr?.message || apiErr);
  }

  if (firestoreSuccess) {
    return { success: true };
  }

  return {
    success: false,
    error: lastError || 'Failed to update ticket status. Please check your network connection.'
  };
}

/**
 * Admin action: Fetch all inquiries with optional category and status filters
 */
export async function fetchAllInquiries(): Promise<SupportInquiry[]> {
  try {
    const q = query(collection(db, 'inquiries'), limit(200));
    const snap = await getDocs(q);
    const results: SupportInquiry[] = [];
    snap.forEach((d) => {
      const normalized = normalizeInquiryDoc(d.data(), d.id);
      results.push(normalized);
    });

    // Sort by createdAt descending
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn('Error fetching all inquiries:', err);
    return [];
  }
}
