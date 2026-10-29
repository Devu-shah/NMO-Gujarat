import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';

export interface ContactInquiryPayload {
  inquiryId: string;
  fullName: string;
  mobile: string;
  email: string;
  city: string;
  membershipId?: string;
  category: string;
  subject: string;
  message: string;
  clientIp?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  delivered: boolean;
  isTestAccount?: boolean;
  previewUrl?: string | false;
  error?: string;
  recipient: string;
  timestamp: string;
}

export interface EmailServiceStatus {
  configured: boolean;
  provider: 'gmail' | 'smtp' | 'ethereal_test' | 'unconfigured';
  recipient: string;
  senderAddress?: string;
  verified: boolean;
  lastError?: string;
}

export interface StoredSmtpConfig {
  gmailUser?: string;
  gmailAppPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  fromName?: string;
  recipientEmail?: string;
  updatedAt?: string;
}

const SECURE_CREDENTIALS_DIR = path.resolve(process.cwd(), '.credentials');
const SECURE_SMTP_FILE = path.join(SECURE_CREDENTIALS_DIR, 'smtp_config_secure.json');

export function loadStoredSmtpConfig(): StoredSmtpConfig | null {
  try {
    if (fs.existsSync(SECURE_SMTP_FILE)) {
      const raw = fs.readFileSync(SECURE_SMTP_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err: any) {
    console.warn('[Email Service] Notice loading stored SMTP config:', err?.message || err);
  }
  return null;
}

export function saveStoredSmtpConfig(config: StoredSmtpConfig): void {
  try {
    if (!fs.existsSync(SECURE_CREDENTIALS_DIR)) {
      fs.mkdirSync(SECURE_CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
    }
    const payload = {
      ...config,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(SECURE_SMTP_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
  } catch (err: any) {
    console.error('[Email Service] Failed to save stored SMTP config:', err?.message || err);
    throw err;
  }
}

export const PRIMARY_RECIPIENT_EMAIL = process.env.VITE_SUPER_ADMIN_EMAIL || process.env.SMTP_USER || 'secretariat@nmogujarat.org';

let cachedTransporter: Transporter | null = null;
let lastVerifyStatus = false;
let lastVerifyError: string | null = null;
let activeSenderAddress: string | null = null;
let etherealAccount: any = null;

/**
 * Initializes and verifies the Nodemailer transporter based on environment configuration.
 * Adheres strictly to Nodemailer documentation (https://nodemailer.com/):
 * - Priority 1: Gmail service with Google App Password (whitespaces automatically stripped)
 * - Priority 2: Custom SMTP server with pooled connections
 * - Priority 3 (fallback in dev/staging): Ethereal test account for real preview URLs
 */
export async function getTransporter(forceRefresh: boolean = false): Promise<Transporter | null> {
  if (cachedTransporter && !forceRefresh) {
    return cachedTransporter;
  }
  if (forceRefresh) {
    cachedTransporter = null;
  }

  const stored = loadStoredSmtpConfig();

  // Resolve Gmail configuration from process.env or securely stored config
  const gmailUser = (process.env.GMAIL_USER || stored?.gmailUser || process.env.SMTP_USER || stored?.smtpUser)?.trim();
  const rawGmailPass = (process.env.GMAIL_APP_PASSWORD || stored?.gmailAppPassword || process.env.SMTP_PASS || stored?.smtpPass)?.trim();
  // Strip all whitespaces (Google displays 16-character App Passwords grouped in 4-letter chunks like 'xxxx xxxx xxxx xxxx')
  const gmailPass = rawGmailPass ? rawGmailPass.replace(/\s+/g, '') : '';

  // Option 1: Gmail Service with App Password
  if (gmailUser && gmailPass && (process.env.GMAIL_USER || stored?.gmailUser || !process.env.SMTP_HOST || process.env.SMTP_HOST?.includes('gmail'))) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass
        },
        pool: true,
        maxConnections: 3,
        maxMessages: 50
      });

      await transporter.verify();
      console.log(`[Email Service] Nodemailer Gmail transporter verified successfully for: ${gmailUser}`);
      cachedTransporter = transporter;
      lastVerifyStatus = true;
      lastVerifyError = null;
      activeSenderAddress = gmailUser;
      return cachedTransporter;
    } catch (err: any) {
      console.warn('[Email Service] Gmail service verification notice, trying direct smtp.gmail.com:465 fallback...', err.message || err);
      try {
        const directTransporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            user: gmailUser,
            pass: gmailPass
          }
        });
        await directTransporter.verify();
        console.log(`[Email Service] Direct smtp.gmail.com:465 transporter verified successfully for: ${gmailUser}`);
        cachedTransporter = directTransporter;
        lastVerifyStatus = true;
        lastVerifyError = null;
        activeSenderAddress = gmailUser;
        return cachedTransporter;
      } catch (fallbackErr: any) {
        console.error('[Email Service] Gmail fallback verification failed:', fallbackErr.message || fallbackErr);
        lastVerifyStatus = false;
        lastVerifyError = fallbackErr.message || err.message || 'Gmail authentication failed. Please verify email and Google App Password.';
      }
    }
  }

  // Option 2: Generic SMTP Server (SendGrid, Brevo, AWS SES, Mailgun, etc.)
  const smtpHost = (process.env.SMTP_HOST || stored?.smtpHost)?.trim();
  const smtpUser = (process.env.SMTP_USER || stored?.smtpUser)?.trim();
  const rawSmtpPass = (process.env.SMTP_PASS || stored?.smtpPass)?.trim();
  const smtpPass = rawSmtpPass ? rawSmtpPass.replace(/\s+/g, '') : '';
  const smtpPort = Number(process.env.SMTP_PORT || stored?.smtpPort) || 587;
  const smtpSecure = (process.env.SMTP_SECURE === 'true' || stored?.smtpSecure === true) || smtpPort === 465;

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure, // true for 465, false for 587 / STARTTLS
        auth: {
          user: smtpUser,
          pass: smtpPass
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        tls: {
          rejectUnauthorized: process.env.SMTP_IGNORE_TLS !== 'true'
        }
      });

      await transporter.verify();
      console.log(`[Email Service] Nodemailer SMTP transporter verified successfully for: ${smtpHost}:${smtpPort}`);
      cachedTransporter = transporter;
      lastVerifyStatus = true;
      lastVerifyError = null;
      activeSenderAddress = smtpUser;
      return cachedTransporter;
    } catch (err: any) {
      console.error('[Email Service] SMTP transporter verification failed:', err.message || err);
      lastVerifyStatus = false;
      lastVerifyError = err.message || 'SMTP verification failed';
    }
  }

  // Option 3: Fallback in non-production environments to Ethereal Email for instant debugging & previews
  if (process.env.NODE_ENV !== 'production' && !cachedTransporter) {
    try {
      if (!etherealAccount) {
        etherealAccount = await nodemailer.createTestAccount();
        console.log(`[Email Service] Generated Ethereal test account: ${etherealAccount.user}`);
      }
      const testTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: etherealAccount.user,
          pass: etherealAccount.pass
        }
      });
      cachedTransporter = testTransporter;
      lastVerifyStatus = true;
      lastVerifyError = null;
      activeSenderAddress = etherealAccount.user;
      return cachedTransporter;
    } catch (etherealErr: any) {
      console.warn('[Email Service] Could not generate Ethereal test account:', etherealErr.message);
    }
  }

  return null;
}

