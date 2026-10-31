import fs from 'fs';
import path from 'path';
import net from 'net';
import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import { validateHostForSSRF } from './ssrfValidator';

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
  provider: 'gmail' | 'smtp' | 'brevo' | 'sendgrid' | 'ses' | 'ethereal_test' | 'unconfigured';
  recipient: string;
  senderAddress?: string;
  senderName?: string;
  smtpHost?: string;
  smtpPort?: number;
  verified: boolean;
  lastError?: string;
  latencyMs?: number;
}

export interface StoredSmtpConfig {
  provider?: 'gmail' | 'smtp' | 'brevo' | 'sendgrid' | 'ses';
  gmailUser?: string;
  gmailAppPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  fromName?: string;
  fromEmail?: string;
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

    // Strip whitespaces from Google App Password and SMTP password
    const cleanGmailPass = config.gmailAppPassword ? config.gmailAppPassword.replace(/\s+/g, '') : undefined;
    const cleanSmtpPass = config.smtpPass ? config.smtpPass.replace(/\s+/g, '') : undefined;
    const cleanGmailUser = config.gmailUser ? config.gmailUser.trim().toLowerCase() : undefined;
    const cleanRecipient = config.recipientEmail ? config.recipientEmail.trim().toLowerCase() : undefined;
    const cleanFromEmail = config.fromEmail ? config.fromEmail.trim().toLowerCase() : undefined;

    const payload: StoredSmtpConfig = {
      ...config,
      provider: config.provider || (config.smtpHost && !config.smtpHost.includes('gmail') ? 'smtp' : 'gmail'),
      gmailUser: cleanGmailUser,
      gmailAppPassword: cleanGmailPass,
      smtpPass: cleanSmtpPass,
      fromEmail: cleanFromEmail,
      recipientEmail: cleanRecipient,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(SECURE_SMTP_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });

    // Synchronize in-memory process.env
    if (cleanGmailUser) {
      process.env.GMAIL_USER = cleanGmailUser;
    }
    if (cleanGmailPass) {
      process.env.GMAIL_APP_PASSWORD = cleanGmailPass;
    }
    if (cleanRecipient) {
      process.env.VITE_SUPER_ADMIN_EMAIL = cleanRecipient;
    }
    if (config.smtpHost) {
      process.env.SMTP_HOST = config.smtpHost;
    }
    if (config.smtpUser) {
      process.env.SMTP_USER = config.smtpUser;
    }
    if (cleanSmtpPass) {
      process.env.SMTP_PASS = cleanSmtpPass;
    }
    if (config.smtpPort) {
      process.env.SMTP_PORT = String(config.smtpPort);
    }
    if (config.fromName) {
      process.env.SMTP_FROM_NAME = config.fromName;
    }

    // Update .env file if present
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (cleanGmailUser) {
          if (envContent.includes('GMAIL_USER=')) {
            envContent = envContent.replace(/GMAIL_USER=.*/g, `GMAIL_USER="${cleanGmailUser}"`);
          } else {
            envContent += `\nGMAIL_USER="${cleanGmailUser}"`;
          }
        }
        if (cleanGmailPass) {
          if (envContent.includes('GMAIL_APP_PASSWORD=')) {
            envContent = envContent.replace(/GMAIL_APP_PASSWORD=.*/g, `GMAIL_APP_PASSWORD="${cleanGmailPass}"`);
          } else {
            envContent += `\nGMAIL_APP_PASSWORD="${cleanGmailPass}"`;
          }
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
      }
    } catch (envErr) {
      console.warn('[Email Service] Notice updating .env file:', envErr);
    }

    // Invalidate cached transporter to force re-instantiation
    cachedTransporter = null;
    lastVerifyStatus = false;
    lastVerifyError = null;
  } catch (err: any) {
    console.error('[Email Service] Failed to save stored SMTP config:', err?.message || err);
    throw err;
  }
}

export const PRIMARY_RECIPIENT_EMAIL = process.env.VITE_SUPER_ADMIN_EMAIL || process.env.GMAIL_USER || process.env.SMTP_USER || 'devanshshah768@gmail.com';

