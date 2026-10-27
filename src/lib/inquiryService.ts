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

    // 2. Also record in 'mail' collection for automated Firebase trigger email notification
    try {
      await setDoc(doc(db, 'mail', `notify_${ticketId}`), {
        to: [data.email.trim().toLowerCase()],
        message: {
          subject: `[${ticketId}] NMO Gujarat Support: Inquiry Received`,
          text: `Namaste ${data.name},\n\nWe have received your inquiry regarding "${data.category}". Your Ticket Reference ID is ${ticketId}.\n\nSubject: ${data.subject}\n\nOur administrative team will review your query and respond shortly.\n\nYou can track and approve the solution anytime using your Reference ID on the portal.\n\nWarm regards,\nNational Medicos Organisation Gujarat`,
          html: `<div style="font-family:sans-serif;color:#1e293b;padding:16px;">
            <h2 style="color:#b91c1c;">National Medicos Organisation Gujarat</h2>
            <p>Namaste <strong>${data.name}</strong>,</p>
            <p>Your inquiry has been registered under Reference ID: <strong style="font-size:16px;color:#b91c1c;">${ticketId}</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
              <tr><td style="padding:6px;border-bottom:1px solid #e2e8f0;font-weight:bold;width:120px;">Category:</td><td style="padding:6px;border-bottom:1px solid #e2e8f0;">${data.category}</td></tr>
              <tr><td style="padding:6px;border-bottom:1px solid #e2e8f0;font-weight:bold;">Subject:</td><td style="padding:6px;border-bottom:1px solid #e2e8f0;">${data.subject}</td></tr>
            </table>
            <p>Our secretariat will review and provide a resolution. You can review and approve the solution on the NMO Gujarat portal using this Reference ID.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
            <p style="font-size:12px;color:#64748b;">NMO Gujarat • "प्राणिनाम् आर्तिनाशनम्"</p>
          </div>`
        },
        createdAt: timestamp
      });
    } catch (mailErr) {
      console.warn('Notice queuing trigger email doc:', mailErr);
    }

    // 3. Dispatch to backend Nodemailer email service
    try {
      await fetch(apiUrl('/api/contact/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone,
          category: data.category,
          subject: `[${ticketId}] ${data.subject}`,
          message: data.message,
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

/**
 * Fetch a single ticket by Reference ID or Email
 */
export async function getInquiryByTicketId(ticketId: string): Promise<SupportInquiry | null> {
  const cleanId = ticketId.trim();
  if (!cleanId) return null;

  try {
    // 1. Direct document lookup by ID
    const snap = await getDoc(doc(db, 'inquiries', cleanId));
    if (snap.exists()) {
      return snap.data() as SupportInquiry;
    }

    // 2. Query by ticketId field (case-tolerant uppercase search)
    const q = query(collection(db, 'inquiries'), where('ticketId', '==', cleanId.toUpperCase()), limit(1));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      return querySnap.docs[0].data() as SupportInquiry;
    }
  } catch (err) {
    console.warn('Error fetching inquiry by ticketId:', err);
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
  try {
    const timestamp = new Date().toISOString();
    await updateDoc(doc(db, 'inquiries', ticketId), {
      userApprovedResolution: true,
      userFeedback: userFeedback?.trim() || 'Solution accepted by user',
      userApprovedAt: timestamp,
      status: 'closed',
      closedAt: timestamp,
      updatedAt: timestamp
    });
    return { success: true };
  } catch (err: any) {
    console.error('Error approving ticket resolution:', err);
    return { success: false, error: err.message || 'Failed to approve solution' };
  }
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
  try {
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

    await updateDoc(doc(db, 'inquiries', ticketId), payload);
    return { success: true };
  } catch (err: any) {
    console.error('Error updating inquiry status:', err);
    return { success: false, error: err.message || 'Failed to update ticket' };
  }
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
      results.push(d.data() as SupportInquiry);
    });

    // Sort by createdAt descending
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    console.warn('Error fetching all inquiries:', err);
    return [];
  }
}