/**
 * Returns diagnostic metadata regarding current email dispatch capability.
 */
export async function getEmailServiceStatus(forceRefresh: boolean = false): Promise<EmailServiceStatus> {
  if (forceRefresh || (!cachedTransporter && !lastVerifyError)) {
    await getTransporter(forceRefresh);
  }

  const stored = loadStoredSmtpConfig();
  const gmailUser = (process.env.GMAIL_USER || stored?.gmailUser)?.trim();
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || stored?.gmailAppPassword)?.trim();
  const smtpHost = (process.env.SMTP_HOST || stored?.smtpHost)?.trim();

  let provider: EmailServiceStatus['provider'] = 'unconfigured';
  if (gmailUser && gmailPass) {
    provider = 'gmail';
  } else if (smtpHost && smtpHost !== 'smtp.ethereal.email') {
    provider = 'smtp';
  } else if (etherealAccount) {
    provider = 'ethereal_test';
  }

  return {
    configured: provider !== 'unconfigured',
    provider,
    recipient: stored?.recipientEmail || PRIMARY_RECIPIENT_EMAIL,
    senderAddress: activeSenderAddress || gmailUser || (smtpHost ? `${smtpHost}` : undefined),
    verified: lastVerifyStatus,
    lastError: lastVerifyError || undefined
  };
}

/**
 * Dispatches a real test email through the active Nodemailer transporter.
 */