let cachedTransporter: Transporter | null = null;
let lastVerifyStatus = false;
let lastVerifyError: string | null = null;
let activeSenderAddress: string | null = null;
let activeSenderName: string | null = null;
let lastLatencyMs: number | undefined = undefined;
let etherealAccount: any = null;

/**
 * Initializes and verifies the Nodemailer transporter with robust anti-timeout defenses.
 * - Enforces fast connection timeout (8000ms), greeting timeout (8000ms), and socket timeout (15000ms)
 * - pool: false prevents frozen/dead socket timeouts common in containerized Cloud Run environments
 * - Multi-port fallback: Port 587 (STARTTLS) primary, Port 465 (SSL/TLS) secondary
 * - Priority: Stored configuration (Brevo / SendGrid / SES / Custom SMTP / Gmail) over process.env
 */
export async function getTransporter(forceRefresh: boolean = false): Promise<Transporter | null> {
  if (cachedTransporter && !forceRefresh) {
    return cachedTransporter;
  }
  if (forceRefresh) {
    cachedTransporter = null;
  }

  const stored = loadStoredSmtpConfig();
  const provider = stored?.provider || (stored?.smtpHost && !stored.smtpHost.includes('gmail') ? 'smtp' : 'gmail');

  const startMs = Date.now();

  // Mode A: Custom SMTP Server / Brevo / SendGrid / Amazon SES
  if (provider !== 'gmail' && (stored?.smtpHost || process.env.SMTP_HOST)) {
    const host = (stored?.smtpHost || process.env.SMTP_HOST)?.trim();
    const port = Number(stored?.smtpPort || process.env.SMTP_PORT) || 587;
    const user = (stored?.smtpUser || process.env.SMTP_USER)?.trim();
    const rawPass = (stored?.smtpPass || process.env.SMTP_PASS)?.trim();
    const pass = rawPass ? rawPass.replace(/\s+/g, '') : '';
    const secure = stored?.smtpSecure ?? (port === 465);

    if (host && user && pass) {
      try {
        const smtpTransporter = nodemailer.createTransport({
          host,
          port,
          secure,
          requireTLS: !secure && port === 587,
          auth: { user, pass },
          connectionTimeout: 8000,
          greetingTimeout: 8000,
          socketTimeout: 20000,
          pool: false, // Vital for Cloud Run: avoids stale socket timeouts
          tls: {
            rejectUnauthorized: process.env.SMTP_IGNORE_TLS !== 'true'
          }
        });

        await smtpTransporter.verify();
        lastLatencyMs = Date.now() - startMs;
        console.log(`[Email Service] SMTP transporter verified for ${host}:${port} (${lastLatencyMs}ms)`);
        cachedTransporter = smtpTransporter;
        lastVerifyStatus = true;
        lastVerifyError = null;
        activeSenderAddress = stored?.fromEmail || user;
        activeSenderName = stored?.fromName || 'National Medicos Organisation Gujarat';
        return cachedTransporter;
      } catch (smtpErr: any) {
        lastLatencyMs = Date.now() - startMs;
        const msg = smtpErr?.message || String(smtpErr);
        console.warn(`[Email Service] SMTP verification failed on ${host}:${port}:`, msg);
        lastVerifyStatus = false;
        lastVerifyError = `SMTP connection failed (${host}:${port}): ${msg}`;
      }
    }
  }

  // Mode B: Gmail Service with App Password (with strict anti-timeout guards)
  const gmailUser = (stored?.gmailUser || process.env.GMAIL_USER || stored?.smtpUser || process.env.SMTP_USER)?.trim();
  const rawGmailPass = (stored?.gmailAppPassword || process.env.GMAIL_APP_PASSWORD || stored?.smtpPass || process.env.SMTP_PASS)?.trim();
  const gmailPass = rawGmailPass ? rawGmailPass.replace(/\s+/g, '') : '';

  if (gmailUser && gmailPass) {
    // Strategy 1: smtp.gmail.com on Port 587 (STARTTLS) - standard submission port with minimal cloud egress blocks
    try {
      const port587Transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // STARTTLS
        requireTLS: true,
        auth: {
          user: gmailUser,
          pass: gmailPass
        },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 15000,
        pool: false, // Prevents stale pooled socket timeouts in Cloud Run
        tls: {
          rejectUnauthorized: false
        }
      });

      await port587Transporter.verify();
      lastLatencyMs = Date.now() - startMs;
      console.log(`[Email Service] Nodemailer Gmail 587 (STARTTLS) transporter verified successfully in ${lastLatencyMs}ms for ${gmailUser}`);
      cachedTransporter = port587Transporter;
      lastVerifyStatus = true;
      lastVerifyError = null;
      activeSenderAddress = stored?.fromEmail || gmailUser;
      activeSenderName = stored?.fromName || 'NMO Gujarat Secretariat';
      return cachedTransporter;
    } catch (err587: any) {
      console.warn('[Email Service] Port 587 notice, testing direct port 465 (SSL/TLS)...', err587?.message || err587);

      // Strategy 2: smtp.gmail.com on Port 465 (SSL/TLS)
      try {
        const port465Transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            user: gmailUser,
            pass: gmailPass
          },
          connectionTimeout: 8000,
          greetingTimeout: 8000,
          socketTimeout: 15000,
          pool: false,
          tls: {
            rejectUnauthorized: false
          }
        });

        await port465Transporter.verify();
        lastLatencyMs = Date.now() - startMs;
        console.log(`[Email Service] Direct smtp.gmail.com:465 transporter verified in ${lastLatencyMs}ms for ${gmailUser}`);
        cachedTransporter = port465Transporter;
        lastVerifyStatus = true;
        lastVerifyError = null;
        activeSenderAddress = stored?.fromEmail || gmailUser;
        activeSenderName = stored?.fromName || 'NMO Gujarat Secretariat';
        return cachedTransporter;
      } catch (err465: any) {
        lastLatencyMs = Date.now() - startMs;
        lastVerifyStatus = false;
        const rawErr = err465?.message || err587?.message || 'Authentication or connection timed out';

        if (rawErr.includes('535') || rawErr.includes('BadCredentials')) {
          lastVerifyError = `Gmail authentication rejected (535 Bad Credentials). Ensure 2-Step Verification is active on ${gmailUser} and generate a fresh 16-character App Password at https://myaccount.google.com/apppasswords`;
        } else if (rawErr.includes('ETIMEDOUT') || rawErr.includes('timeout')) {
          lastVerifyError = `Connection to Gmail SMTP timed out. For high-volume mass mailing, switch to Brevo or SendGrid in Email Settings (they use high-speed cloud relays).`;
        } else {
          lastVerifyError = rawErr;
        }
      }
    }
  }

  // Option 3: Fallback in non-production environments to Ethereal Email ONLY if NO credentials provided
  const hasUserConfig = Boolean((gmailUser && gmailPass) || (stored?.smtpHost && stored?.smtpUser && stored?.smtpPass));
  if (!hasUserConfig && process.env.NODE_ENV !== 'production' && !cachedTransporter) {
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
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
        pool: false
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
 * Lightweight TCP connection latency tester for SMTP hosts (587, 465, 2525)
 * Protected against SSRF and DNS rebinding by validating against private, loopback, and metadata ranges.
 */
export async function pingSmtpConnection(host: string, port: number = 587): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  const ssrfCheck = await validateHostForSSRF(host, port);
  if (!ssrfCheck.safe) {
    return {
      success: false,
      latencyMs: 0,
      error: ssrfCheck.error || 'Blocked by SSRF security policy.'
    };
  }

  const targetConnectHost = ssrfCheck.resolvedIp || host;

  return new Promise((resolve) => {
    const start = Date.now();
    const sock = net.createConnection({ host: targetConnectHost, port, timeout: 5000 }, () => {
      const latency = Date.now() - start;
      sock.end();
      resolve({ success: true, latencyMs: latency });
    });
    sock.on('timeout', () => {
      sock.destroy();
      resolve({ success: false, latencyMs: Date.now() - start, error: `Connection to ${host}:${port} timed out after 5000ms.` });
    });
    sock.on('error', (err: any) => {
      resolve({ success: false, latencyMs: Date.now() - start, error: 'Connection refused or blocked by firewall' });
    });
  });
}

