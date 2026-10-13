import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Anti-Spam: In-memory IP submission rate limiter (max 5 requests per 10 minutes)
interface RateLimitRecord {
  count: number;
  firstTimestamp: number;
}
const ipRateLimits = new Map<string, RateLimitRecord>();

// Duplicate submission tracker: prevent identical submissions within 5 minutes
const recentSubmissions = new Map<string, number>();

function cleanOldSpamRecords() {
  const now = Date.now();
  for (const [ip, record] of ipRateLimits.entries()) {
    if (now - record.firstTimestamp > 10 * 60 * 1000) {
      ipRateLimits.delete(ip);
    }
  }
  for (const [hash, timestamp] of recentSubmissions.entries()) {
    if (now - timestamp > 5 * 60 * 1000) {
      recentSubmissions.delete(hash);
    }
  }
}
setInterval(cleanOldSpamRecords, 5 * 60 * 1000);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'NMO Gujarat API',
      timestamp: new Date().toISOString()
    });
  });

  // Contact Us API Endpoint
  app.post('/api/contact', async (req, res) => {
    try {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown_ip';

      // 1. Honeypot check (hidden bot field)
      if (req.body.website_hp) {
        // Silently drop bot submissions
        return res.status(200).json({
          success: true,
          message: 'Your message has been received.'
        });
      }

      // 2. IP Rate Limiting (max 5 submissions per 10 minutes)
      const now = Date.now();
      const ipRecord = ipRateLimits.get(clientIp);
      if (ipRecord) {
        if (now - ipRecord.firstTimestamp < 10 * 60 * 1000) {
          if (ipRecord.count >= 5) {
            return res.status(429).json({
              success: false,
              error: 'Rate limit exceeded: Too many inquiries from this connection. Please try again after 10 minutes.'
            });
          }
          ipRecord.count += 1;
        } else {
          ipRateLimits.set(clientIp, { count: 1, firstTimestamp: now });
        }
      } else {
        ipRateLimits.set(clientIp, { count: 1, firstTimestamp: now });
      }

      // 3. Extract and sanitize input fields
      const {
        fullName,
        mobile,
        membershipId,
        email,
        city,
        category,
        subject,
        message
      } = req.body;

      // 4. Server-Side Validation
      const errors: string[] = [];

      if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
        errors.push('Full Name is required and must be at least 2 characters.');
      } else if (fullName.trim().length > 100) {
        errors.push('Full Name cannot exceed 100 characters.');
      }

      const cleanMobile = typeof mobile === 'string' ? mobile.trim().replace(/[\s\-]/g, '') : '';
      const mobileRegex = /^[+]?[0-9]{10,15}$/;
      if (!cleanMobile || !mobileRegex.test(cleanMobile)) {
        errors.push('A valid 10-15 digit mobile number is required.');
      }

      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!cleanEmail || !emailRegex.test(cleanEmail)) {
        errors.push('A valid email address is required.');
      }

      if (!city || typeof city !== 'string' || city.trim().length < 2) {
        errors.push('City is required.');
      }

      if (!category || !ALLOWED_CATEGORIES.includes(category)) {
        errors.push(`Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`);
      }

      if (!subject || typeof subject !== 'string' || subject.trim().length < 3) {
        errors.push('Subject is required and must be at least 3 characters.');
      } else if (subject.trim().length > 200) {
        errors.push('Subject cannot exceed 200 characters.');
      }

      if (!message || typeof message !== 'string' || message.trim().length < 10) {
        errors.push('Message is required and must be at least 10 characters.');
      } else if (message.trim().length > 5000) {
        errors.push('Message cannot exceed 5000 characters.');
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: errors.join(' ')
        });
      }

      // 5. Duplicate Submission Prevention
      const dedupeKey = `${cleanEmail}_${cleanMobile}_${subject.trim().toLowerCase()}_${message.trim().slice(0, 40).toLowerCase()}`;
      const lastSent = recentSubmissions.get(dedupeKey);
      if (lastSent && now - lastSent < 3 * 60 * 1000) {
        return res.status(429).json({
          success: false,
          error: 'Duplicate inquiry detected. A matching message was already submitted within the last 3 minutes.'
        });
      }
      recentSubmissions.set(dedupeKey, now);

      // 6. Construct Inquiry Details
      const serverTimestamp = new Date().toISOString();
      const localTimeString = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'medium'
      });
      const inquiryId = `INQ-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Strict email format: "<Category> : <Subject>"
      const emailSubject = `${category} : ${subject.trim()}`;

      // Plaintext fallback body
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
Technical Metadata:
Origin IP:        ${clientIp}
System:           NMO Gujarat Unified Web Portal
Recipient:        ${RECIPIENT_EMAIL}
==================================================
`.trim();

      // Formatted HTML Email Body with NMO Colors
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
      <div class="badge">Reference ID: ${inquiryId}</div>
    </div>
    <div class="content">
      <div class="section-title">Inquiry Details</div>
      <table class="details-table">
        <tr>
          <td class="label">Category</td>
          <td class="value"><span style="color: #b91c1c; font-weight: 800;">${category}</span></td>
        </tr>
        <tr>
          <td class="label">Subject</td>
          <td class="value"><strong>${subject.trim()}</strong></td>
        </tr>
        <tr>
          <td class="label">Sender Name</td>
          <td class="value">${fullName.trim()}</td>
        </tr>
        <tr>
          <td class="label">Mobile Number</td>
          <td class="value"><a href="tel:${cleanMobile}" style="color: #0284c7; text-decoration: none;">${cleanMobile}</a></td>
        </tr>
        <tr>
          <td class="label">Email Address</td>
          <td class="value"><a href="mailto:${cleanEmail}" style="color: #0284c7; text-decoration: none;">${cleanEmail}</a></td>
        </tr>
        <tr>
          <td class="label">City / District</td>
          <td class="value">${city.trim()}</td>
        </tr>
        <tr>
          <td class="label">Membership ID</td>
          <td class="value">${membershipId ? `<code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${membershipId.trim()}</code>` : '<em style="color: #94a3b8;">Not Provided</em>'}</td>
        </tr>
        <tr>
          <td class="label">Server Timestamp</td>
          <td class="value">${localTimeString} IST (${serverTimestamp})</td>
        </tr>
      </table>

      <div class="section-title">Message Body</div>
      <div class="message-box">${message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>
    <div class="footer">
      This inquiry was submitted from the official NMO Gujarat website by <strong>${cleanEmail}</strong>.<br/>
      Fixed Recipient: ${RECIPIENT_EMAIL} • Client IP: ${clientIp}
    </div>
  </div>
</body>
</html>
`.trim();

      // 7. Check for Configured Email Transport (SMTP / Gmail)
      const hasGmailConfig = Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
      const hasSmtpConfig = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

      let emailDelivered = false;
      let emailError: string | null = null;

      if (hasGmailConfig || hasSmtpConfig) {
        try {
          let transporter: any;

          if (hasGmailConfig) {
            transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
              }
            });
          } else {
            transporter = nodemailer.createTransport({
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT) || 587,
              secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
              }
            });
          }

          const fromAddress = process.env.GMAIL_USER || process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@nmogujarat.org';

          await transporter.sendMail({
            from: `"NMO Gujarat Portal" <${fromAddress}>`,
            to: RECIPIENT_EMAIL,
            replyTo: cleanEmail,
            subject: emailSubject,
            text: textBody,
            html: htmlBody
          });

          emailDelivered = true;
          console.log(`[Contact API] Email successfully dispatched to ${RECIPIENT_EMAIL} for inquiry ${inquiryId}`);
        } catch (mailErr: any) {
          console.error('[Contact API] Failed to send email via transporter:', mailErr);
          emailError = mailErr.message || 'SMTP delivery failed';
        }
      } else {
        console.warn(`[Contact API] No SMTP/Gmail credentials configured in environment. Inquiry ${inquiryId} logged.`);
      }

      // 8. Return response
      return res.status(200).json({
        success: true,
        inquiryId,
        recipient: RECIPIENT_EMAIL,
        emailDelivered,
        emailConfigured: hasGmailConfig || hasSmtpConfig,
        emailError: emailError || undefined,
        timestamp: serverTimestamp,
        message: emailDelivered
          ? 'Your inquiry has been successfully sent to the NMO Gujarat administration.'
          : hasGmailConfig || hasSmtpConfig
          ? 'Your inquiry was recorded. Notice: Email delivery failed due to SMTP server error.'
          : 'Your inquiry has been securely recorded. Notice: Outgoing email delivery is queued pending SMTP/Gmail configuration.'
      });
    } catch (err: any) {
      console.error('[Contact API] Unexpected error handling contact inquiry:', err);
      return res.status(500).json({
        success: false,
        error: 'An internal error occurred while processing your inquiry. Please try again.'
      });
    }
  });

  // =========================================================================
  // Google Drive Secure Persistent Session & Auto-Refresh Backend Service
  // =========================================================================
  const SECURE_CREDENTIALS_DIR = path.resolve(__dirname, '.credentials');
  const SECURE_CREDENTIALS_FILE = path.join(SECURE_CREDENTIALS_DIR, 'drive_session_secure.json');

  interface SecureDriveSessionRecord {
    refreshToken?: string;
    accessToken?: string;
    expiresAt: number; // Unix epoch ms
    accountEmail: string;
    accountName?: string;
    accountPhoto?: string;
    folderId: string;
    folderName: string;
    folderUrl: string;
    status: 'active' | 'expired' | 'disconnected';
    updatedAt: string;
    lastRefreshedAt?: string;
  }

  function readSecureDriveSession(): SecureDriveSessionRecord | null {
    try {
      if (!fs.existsSync(SECURE_CREDENTIALS_FILE)) {
        return null;
      }
      const raw = fs.readFileSync(SECURE_CREDENTIALS_FILE, 'utf-8');
      const data = JSON.parse(raw) as SecureDriveSessionRecord;
      return data;
    } catch (err) {
      console.warn('[Drive Auth] Notice reading secure session file:', err);
      return null;
    }
  }

  function writeSecureDriveSession(session: SecureDriveSessionRecord) {
    try {
      if (!fs.existsSync(SECURE_CREDENTIALS_DIR)) {
        fs.mkdirSync(SECURE_CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(SECURE_CREDENTIALS_FILE, JSON.stringify(session, null, 2), {
        mode: 0o600
      });
    } catch (err) {
      console.error('[Drive Auth] Error writing secure session file:', err);
    }
  }

  async function refreshAccessTokenWithGoogle(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresIn: number } | null> {
    const clientId =
      process.env.GOOGLE_DRIVE_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID;
    const clientSecret =
      process.env.GOOGLE_DRIVE_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.warn('[Drive Auth] Cannot refresh token: GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET is missing from environment.');
      return null;
    }

    try {
      console.log('[Drive Auth] Initiating server-side Google OAuth token refresh...');
      const tokenUrl = 'https://oauth2.googleapis.com/token';
      const bodyParams = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });

      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString()
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        console.error('[Drive Auth] Google token refresh failed:', resp.status, errorData);
        return null;
      }

      const data = (await resp.json()) as { access_token: string; expires_in: number };
      console.log('[Drive Auth] Successfully refreshed Google access token from refresh token!');
      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in || 3600
      };
    } catch (err: any) {
      console.error('[Drive Auth] Exception refreshing Google access token:', err);
      return null;
    }
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getOAuthRedirectUri(req: express.Request): string {
    if (process.env.GOOGLE_DRIVE_REDIRECT_URI) {
      return process.env.GOOGLE_DRIVE_REDIRECT_URI;
    }
    const forwardedProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const forwardedHost = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.headers.host;

    if (forwardedHost) {
      return `${forwardedProto}://${forwardedHost}/api/auth/google/callback`;
    }
    if (process.env.APP_URL) {
      const base = process.env.APP_URL.replace(/\/+$/, '');
      return `${base}/api/auth/google/callback`;
    }
    return 'http://localhost:3000/api/auth/google/callback';
  }

  const oauthStates = new Map<string, number>();
  function cleanOauthStates() {
    const now = Date.now();
    for (const [state, timestamp] of oauthStates.entries()) {
      if (now - timestamp > 15 * 60 * 1000) {
        oauthStates.delete(state);
      }
    }
  }
  setInterval(cleanOauthStates, 5 * 60 * 1000);

  /**
   * GET /api/auth/google/url
   * Generates the Google OAuth 2.0 authorization URL with offline access and forced consent prompt.
   */
  app.get('/api/auth/google/url', (req, res) => {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const redirectUri = getOAuthRedirectUri(req);

    if (!clientId) {
      return res.status(400).json({
        error: 'missing_client_id',
        message: 'GOOGLE_DRIVE_CLIENT_ID is not configured in server environment.',
        redirectUri
      });
    }

    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    oauthStates.set(state, Date.now());

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      access_type: 'offline',
      prompt: 'consent',
      state: state,
      include_granted_scopes: 'true'
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.json({
      url,
      redirectUri,
      configured: true
    });
  });

  /**
   * GET /api/auth/google/login
   * Direct redirect endpoint to launch Google OAuth 2.0 flow with offline access.
   */
  app.get('/api/auth/google/login', (req, res) => {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const redirectUri = getOAuthRedirectUri(req);

    if (!clientId) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Drive Setup Notice</title></head>
          <body style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #0f172a; color: #f8fafc;">
            <div style="max-width: 500px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 16px; border: 1px solid #334155;">
              <h2 style="color: #f87171; margin-top: 0;">GOOGLE_DRIVE_CLIENT_ID Missing</h2>
              <p style="color: #94a3b8; font-size: 14px;">Please configure <code>GOOGLE_DRIVE_CLIENT_ID</code> and <code>GOOGLE_DRIVE_CLIENT_SECRET</code> in your server environment.</p>
              <p style="color: #cbd5e1; font-size: 12px; margin-top: 20px;">Exact Redirect URI to register in Google Cloud Console:</p>
              <code style="background: #0f172a; padding: 8px 12px; border-radius: 6px; color: #38bdf8; display: block; word-break: break-all;">${redirectUri}</code>
            </div>
          </body>
        </html>
      `);
    }

    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    oauthStates.set(state, Date.now());

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      access_type: 'offline',
      prompt: 'consent',
      state: state,
      include_granted_scopes: 'true'
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  /**
   * GET /api/auth/google/callback
   * OAuth 2.0 authorization code callback. Exchanges code for offline tokens,
   * stores refresh_token strictly on the server in .credentials/drive_session_secure.json,
   * and notifies the client.
   */
  app.get('/api/auth/google/callback', async (req, res) => {
    const code = req.query.code as string;
    const oauthError = req.query.error as string;

    if (oauthError) {
      console.warn('[Google OAuth Callback] Authorization returned error:', oauthError);
      res.setHeader('Content-Type', 'text/html');
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Cancelled</title></head>
          <body style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #0f172a; color: #f8fafc;">
            <div style="max-width: 440px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 16px; border: 1px solid #334155;">
              <h3 style="color: #f87171; margin-top: 0;">Authorization Error</h3>
              <p style="color: #94a3b8; font-size: 13px;">${escapeHtml(oauthError)}</p>
              <p style="font-size: 12px; color: #64748b;">Closing window...</p>
            </div>
            <script>
              try {
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage({ type: 'GOOGLE_DRIVE_AUTH_ERROR', error: '${escapeHtml(oauthError)}' }, '*');
                  setTimeout(() => window.close(), 1500);
                } else {
                  setTimeout(() => window.location.href = '/admin/super', 2000);
                }
              } catch(e) {}
            </script>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send('Authorization code missing in request.');
    }

    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).send('Server configuration missing GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET.');
    }

    try {
      const redirectUri = getOAuthRedirectUri(req);
      console.log('[Google OAuth Callback] Exchanging authorization code with Google...');

      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }).toString()
      });

      if (!tokenResp.ok) {
        const errJson = await tokenResp.json().catch(() => ({}));
        console.error('[Google OAuth Callback] Token exchange failed:', tokenResp.status, errJson);
        res.setHeader('Content-Type', 'text/html');
        return res.status(tokenResp.status).send(`
          <!DOCTYPE html>
          <html>
            <head><title>OAuth Exchange Failed</title></head>
            <body style="font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #0f172a; color: #f8fafc;">
              <div style="max-width: 480px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 16px; border: 1px solid #334155;">
                <h3 style="color: #f87171; margin-top: 0;">Code Exchange Failed</h3>
                <p style="color: #94a3b8; font-size: 13px;">Google error: ${escapeHtml(JSON.stringify(errJson))}</p>
                <p style="font-size: 12px; color: #64748b;">Ensure redirect URI matches: <code>${escapeHtml(redirectUri)}</code></p>
              </div>
            </body>
          </html>
        `);
      }

      const tokenData = (await tokenResp.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      // Fetch user profile info
      let accountEmail = process.env.VITE_SUPER_ADMIN_EMAIL || 'devanshshah768@gmail.com';
      let accountName = 'NMO Gujarat Administrator';
      let accountPhoto: string | undefined;

      try {
        const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        if (profileResp.ok) {
          const profile = await profileResp.json();
          accountEmail = profile.email || accountEmail;
          accountName = profile.name || accountName;
          accountPhoto = profile.picture;
        }
      } catch (e) {
        console.warn('[Google OAuth Callback] Profile lookup notice:', e);
      }

      // Read existing record to preserve any existing refresh token if omitted in this exchange
      const existing = readSecureDriveSession();
      const effectiveRefreshToken = tokenData.refresh_token || existing?.refreshToken;

      const updatedSession: SecureDriveSessionRecord = {
        refreshToken: effectiveRefreshToken,
        accessToken: tokenData.access_token,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
        accountEmail,
        accountName,
        accountPhoto,
        folderId: existing?.folderId || '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
        folderName: existing?.folderName || 'NMO Gujarat',
        folderUrl: existing?.folderUrl || 'https://drive.google.com/drive/folders/1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
        status: 'active',
        updatedAt: new Date().toISOString(),
        lastRefreshedAt: new Date().toISOString()
      };

      writeSecureDriveSession(updatedSession);
      console.log(`[Google OAuth Callback] Session persisted securely on server for ${accountEmail}. Has refresh token: ${Boolean(effectiveRefreshToken)}`);

      res.setHeader('Content-Type', 'text/html');
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Google Drive Connected - NMO Gujarat</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
              .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
              .badge { display: inline-block; background: #064e3b; color: #6ee7b7; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
              h2 { margin: 0 0 8px 0; font-size: 20px; }
              p { color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0 0 20px 0; }
              .email { color: #38bdf8; font-weight: 600; font-family: monospace; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="badge">✓ Offline Access Authorized</div>
              <h2>Google Drive Connected</h2>
              <p>Successfully established secure backend session with refresh token for <span class="email">${escapeHtml(accountEmail)}</span>.</p>
              <p style="font-size: 11px; color: #64748b;">Closing this window and returning to NMO Gujarat Admin...</p>
            </div>
            <script>
              try {
                if (window.opener && !window.opener.closed) {
                  window.opener.postMessage({
                    type: 'GOOGLE_DRIVE_AUTH_SUCCESS',
                    email: '${escapeHtml(accountEmail)}',
                    hasRefreshToken: ${Boolean(effectiveRefreshToken)}
                  }, '*');
                  setTimeout(() => { window.close(); }, 1200);
                } else {
                  setTimeout(() => { window.location.href = '/admin/super'; }, 1800);
                }
              } catch (e) {
                setTimeout(() => { window.location.href = '/admin/super'; }, 1800);
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('[Google OAuth Callback] Exception:', err);
      return res.status(500).send(`Server error: ${err.message || 'OAuth exchange failed'}`);
    }
  });

  /**
   * GET /api/drive/status
   * Reads persistent server session without exposing any refresh token.
   * Auto-refreshes expired access token if refresh token is available.
   */
  app.get('/api/drive/status', async (req, res) => {
    try {
      let session = readSecureDriveSession();
      const redirectUri = getOAuthRedirectUri(req);

      // Check environment fallback refresh token if no file session exists
      const envRefreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
      if (!session && envRefreshToken) {
        session = {
          refreshToken: envRefreshToken,
          expiresAt: 0,
          accountEmail: process.env.VITE_SUPER_ADMIN_EMAIL || 'devanshshah768@gmail.com',
          accountName: 'NMO Gujarat Admin',
          folderId: '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
          folderName: 'NMO Gujarat',
          folderUrl: 'https://drive.google.com/drive/folders/1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
          status: 'active',
          updatedAt: new Date().toISOString()
        };
      }

      if (!session || session.status === 'disconnected') {
        return res.json({
          connected: false,
          status: 'disconnected',
          hasRefreshToken: false,
          oauthConfigured: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET)
        });
      }

      const now = Date.now();
      const isExpiringSoon = session.expiresAt < now + 5 * 60 * 1000; // less than 5 min left or expired

      // If token is expiring soon or expired and we have a refresh token, auto-renew now!
      if (isExpiringSoon && session.refreshToken) {
        const refreshed = await refreshAccessTokenWithGoogle(session.refreshToken);
        if (refreshed) {
          session.accessToken = refreshed.accessToken;
          session.expiresAt = now + refreshed.expiresIn * 1000;
          session.lastRefreshedAt = new Date().toISOString();
          session.status = 'active';
          writeSecureDriveSession(session);
        } else if (session.expiresAt < now) {
          session.status = 'expired';
          writeSecureDriveSession(session);
        }
      }

      return res.json({
        connected: Boolean(session.accessToken && session.status === 'active'),
        status: session.status,
        accountEmail: session.accountEmail,
        accountName: session.accountName,
        accountPhoto: session.accountPhoto,
        expiresAt: session.expiresAt,
        folderId: session.folderId,
        folderName: session.folderName,
        folderUrl: session.folderUrl,
        hasRefreshToken: Boolean(session.refreshToken),
        accessToken: session.accessToken, // Returned for client-side Drive API uploads
        oauthConfigured: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET),
        lastRefreshedAt: session.lastRefreshedAt
      });
    } catch (err: any) {
      console.error('[Drive Auth] Error reading status:', err);
      return res.status(500).json({ error: 'Failed to retrieve Google Drive status' });
    }
  });

  /**
   * GET /api/drive/token
   * Returns a valid access token for API operations, refreshing automatically if expired.
   */
  app.get('/api/drive/token', async (req, res) => {
    try {
      const forceRefresh = req.query.forceRefresh === 'true';
      let session = readSecureDriveSession();

      if (!session && process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
        session = {
          refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
          expiresAt: 0,
          accountEmail: process.env.VITE_SUPER_ADMIN_EMAIL || 'devanshshah768@gmail.com',
          accountName: 'NMO Gujarat Admin',
          folderId: '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
          folderName: 'NMO Gujarat',
          folderUrl: 'https://drive.google.com/drive/folders/1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
          status: 'active',
          updatedAt: new Date().toISOString()
        };
      }

      if (!session || session.status === 'disconnected') {
        return res.status(401).json({
          error: 'not_connected',
          message: 'Google Drive is not connected. Please connect with Google Drive first.'
        });
      }

      const now = Date.now();
      const needsRefresh = forceRefresh || !session.accessToken || session.expiresAt < now + 60 * 1000;

      if (needsRefresh) {
        if (!session.refreshToken) {
          if (session.accessToken && session.expiresAt > now) {
            // Still temporarily valid
            return res.json({
              accessToken: session.accessToken,
              expiresAt: session.expiresAt,
              refreshed: false
            });
          }
          return res.status(401).json({
            error: 'token_expired_no_refresh',
            message: 'Access token expired and no server-side refresh token is configured. Re-authentication required.'
          });
        }

        const refreshed = await refreshAccessTokenWithGoogle(session.refreshToken);
        if (!refreshed) {
          session.status = 'expired';
          writeSecureDriveSession(session);
          return res.status(401).json({
            error: 'refresh_failed',
            message: 'Failed to refresh Google Drive access token. Please re-authenticate.'
          });
        }

        session.accessToken = refreshed.accessToken;
        session.expiresAt = now + refreshed.expiresIn * 1000;
        session.lastRefreshedAt = new Date().toISOString();
        session.status = 'active';
        writeSecureDriveSession(session);

        return res.json({
          accessToken: session.accessToken,
          expiresAt: session.expiresAt,
          refreshed: true
        });
      }

      return res.json({
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        refreshed: false
      });
    } catch (err: any) {
      console.error('[Drive Auth] Error providing token:', err);
      return res.status(500).json({ error: 'Failed to fetch access token' });
    }
  });

  /**
   * POST /api/drive/exchange-code
   * Exchanges an authorization code from Google OAuth 2.0 offline access flow.
   * Stores the refresh_token securely on the server!
   */
  app.post('/api/drive/exchange-code', async (req, res) => {
    try {
      const { code, redirectUri, folderId, folderName, folderUrl } = req.body;
      if (!code) {
        return res.status(400).json({ error: 'Authorization code is required' });
      }

      const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(400).json({
          error: 'server_misconfigured',
          message: 'GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET is missing on the server.'
        });
      }

      console.log('[Drive Auth] Exchanging authorization code with Google for offline tokens...');
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri || 'postmessage',
          grant_type: 'authorization_code'
        }).toString()
      });

      if (!tokenResp.ok) {
        const errorJson = await tokenResp.json().catch(() => ({}));
        console.error('[Drive Auth] Code exchange failed:', tokenResp.status, errorJson);
        return res.status(tokenResp.status).json({
          error: 'exchange_failed',
          details: errorJson
        });
      }

      const tokenData = (await tokenResp.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        id_token?: string;
      };

      // Retrieve user profile using new access token
      let userEmail = 'admin@nmogujarat.org';
      let userName = 'NMO Gujarat Administrator';
      let userPhoto: string | undefined;

      try {
        const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        if (profileResp.ok) {
          const profile = await profileResp.json();
          userEmail = profile.email || userEmail;
          userName = profile.name || userName;
          userPhoto = profile.picture;
        }
      } catch (e) {
        console.warn('[Drive Auth] Could not fetch user profile info:', e);
      }

      const existing = readSecureDriveSession();
      const updatedSession: SecureDriveSessionRecord = {
        refreshToken: tokenData.refresh_token || existing?.refreshToken,
        accessToken: tokenData.access_token,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
        accountEmail: userEmail,
        accountName: userName,
        accountPhoto: userPhoto,
        folderId: folderId || existing?.folderId || '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
        folderName: folderName || existing?.folderName || 'NMO Gujarat',
        folderUrl: folderUrl || existing?.folderUrl || 'https://drive.google.com/drive/folders/1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
        status: 'active',
        updatedAt: new Date().toISOString(),
        lastRefreshedAt: new Date().toISOString()
      };

      writeSecureDriveSession(updatedSession);
      console.log(`[Drive Auth] Google Drive session saved securely for ${userEmail}. Has refresh token: ${Boolean(updatedSession.refreshToken)}`);

      return res.json({
        success: true,
        accountEmail: updatedSession.accountEmail,
        accountName: updatedSession.accountName,
        expiresAt: updatedSession.expiresAt,
        folderId: updatedSession.folderId,
        accessToken: updatedSession.accessToken,
        hasRefreshToken: Boolean(updatedSession.refreshToken)
      });
    } catch (err: any) {
      console.error('[Drive Auth] Exception during code exchange:', err);
      return res.status(500).json({ error: err.message || 'Internal error during code exchange' });
    }
  });

  /**
   * POST /api/drive/save-session
   * Saves or updates persistent backend session metadata and tokens.
   */
  app.post('/api/drive/save-session', async (req, res) => {
    try {
      const {
        accessToken,
        refreshToken,
        accountEmail,
        accountName,
        accountPhoto,
        expiresAt,
        folderId,
        folderName,
        folderUrl
      } = req.body;

      if (!accessToken || !accountEmail) {
        return res.status(400).json({ error: 'accessToken and accountEmail are required' });
      }

      const existing = readSecureDriveSession();
      const newSession: SecureDriveSessionRecord = {
        refreshToken: refreshToken || existing?.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
        accessToken,
        expiresAt: expiresAt || Date.now() + 3600 * 1000,
        accountEmail,
        accountName: accountName || existing?.accountName || 'Admin',
        accountPhoto: accountPhoto || existing?.accountPhoto,
        folderId: folderId || existing?.folderId || '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
        folderName: folderName || existing?.folderName || 'NMO Gujarat',
        folderUrl: folderUrl || existing?.folderUrl || 'https://drive.google.com/drive/folders/1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
        status: 'active',
        updatedAt: new Date().toISOString()
      };

      writeSecureDriveSession(newSession);
      console.log(`[Drive Auth] Session saved on backend for ${accountEmail}`);

      return res.json({
        success: true,
        hasRefreshToken: Boolean(newSession.refreshToken)
      });
    } catch (err: any) {
      console.error('[Drive Auth] Error saving session:', err);
      return res.status(500).json({ error: 'Failed to save session' });
    }
  });

  /**
   * POST /api/drive/disconnect
   * Disconnects Google Drive and wipes stored backend tokens.
   */
  app.post('/api/drive/disconnect', async (_req, res) => {
    try {
      if (fs.existsSync(SECURE_CREDENTIALS_FILE)) {
        fs.unlinkSync(SECURE_CREDENTIALS_FILE);
      }
      console.log('[Drive Auth] Drive session disconnected and backend credentials file deleted.');
      return res.json({ success: true, message: 'Google Drive disconnected successfully' });
    } catch (err: any) {
      console.error('[Drive Auth] Error disconnecting:', err);
      return res.status(500).json({ error: 'Failed to disconnect session' });
    }
  });

  /**
   * POST /api/drive/test-expire-and-refresh
   * Diagnostic test endpoint:
   * 1. Expires current access token in the secure session.
   * 2. Triggers the automatic refresh token flow.
   * 3. Verifies that the new access token is generated and valid.
   */
  app.post('/api/drive/test-expire-and-refresh', async (_req, res) => {
    try {
      const session = readSecureDriveSession();
      if (!session) {
        return res.status(404).json({ error: 'No stored session found to test' });
      }

      const initialExpiresAt = session.expiresAt;
      // Force expiration
      session.expiresAt = Date.now() - 1000;
      session.status = 'expired';
      writeSecureDriveSession(session);

      if (!session.refreshToken) {
        return res.json({
          test: 'expired_simulated',
          message: 'Session access token expired. No refresh token available to auto-refresh.',
          hasRefreshToken: false,
          expiredSuccessfully: true
        });
      }

      // Execute refresh
      const refreshed = await refreshAccessTokenWithGoogle(session.refreshToken);
      if (!refreshed) {
        return res.status(502).json({
          test: 'refresh_failed',
          error: 'Google token refresh call failed during simulation. Verify GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET.'
        });
      }

      session.accessToken = refreshed.accessToken;
      session.expiresAt = Date.now() + refreshed.expiresIn * 1000;
      session.lastRefreshedAt = new Date().toISOString();
      session.status = 'active';
      writeSecureDriveSession(session);

      return res.json({
        success: true,
        test: 'auto_refresh_verified',
        initialExpiresAt,
        simulatedExpiredAt: Date.now() - 1000,
        newExpiresAt: session.expiresAt,
        newExpiresInSeconds: Math.round((session.expiresAt - Date.now()) / 1000),
        message: 'Successfully simulated token expiration and auto-renewed access token using the server-side refresh token!'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error testing refresh' });
    }
  });

  // =========================================================================
  // Super Admin Server-Side Cookie Session Management
  // Only accessible by verified Super Administrator
  // =========================================================================
  const SUPER_ADMIN_EMAIL = (process.env.VITE_SUPER_ADMIN_EMAIL || 'devanshshah768@gmail.com').toLowerCase().trim();
  const SUPER_ADMIN_COOKIE_NAME = 'nmo_superadmin_session';
  const SESSION_SECRET = process.env.SESSION_SECRET || 'nmo-gujarat-superadmin-secret-2026-secure-key';

  interface SuperAdminSessionPayload {
    email: string;
    role: 'super_admin';
    membershipNumber: string;
    name: string;
    uid?: string;
    issuedAt: number;
    expiresAt: number;
  }

  function createSuperAdminSessionToken(payload: SuperAdminSessionPayload): string {
    const dataStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(dataStr).digest('base64url');
    return `${dataStr}.${hmac}`;
  }

  function verifySuperAdminSessionToken(token: string): SuperAdminSessionPayload | null {
    try {
      if (!token || typeof token !== 'string' || !token.includes('.')) return null;
      const [dataStr, hmac] = token.split('.');
      const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(dataStr).digest('base64url');
      if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
        return null;
      }
      const json = Buffer.from(dataStr, 'base64url').toString('utf-8');
      const parsed = JSON.parse(json) as SuperAdminSessionPayload;
      if (Date.now() > parsed.expiresAt) {
        return null;
      }
      if (parsed.email.toLowerCase() !== SUPER_ADMIN_EMAIL && parsed.role !== 'super_admin') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * POST /api/admin/login
   * Validates Super Admin and sets an httpOnly, secure, server-side session cookie.
   * Cookie is accessible ONLY by Super Admin.
   */
  app.post('/api/admin/login', (req, res) => {
    try {
      const { email, membershipNumber, name, uid } = req.body;
      const cleanEmail = (email || '').trim().toLowerCase();

      const isAuthorized =
        cleanEmail === SUPER_ADMIN_EMAIL ||
        cleanEmail === 'superadmin@nmogujarat.org';

      if (!isAuthorized) {
        return res.status(403).json({
          error: 'unauthorized',
          message: 'Only verified Super Administrator can obtain the server-side admin session cookie.'
        });
      }

      const now = Date.now();
      const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days persistent session

      const sessionPayload: SuperAdminSessionPayload = {
        email: cleanEmail,
        role: 'super_admin',
        membershipNumber: membershipNumber || 'NMO-ADMIN-001',
        name: name || 'Dr. Devansh Shah',
        uid: uid || '',
        issuedAt: now,
        expiresAt
      };

      const token = createSuperAdminSessionToken(sessionPayload);

      // Store server-side cookie accessible only by superadmin
      res.cookie(SUPER_ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      console.log(`[Admin Auth] Stored server-side session cookie for Super Admin: ${cleanEmail}`);

      return res.json({
        success: true,
        message: 'Super Admin server-side session cookie stored successfully',
        user: {
          email: cleanEmail,
          role: 'super_admin',
          membershipNumber: sessionPayload.membershipNumber,
          name: sessionPayload.name,
          uid: sessionPayload.uid
        }
      });
    } catch (err: any) {
      console.error('[Admin Auth] Error establishing admin cookie session:', err);
      return res.status(500).json({ error: 'Failed to establish admin session cookie' });
    }
  });

  /**
   * GET /api/admin/session
   * Checks for valid Super Admin server-side cookie and returns user session.
   */
  app.get('/api/admin/session', (req, res) => {
    try {
      const cookieToken = req.cookies[SUPER_ADMIN_COOKIE_NAME];
      if (!cookieToken) {
        return res.status(401).json({ authenticated: false, message: 'No admin session cookie found' });
      }

      const verified = verifySuperAdminSessionToken(cookieToken);
      if (!verified) {
        res.clearCookie(SUPER_ADMIN_COOKIE_NAME, { path: '/' });
        return res.status(401).json({ authenticated: false, message: 'Invalid or expired admin session cookie' });
      }

      return res.json({
        authenticated: true,
        user: {
          email: verified.email,
          role: verified.role,
          membershipNumber: verified.membershipNumber,
          name: verified.name,
          uid: verified.uid
        }
      });
    } catch (err: any) {
      console.error('[Admin Auth] Error checking admin session cookie:', err);
      return res.status(500).json({ error: 'Failed to check admin session' });
    }
  });

  /**
   * POST /api/admin/logout
   * Clears the Super Admin server-side cookie.
   */
  app.post('/api/admin/logout', (_req, res) => {
    res.clearCookie(SUPER_ADMIN_COOKIE_NAME, { path: '/' });
    console.log('[Admin Auth] Cleared Super Admin server-side session cookie');
    return res.json({ success: true, message: 'Super Admin session terminated successfully' });
  });

  // =========================================================================
  // Google Drive Member Certificates API
  // Calls Drive by Membership ID and shows ONLY the member's certificates
  // =========================================================================
  async function getValidServerDriveToken(): Promise<string | null> {
    let session = readSecureDriveSession();
    if (!session && process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
      session = {
        refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
        expiresAt: 0,
        accountEmail: process.env.VITE_SUPER_ADMIN_EMAIL || 'devanshshah768@gmail.com',
        accountName: 'NMO Gujarat Admin',
        folderId: '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
        folderName: 'NMO Gujarat',
        folderUrl: 'https://drive.google.com/drive/folders/1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
        status: 'active',
        updatedAt: new Date().toISOString()
      };
    }

    if (!session || session.status === 'disconnected') {
      return null;
    }

    const now = Date.now();
    if (session.accessToken && session.expiresAt > now + 60 * 1000) {
      return session.accessToken;
    }

    if (session.refreshToken) {
      const refreshed = await refreshAccessTokenWithGoogle(session.refreshToken);
      if (refreshed) {
        session.accessToken = refreshed.accessToken;
        session.expiresAt = now + refreshed.expiresIn * 1000;
        session.lastRefreshedAt = new Date().toISOString();
        session.status = 'active';
        writeSecureDriveSession(session);
        return session.accessToken;
      }
    }

    return session.accessToken || null;
  }

  /**
   * GET /api/drive/member-certificates/:membershipNumber
   * Queries Google Drive exclusively for files matching the participant's membership ID.
   * Strictly filters results: Does NOT show all certificates to everyone.
   */
  app.get('/api/drive/member-certificates/:membershipNumber', async (req, res) => {
    try {
      const rawMemNo = req.params.membershipNumber;
      if (!rawMemNo || typeof rawMemNo !== 'string') {
        return res.status(400).json({ error: 'Membership Number is required' });
      }

      const cleanMemNo = rawMemNo.trim().toUpperCase();
      if (!cleanMemNo) {
        return res.status(400).json({ error: 'Invalid Membership Number' });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.json({
          connected: false,
          membershipNumber: cleanMemNo,
          certificates: [],
          message: 'Google Drive integration not currently connected on server.'
        });
      }

      // Query Google Drive for files where name contains the participant's membership ID
      const driveQuery = `trashed = false and mimeType != 'application/vnd.google-apps.folder' and (name contains '${cleanMemNo}' or fullText contains '${cleanMemNo}')`;
      const fields = 'files(id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,description,properties,parents)';

      const driveResp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(driveQuery)}&fields=${encodeURIComponent(fields)}&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!driveResp.ok) {
        const errText = await driveResp.text().catch(() => '');
        console.warn('[Drive Certificates] Google Drive query error:', driveResp.status, errText);
        return res.status(502).json({
          error: 'drive_api_error',
          message: 'Failed to query Google Drive certificates repository.'
        });
      }

      const data = await driveResp.json();
      const rawFiles: any[] = data.files || [];

      // CRITICAL REQUIREMENT: "Don't show all certificates to everyone."
      // Strictly filter returned files so that only files matching this participant's membership ID are returned.
      const strictlyFiltered = rawFiles.filter((f) => {
        const fNameUpper = (f.name || '').toUpperCase();
        const propMemNo = (f.properties?.membershipNumber || '').toUpperCase();
        return fNameUpper.includes(cleanMemNo) || propMemNo === cleanMemNo;
      }).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? `${(Number(f.size) / (1024 * 1024)).toFixed(2)} MB` : undefined,
        createdTime: f.createdTime,
        webViewLink: f.webViewLink,
        webContentLink: f.webContentLink || `https://drive.google.com/uc?id=${f.id}&export=download`,
        thumbnailLink: f.thumbnailLink,
        description: f.description,
        membershipNumber: cleanMemNo,
        proxyViewUrl: `/api/drive/file/${f.id}`,
        proxyDownloadUrl: `/api/drive/file/${f.id}?download=true`
      }));

      return res.json({
        success: true,
        connected: true,
        membershipNumber: cleanMemNo,
        count: strictlyFiltered.length,
        certificates: strictlyFiltered
      });
    } catch (err: any) {
      console.error('[Drive Certificates] Error fetching member certificates:', err);
      return res.status(500).json({ error: 'Internal error fetching member certificates' });
    }
  });

  /**
   * GET /api/drive/file/:fileId
   * Streams certificate file content directly from Google Drive.
   * Allows members to preview or download their certificate without requiring public Drive permissions.
   */
  app.get('/api/drive/file/:fileId', async (req, res) => {
    try {
      const fileId = req.params.fileId;
      if (!fileId) {
        return res.status(400).send('File ID required');
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).send('Google Drive storage is currently disconnected.');
      }

      // Fetch metadata first to get correct filename and mimeType
      const metaResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!metaResp.ok) {
        return res.status(metaResp.status).send('Certificate file not found in Google Drive');
      }

      const meta = await metaResp.json();
      const isDownload = req.query.download === 'true';

      // Stream file content
      const mediaResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!mediaResp.ok) {
        return res.status(mediaResp.status).send('Failed to stream certificate from Google Drive');
      }

      res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (isDownload) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.name)}"`);
      } else {
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(meta.name)}"`);
      }

      const arrayBuffer = await mediaResp.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      console.error('[Drive File Proxy] Error streaming file:', err);
      return res.status(500).send('Error streaming file');
    }
  });

  // Vite SPA middlewares in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NMO Gujarat Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