export async function sendTestEmail(recipientEmail: string): Promise<SendEmailResult> {
  const timestamp = new Date().toISOString();
  const transporter = await getTransporter(true);

  if (!transporter) {
    return {
      success: false,
      delivered: false,
      recipient: recipientEmail,
      timestamp,
      error: lastVerifyError || 'No email transporter configured. Please configure your Gmail Account & App Password or SMTP settings.'
    };
  }

  const stored = loadStoredSmtpConfig();
  const fromAddress =
    activeSenderAddress ||
    process.env.GMAIL_USER ||
    stored?.gmailUser ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    stored?.smtpUser ||
    'secretariat@nmogujarat.org';

  try {
    const info = await transporter.sendMail({
      from: `"NMO Gujarat Portal (Verification Test)" <${fromAddress}>`,
      to: recipientEmail,
      subject: `[NMO Gujarat] Nodemailer Test Dispatch (${new Date().toLocaleTimeString('en-IN')})`,
      text: `Greetings from NMO Gujarat Secretariat.\n\nThis is a verified test email confirming that Nodemailer has been properly configured with the email transporter on your server.\n\nServer Timestamp: ${timestamp}\nFrom: ${fromAddress}\nTo: ${recipientEmail}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 20px auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background: linear-gradient(135deg, #b91c1c 0%, #1e3a8a 100%); color: #ffffff; padding: 18px 20px; border-radius: 12px; margin-bottom: 20px;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 800;">NMO Gujarat Nodemailer Connected</h2>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #fde047;">Automated Server Transporter Verification</p>
          </div>
          <p style="font-size: 14px; color: #334155; line-height: 1.6;">This verified test email confirms that your Nodemailer SMTP transport service is operational and capable of dispatching outgoing member updates and contact notifications.</p>
          <div style="background: #f8fafc; border-left: 4px solid #16a34a; padding: 14px 18px; margin: 20px 0; font-size: 13px; line-height: 1.7; border-radius: 0 8px 8px 0;">
            <strong>Verification Status:</strong> <span style="color: #16a34a; font-weight: bold;">Verified & Active</span><br/>
            <strong>Sender Account:</strong> <code>${fromAddress}</code><br/>
            <strong>Target Recipient:</strong> <code>${recipientEmail}</code><br/>
            <strong>Dispatched At:</strong> ${timestamp}
          </div>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">National Medicos Organisation Gujarat Secretariat &middot; <a href="https://nmogujarat.org" style="color: #b91c1c; text-decoration: none;">nmogujarat.org</a></p>
        </div>
      `
    });

    const previewUrl = etherealAccount ? nodemailer.getTestMessageUrl(info) : false;
    return {
      success: true,
      delivered: true,
      messageId: info.messageId,
      previewUrl,
      recipient: recipientEmail,
      timestamp
    };
  } catch (sendErr: any) {
    console.error('[Email Service] Test email delivery failed:', sendErr.message || sendErr);
    return {
      success: false,
      delivered: false,
      recipient: recipientEmail,
      timestamp,
      error: sendErr.message || 'Failed to dispatch test email'
    };
  }
}

/**
 * Sends a standardized, formatted Contact Us inquiry email via Nodemailer.
 */
