/**
 * NMO Gujarat — Firebase Cloud Function (2nd Gen)
 * Contact Us Email Dispatch Service
 * Recipient: devanshshah768@gmail.com
 *
 * Deployment:
 *   firebase deploy --only functions:sendContactEmail
 *
 * Requirements:
 *   - Firebase Blaze Plan (Pay-as-you-go, required for outbound SMTP / Gmail API networking)
 *   - Environment Secrets configured via Firebase CLI:
 *     firebase functions:secrets:set GMAIL_USER
 *     firebase functions:secrets:set GMAIL_APP_PASSWORD
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as nodemailer from 'nodemailer';

const RECIPIENT_EMAIL = 'devanshshah768@gmail.com';
const ALLOWED_CATEGORIES = [
  'Membership Inquiry',
  'Technical Support',
  'Event & Activities',
  'Profile & Membership Correction',
  'Feedback & Suggestions',
  'Report an Issue',
  'Other'
];

export const sendContactEmail = onRequest(
  {
    cors: true,
    region: 'asia-south1', // Mumbai region for lowest latency in Gujarat / India
    secrets: ['GMAIL_USER', 'GMAIL_APP_PASSWORD']
  },
  async (req, res) => {
    // Only accept POST requests
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
      return;
    }

    try {
      const {
        fullName,
        mobile,
        membershipId,
        email,
        city,
        category,
        subject,
        message,
        website_hp
      } = req.body;

      // 1. Honeypot bot protection
      if (website_hp) {
        res.status(200).json({ success: true, message: 'Inquiry received.' });
        return;
      }

      // 2. Strict Input Validation
      if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
        res.status(400).json({ success: false, error: 'Valid Full Name is required.' });
        return;
      }

      const cleanMobile = typeof mobile === 'string' ? mobile.trim().replace(/[\s\-]/g, '') : '';
      if (!cleanMobile || !/^[+]?[0-9]{10,15}$/.test(cleanMobile)) {
        res.status(400).json({ success: false, error: 'Valid 10-15 digit mobile number is required.' });
        return;
      }

      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ success: false, error: 'Valid email address is required.' });
        return;
      }

      if (!city || typeof city !== 'string' || city.trim().length < 2) {
        res.status(400).json({ success: false, error: 'City is required.' });
        return;
      }

      if (!category || !ALLOWED_CATEGORIES.includes(category)) {
        res.status(400).json({ success: false, error: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(', ')}` });
        return;
      }

      if (!subject || typeof subject !== 'string' || subject.trim().length < 3) {
        res.status(400).json({ success: false, error: 'Subject is required.' });
        return;
      }

      if (!message || typeof message !== 'string' || message.trim().length < 10) {
        res.status(400).json({ success: false, error: 'Message must be at least 10 characters.' });
        return;
      }

      // 3. Construct Subject: "<Category> : <Subject>"
      const emailSubject = `${category} : ${subject.trim()}`;
      const serverTimestamp = new Date().toISOString();
      const localTimeString = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'medium'
      });
      const inquiryId = `INQ-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 4. Construct Email Bodies
      const textBody = `
==================================================
NMO GUJARAT — OFFICIAL CONTACT INQUIRY
Reference ID: ${inquiryId}
Server Timestamp: ${serverTimestamp} (${localTimeString} IST)
==================================================

SENDER DETAILS:
--------------------------------------------------
Full Name:        ${fullName.trim()}
Mobile Number:    ${cleanMobile}
Email Address:    ${cleanEmail}
City / District:  ${city.trim()}
Membership ID:    ${membershipId ? membershipId.trim() : 'Not Provided'}
Inquiry Category: ${category}
Subject:          ${subject.trim()}

MESSAGE:
--------------------------------------------------
${message.trim()}

--------------------------------------------------
System:           NMO Gujarat Unified Web Portal
Fixed Recipient:  ${RECIPIENT_EMAIL}
==================================================
      `.trim();

      const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background-color: #f8fafc; padding: 20px;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0;">
    <div style="background: linear-gradient(135deg, #b91c1c 0%, #ea580c 100%); color: #ffffff; padding: 24px;">
      <h1 style="margin: 0; font-size: 20px;">National Medicos Organisation Gujarat</h1>
      <p style="margin: 4px 0 0; font-size: 12px; color: #fde047;">॥ प्राणिनाम् आर्तिनाशनम् ॥ • Official Contact Inquiry</p>
      <div style="display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 11px; margin-top: 10px;">
        Reference ID: ${inquiryId}
      </div>
    </div>
    <div style="padding: 24px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
        <tr><td style="padding: 8px; font-weight: bold; color: #64748b; width: 35%;">Category</td><td style="padding: 8px; font-weight: bold; color: #b91c1c;">${category}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #64748b;">Subject</td><td style="padding: 8px; font-weight: bold;">${subject.trim()}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #64748b;">Sender Name</td><td style="padding: 8px;">${fullName.trim()}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #64748b;">Mobile</td><td style="padding: 8px;"><a href="tel:${cleanMobile}">${cleanMobile}</a></td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #64748b;">Email</td><td style="padding: 8px;"><a href="mailto:${cleanEmail}">${cleanEmail}</a></td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #64748b;">City</td><td style="padding: 8px;">${city.trim()}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #64748b;">Membership ID</td><td style="padding: 8px;">${membershipId ? membershipId.trim() : 'Not Provided'}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; color: #64748b;">Timestamp</td><td style="padding: 8px;">${localTimeString} IST</td></tr>
      </table>
      <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px; white-space: pre-wrap;">
        ${message.trim()}
      </div>
    </div>
  </div>
</body>
</html>
      `.trim();

      // 5. Send Email via Nodemailer (Gmail App Password or SMTP)
      const gmailUser = process.env.GMAIL_USER;
      const gmailPass = process.env.GMAIL_APP_PASSWORD;

      if (!gmailUser || !gmailPass) {
        logger.warn('GMAIL_USER or GMAIL_APP_PASSWORD secret missing. Logging inquiry only.', { inquiryId });
        res.status(200).json({
          success: true,
          inquiryId,
          emailDelivered: false,
          emailConfigured: false,
          message: 'Inquiry securely logged. Note: Outgoing SMTP dispatch pending credentials setup.'
        });
        return;
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass
        }
      });

      await transporter.sendMail({
        from: `"NMO Gujarat Portal" <${gmailUser}>`,
        to: RECIPIENT_EMAIL,
        replyTo: cleanEmail,
        subject: emailSubject,
        text: textBody,
        html: htmlBody
      });

      logger.info('Email successfully dispatched to recipient', { inquiryId, recipient: RECIPIENT_EMAIL });

      res.status(200).json({
        success: true,
        inquiryId,
        recipient: RECIPIENT_EMAIL,
        emailDelivered: true,
        emailConfigured: true,
        timestamp: serverTimestamp,
        message: 'Your inquiry has been successfully sent to the NMO Gujarat administration.'
      });
    } catch (error: any) {
      logger.error('Error processing contact inquiry', error);
      res.status(500).json({
        success: false,
        error: 'An unexpected error occurred while processing your inquiry.'
      });
    }
  }
);