/**
 * Returns diagnostic metadata regarding current email dispatch capability.
 */
export async function getEmailServiceStatus(forceRefresh: boolean = false): Promise<EmailServiceStatus> {
  if (forceRefresh || (!cachedTransporter && !lastVerifyError)) {
    await getTransporter(forceRefresh);
  }

  const stored = loadStoredSmtpConfig();
  const gmailUser = (stored?.gmailUser || process.env.GMAIL_USER)?.trim();
  const gmailPass = (stored?.gmailAppPassword || process.env.GMAIL_APP_PASSWORD)?.trim();
  const smtpHost = (stored?.smtpHost || process.env.SMTP_HOST)?.trim();

  let provider: EmailServiceStatus['provider'] = 'unconfigured';
  if (stored?.provider === 'brevo' || smtpHost?.includes('brevo')) {
    provider = 'brevo';
  } else if (stored?.provider === 'sendgrid' || smtpHost?.includes('sendgrid')) {
    provider = 'sendgrid';
  } else if (stored?.provider === 'ses' || smtpHost?.includes('amazonaws')) {
    provider = 'ses';
  } else if (smtpHost && smtpHost !== 'smtp.ethereal.email') {
    provider = 'smtp';
  } else if (gmailUser && gmailPass) {
    provider = 'gmail';
  } else if (etherealAccount) {
    provider = 'ethereal_test';
  }

  return {
    configured: provider !== 'unconfigured',
    provider,
    recipient: stored?.recipientEmail || PRIMARY_RECIPIENT_EMAIL,
    senderAddress: activeSenderAddress || stored?.fromEmail || gmailUser || (smtpHost ? `${smtpHost}` : undefined),
    senderName: activeSenderName || stored?.fromName || 'National Medicos Organisation Gujarat',
    smtpHost: stored?.smtpHost || (provider === 'gmail' ? 'smtp.gmail.com' : undefined),
    smtpPort: stored?.smtpPort || (provider === 'gmail' ? 587 : 587),
    verified: lastVerifyStatus,
    lastError: lastVerifyError || undefined,
    latencyMs: lastLatencyMs
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

  const stored = loadStoredSmtpConfig();
  const emailSubject = `${data.category} : ${data.subject.trim()}`;
  const fromAddress =
    activeSenderAddress ||
    process.env.GMAIL_USER ||
    stored?.gmailUser ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    stored?.smtpUser ||
    (etherealAccount ? etherealAccount.user : 'secretariat@nmogujarat.org');

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

  const rawRecipient = stored?.recipientEmail || PRIMARY_RECIPIENT_EMAIL;
  // Support multiple comma- or semicolon-separated recipient emails (e.g. secretariat@nmogujarat.org, devanshshah768@gmail.com)
  const recipientsList = rawRecipient
    .split(/[,;]/)
    .map((e: string) => e.trim())
    .filter((e: string) => e.length > 0 && e.includes('@'));
  const finalTo = recipientsList.length > 0 ? recipientsList : [PRIMARY_RECIPIENT_EMAIL];

  const mailOptions: SendMailOptions = {
    from: `"NMO Gujarat Portal" <${fromAddress}>`,
    to: finalTo,
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

    console.log(`[Email Service] Email sent successfully to [${finalTo.join(', ')}]. Message ID: ${info.messageId}`);
    if (previewUrl) {
      console.log(`[Email Service] Ethereal preview URL: ${previewUrl}`);
    }

    return {
      success: true,
      delivered: true,
      messageId: info.messageId,
      isTestAccount: isTest,
      previewUrl,
      recipient: finalTo.join(', '),
      timestamp
    };
  } catch (sendErr: any) {
    console.error('[Email Service] Error dispatching email:', sendErr.message || sendErr);
    return {
      success: false,
      delivered: false,
      recipient: finalTo.join(', '),
      timestamp,
      error: sendErr.message || 'SMTP delivery failed'
    };
  }
}

export interface BroadcastEmailPayload {
  recipients: string[];
  subject: string;
  message: string;
  targetDescription?: string;
  senderName?: string;
}

/**
 * Dispatches circulars or announcements to multiple recipients simultaneously.
 * Adheres strictly to Nodemailer standards:
 * - Employs BCC (Blind Carbon Copy) to preserve recipient privacy
 * - Chunks into batches of 50 to avoid SMTP connection timeouts or provider rate limits
 */
export async function sendBroadcastEmail(
  payload: BroadcastEmailPayload
): Promise<{ success: boolean; count: number; messageId?: string; error?: string }> {
  const transporter = await getTransporter();
  if (!transporter) {
    return {
      success: false,
      count: 0,
      error: 'Email transporter is not configured or unverified. Please configure SMTP/Gmail settings.'
    };
  }

  // Deduplicate and filter valid emails
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validRecipients = Array.from(
    new Set(
      (payload.recipients || [])
        .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
        .filter((e) => emailRegex.test(e))
    )
  );

  if (validRecipients.length === 0) {
    return {
      success: false,
      count: 0,
      error: 'No valid recipient email addresses were provided.'
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

  const localTimeString = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'medium'
  });

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
    .subject-title { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 16px; line-height: 1.4; border-bottom: 2px solid #fee2e2; padding-bottom: 12px; }
    .message-box { background-color: #ffffff; border-radius: 8px; padding: 12px 0; font-size: 14px; color: #334155; white-space: pre-wrap; line-height: 1.8; }
    .footer { background-color: #f8fafc; padding: 18px 28px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>National Medicos Organisation Gujarat</h1>
      <p>॥ प्राणिनाम् आर्तिनाशनम् ॥ • Official State Circular</p>
      <div class="badge">${payload.targetDescription || 'Official Communication'}</div>
    </div>
    <div class="content">
      <div class="subject-title">${payload.subject.trim()}</div>
      <div class="message-box">${payload.message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>
    <div class="footer">
      Sent by <strong>NMO Gujarat State Secretariat</strong> on ${localTimeString} IST.<br/>
      Official Website: <a href="https://nmogujarat.org" style="color: #b91c1c; text-decoration: none;">nmogujarat.org</a>
    </div>
  </div>
</body>
</html>
  `.trim();

  // For privacy and deliverability, send to groups using BCC in chunks of 30
  const CHUNK_SIZE = 30;
  let sentCount = 0;
  let lastMessageId = '';
  const totalBatches = Math.ceil(validRecipients.length / CHUNK_SIZE);
  const senderDisplayName = payload.senderName || stored?.fromName || 'National Medicos Organisation Gujarat';
  const fromHeader = `"${senderDisplayName}" <${fromAddress}>`;

  for (let i = 0; i < validRecipients.length; i += CHUNK_SIZE) {
    const chunk = validRecipients.slice(i, i + CHUNK_SIZE);
    const batchIndex = Math.floor(i / CHUNK_SIZE) + 1;
    try {
      const info = await transporter.sendMail({
        from: fromHeader,
        to: fromAddress, // Main recipient is Secretariat so member emails are never exposed
        bcc: chunk,      // BCC guarantees zero recipient visibility to others
        subject: payload.subject.trim(),
        text: `${payload.subject}\n\n${payload.message}\n\n---\nNational Medicos Organisation Gujarat\nhttps://nmogujarat.org`,
        html: htmlBody,
        replyTo: fromAddress
      });
      sentCount += chunk.length;
      lastMessageId = info.messageId;
      console.log(`[Email Service] Broadcast batch ${batchIndex}/${totalBatches} sent to ${chunk.length} recipients. ID: ${info.messageId}`);

      // Small throttling pause between batches to prevent SMTP server rate limit drops
      if (batchIndex < totalBatches) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } catch (chunkErr: any) {
      console.error(`[Email Service] Broadcast batch ${batchIndex} failed:`, chunkErr.message || chunkErr);
      if (sentCount === 0 && totalBatches === 1) {
        return {
          success: false,
          count: 0,
          error: chunkErr.message || 'SMTP delivery failed. Check your SMTP provider credentials or rate limits.'
        };
      }
    }
  }

  return {
    success: sentCount > 0,
    count: sentCount,
    messageId: lastMessageId
  };
}