export async function sendContactInquiryEmail(
  data: ContactInquiryPayload
): Promise<SendEmailResult> {
  const timestamp = new Date().toISOString();
  const localTimeString = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'medium'
  });

  const transporter = await getTransporter();

  // If no transporter could be created, return structured result
  if (!transporter) {
    return {
      success: false,
      delivered: false,
      recipient: PRIMARY_RECIPIENT_EMAIL,
      timestamp,
      error: lastVerifyError || 'No email transporter configured (Set GMAIL_USER/GMAIL_APP_PASSWORD or SMTP variables in .env).'
    };
  }

  const emailSubject = `${data.category} : ${data.subject.trim()}`;
  const fromAddress =
    process.env.GMAIL_USER ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    (etherealAccount ? etherealAccount.user : 'no-reply@nmogujarat.org');

  const textBody = `
==================================================
NMO GUJARAT — OFFICIAL CONTACT INQUIRY
Reference ID: ${data.inquiryId}
Server Timestamp: ${timestamp} (${localTimeString} IST)
==================================================

SENDER DETAILS:
--------------------------------------------------
Full Name:        ${data.fullName.trim()}
Mobile Number:    ${data.mobile.trim()}
Email Address:    ${data.email.trim()}
City / District:  ${data.city.trim()}
Membership ID:    ${data.membershipId ? data.membershipId.trim() : 'Not Provided'}
Inquiry Category: ${data.category}
Subject:          ${data.subject.trim()}

MESSAGE:
--------------------------------------------------
${data.message.trim()}

--------------------------------------------------
Technical Metadata:
Origin IP:        ${data.clientIp || 'client_direct'}
System:           NMO Gujarat Unified Web Portal
Recipient:        ${PRIMARY_RECIPIENT_EMAIL}
==================================================
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; margin: 0; padding: 0; background-color: #f8fafc; }
    .container { max-width: 620px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #b91c1c 0%, #991b1b 50%, #1e3a8a 100%); color: #ffffff; padding: 24px 28px; text-align: left; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 4px 0 0 0; font-size: 12px; color: #fde047; font-style: italic; }
    .badge { display: inline-block; background-color: rgba(255, 255, 255, 0.2); padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; margin-top: 10px; }
    .content { padding: 28px; }
    .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    .details-table td { padding: 8px 12px; border-bottom: 1px solid #f8fafc; }
    .details-table td.label { width: 35%; font-weight: 700; color: #64748b; background-color: #f8fafc; border-radius: 6px 0 0 6px; }
    .details-table td.value { font-weight: 600; color: #0f172a; }
    .message-box { background-color: #fff7ed; border-left: 4px solid #ea580c; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px; color: #1e293b; white-space: pre-wrap; line-height: 1.7; }
    .footer { background-color: #f8fafc; padding: 16px 28px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>National Medicos Organisation Gujarat</h1>
      <p>॥ प्राणिनाम् आर्तिनाशनम् ॥ • Official Contact Inquiry</p>
      <div class="badge">Reference ID: ${data.inquiryId}</div>
    </div>
    <div class="content">
      <div class="section-title">Inquiry Details</div>
      <table class="details-table">
        <tr>
          <td class="label">Category</td>
          <td class="value"><span style="color: #b91c1c; font-weight: 800;">${data.category}</span></td>
        </tr>
        <tr>
          <td class="label">Subject</td>
          <td class="value"><strong>${data.subject.trim()}</strong></td>
        </tr>
        <tr>
          <td class="label">Sender Name</td>
          <td class="value">${data.fullName.trim()}</td>
        </tr>
        <tr>
          <td class="label">Mobile Number</td>
          <td class="value"><a href="tel:${data.mobile.trim()}" style="color: #0284c7; text-decoration: none;">${data.mobile.trim()}</a></td>
        </tr>
        <tr>
          <td class="label">Email Address</td>
          <td class="value"><a href="mailto:${data.email.trim()}" style="color: #0284c7; text-decoration: none;">${data.email.trim()}</a></td>
        </tr>
        <tr>
          <td class="label">City / District</td>
          <td class="value">${data.city.trim()}</td>
        </tr>
        <tr>
          <td class="label">Membership ID</td>
          <td class="value">${data.membershipId ? `<code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${data.membershipId.trim()}</code>` : '<em style="color: #94a3b8;">Not Provided</em>'}</td>
        </tr>
        <tr>
          <td class="label">Server Timestamp</td>
          <td class="value">${localTimeString} IST (${timestamp})</td>
        </tr>
      </table>

      <div class="section-title">Message Body</div>
      <div class="message-box">${data.message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>
    <div class="footer">
      This inquiry was submitted from the official NMO Gujarat website by <strong>${data.email.trim()}</strong>.<br/>
      Fixed Recipient: ${PRIMARY_RECIPIENT_EMAIL}
    </div>
  </div>
</body>
</html>
`.trim();

  const mailOptions: SendMailOptions = {
    from: `"NMO Gujarat Portal" <${fromAddress}>`,
    to: PRIMARY_RECIPIENT_EMAIL,
    replyTo: data.email.trim(),
    subject: emailSubject,
    text: textBody,
    html: htmlBody,
    headers: {
      'X-Inquiry-ID': data.inquiryId,
      'X-Category': data.category
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    const isTest = Boolean(etherealAccount && transporter === cachedTransporter);
    const previewUrl = isTest ? nodemailer.getTestMessageUrl(info) : false;

    console.log(`[Email Service] Email sent successfully. Message ID: ${info.messageId}`);
    if (previewUrl) {
      console.log(`[Email Service] Ethereal preview URL: ${previewUrl}`);
    }

    return {
      success: true,
      delivered: true,
      messageId: info.messageId,
      isTestAccount: isTest,
      previewUrl,
      recipient: PRIMARY_RECIPIENT_EMAIL,
      timestamp
    };
  } catch (sendErr: any) {
    console.error('[Email Service] Error dispatching email:', sendErr.message || sendErr);
    return {
      success: false,
      delivered: false,
      recipient: PRIMARY_RECIPIENT_EMAIL,
      timestamp,
      error: sendErr.message || 'SMTP delivery failed'
    };
  }
}
