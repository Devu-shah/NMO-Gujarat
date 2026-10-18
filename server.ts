import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import cors from 'cors';
import { initializeApp as initAdminApp, getApps as getAdminApps, cert as adminCert } from 'firebase-admin/app';
import { getAuth as getAdminAuth, DecodedIdToken } from 'firebase-admin/auth';

dotenv.config();

// Firebase Admin Initialization (Target Project: nmo-india-demo)
const FIREBASE_ADMIN_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nmo-india-demo';
let isFirebaseAdminInitialized = false;

try {
  if (getAdminApps().length > 0) {
    isFirebaseAdminInitialized = true;
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const parsedCreds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      initAdminApp({
        credential: adminCert(parsedCreds),
        projectId: FIREBASE_ADMIN_PROJECT_ID
      });
      isFirebaseAdminInitialized = true;
      console.log(`[Firebase Admin] Initialized with Service Account Key for project: ${FIREBASE_ADMIN_PROJECT_ID}`);
    } catch (parseErr) {
      console.error('[Firebase Admin] Failed parsing FIREBASE_SERVICE_ACCOUNT_KEY:', parseErr);
    }
  } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    initAdminApp({
      credential: adminCert({
        projectId: FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      }),
      projectId: FIREBASE_ADMIN_PROJECT_ID
    });
    isFirebaseAdminInitialized = true;
    console.log(`[Firebase Admin] Initialized with Client Email credentials for project: ${FIREBASE_ADMIN_PROJECT_ID}`);
  } else {
    // Initialize with projectId to allow verifying ID tokens using Google's public x509 certificates
    initAdminApp({
      projectId: FIREBASE_ADMIN_PROJECT_ID
    });
    isFirebaseAdminInitialized = true;
    console.log(`[Firebase Admin] Initialized with Project ID (${FIREBASE_ADMIN_PROJECT_ID}) for public token verification`);
  }
} catch (err: any) {
  console.warn('[Firebase Admin] Warning initializing admin SDK:', err?.message || err);
}

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
setInterval(cleanOldSpamRecords, 5 * 60 * 1000).unref();

async function startServer() {
  const app = express();

  // Support PORT from process.env, CLI arguments (--port 3000 or --port=3000), or default to 3000
  let portArg: number | null = null;
  const portIndex = process.argv.indexOf('--port');
  if (portIndex !== -1 && process.argv[portIndex + 1]) {
    const val = Number(process.argv[portIndex + 1]);
    if (!isNaN(val) && val > 0) portArg = val;
  } else {
    const portEq = process.argv.find((a) => a.startsWith('--port='));
    if (portEq) {
      const val = Number(portEq.split('=')[1]);
      if (!isNaN(val) && val > 0) portArg = val;
    }
  }

  // Support HOST from process.env, CLI arguments (--host 0.0.0.0 or --host=0.0.0.0), or default to 0.0.0.0
  let hostArg = '0.0.0.0';
  const hostIndex = process.argv.indexOf('--host');
  if (hostIndex !== -1 && process.argv[hostIndex + 1]) {
    hostArg = process.argv[hostIndex + 1];
  } else {
    const hostEq = process.argv.find((a) => a.startsWith('--host='));
    if (hostEq) {
      hostArg = hostEq.split('=')[1];
    }
  }

  // Priority: CLI argument (--port 3000) > PORT env var (if not conflicting with container reverse proxy) > default 3000
  let envPort: number | null = null;
  if (process.env.PORT) {
    const parsed = Number(process.env.PORT);
    // If container environment exports PORT=8080 but nginx reverse proxy is also running on 8080, prefer 3000
    if (!isNaN(parsed) && parsed > 0 && !(parsed === 8080 && process.env.NGINX_PORT === '8080')) {
      envPort = parsed;
    }
  }

  const PORT = portArg || envPort || 3000;
  const HOST = hostArg || process.env.HOST || '0.0.0.0';

  // =========================================================================
  // CORS Configuration
  // Permits exact origins with credentials for cross-origin frontend-to-backend calls
  // (e.g. https://nmo-gujarat.web.app -> https://nmo-gujarat.onrender.com)
  // =========================================================================
  const ALLOWED_ORIGINS = [
    'https://nmo-gujarat.web.app',
    'https://nmo-gujarat.firebaseapp.com',
    'http://localhost:3000',
    'http://localhost:5173'
  ];

  if (process.env.FRONTEND_ORIGIN) {
    const customOrigin = process.env.FRONTEND_ORIGIN.trim().replace(/\/+$/, '');
    if (!ALLOWED_ORIGINS.includes(customOrigin)) {
      ALLOWED_ORIGINS.push(customOrigin);
    }
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, or same-origin)
        if (!origin) return callback(null, true);

        const isAllowed =
          ALLOWED_ORIGINS.includes(origin) ||
          origin.endsWith('.web.app') ||
          origin.endsWith('.firebaseapp.com') ||
          origin.endsWith('.run.app');

        if (isAllowed) {
          return callback(null, true);
        }

        console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
    })
  );

  app.options('*', cors());

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
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
    if (process.env.BACKEND_URL) {
      const base = process.env.BACKEND_URL.replace(/\/+$/, '');
      return `${base}/api/auth/google/callback`;
    }
    const forwardedProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const forwardedHost = (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() || req.headers.host;

    if (forwardedHost) {
      // If the request came through a proxy, make sure we do not route OAuth callback to Firebase Hosting
      if (!forwardedHost.includes('web.app') && !forwardedHost.includes('firebaseapp.com')) {
        return `${forwardedProto}://${forwardedHost}/api/auth/google/callback`;
      }
    }
    if (process.env.NODE_ENV === 'production') {
      return 'https://nmo-gujarat.onrender.com/api/auth/google/callback';
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
  setInterval(cleanOauthStates, 5 * 60 * 1000).unref();

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
        connected: Boolean(session.status === 'active'),
        status: session.status,
        accountEmail: session.accountEmail,
        accountName: session.accountName,
        accountPhoto: session.accountPhoto,
        expiresAt: session.expiresAt,
        folderId: session.folderId,
        folderName: session.folderName,
        folderUrl: session.folderUrl,
        hasRefreshToken: Boolean(session.refreshToken),
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
   * Validates backend Drive session health without exposing raw access tokens to the browser.
   * Auto-refreshes session server-side if expired.
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
          connected: false,
          error: 'not_connected',
          message: 'Google Drive is not connected. Please connect with Google Drive first.'
        });
      }

      const now = Date.now();
      const needsRefresh = forceRefresh || !session.accessToken || session.expiresAt < now + 60 * 1000;

      if (needsRefresh && session.refreshToken) {
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
          return res.status(401).json({
            connected: false,
            error: 'refresh_failed',
            message: 'Failed to refresh Google Drive session.'
          });
        }
      }

      return res.json({
        connected: session.status === 'active',
        status: session.status,
        hasRefreshToken: Boolean(session.refreshToken),
        message: 'Google Drive session is active and securely managed server-side. Direct token exposure is disabled.'
      });
    } catch (err: any) {
      console.error('[Drive Auth] Error validating token health:', err);
      return res.status(500).json({ error: 'Failed to check Drive token status' });
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
  // Super Admin Server-Side Session Management & Firebase Admin Verification
  // Only accessible by verified Super Administrator
  // =========================================================================
  const SUPER_ADMIN_EMAIL = (process.env.VITE_SUPER_ADMIN_EMAIL || 'devanshshah768@gmail.com').toLowerCase().trim();
  const SUPER_ADMIN_COOKIE_NAME = 'nmo_superadmin_session';

  // Secure SESSION_SECRET: Never use an insecure default in production
  let effectiveSessionSecret = process.env.SESSION_SECRET;
  if (!effectiveSessionSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Security Warning] SESSION_SECRET is not configured in production environment! Generating an ephemeral secret.');
      effectiveSessionSecret = crypto.randomBytes(32).toString('hex');
    } else {
      effectiveSessionSecret = 'nmo-gujarat-superadmin-secret-2026-secure-key';
    }
  }
  const SESSION_SECRET = effectiveSessionSecret;

  const AUTHORIZED_SUPER_ADMIN_EMAILS = [
    SUPER_ADMIN_EMAIL,
    'superadmin@nmogujarat.org',
    'devanshshah768@gmail.com'
  ].map((e) => e.toLowerCase().trim());

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
      // CRITICAL: Strictly require BOTH authorized super admin email AND role === 'super_admin'
      const cleanParsedEmail = (parsed.email || '').toLowerCase().trim();
      const isAuthorizedEmail = AUTHORIZED_SUPER_ADMIN_EMAILS.includes(cleanParsedEmail);
      if (!isAuthorizedEmail || parsed.role !== 'super_admin') {
        console.warn('[Admin Auth] Rejected forged or unauthorized token role/email mismatch:', cleanParsedEmail);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * POST /api/admin/login
   * Validates Super Admin using server-side Firebase Admin ID token verification.
   * Derives UID and email strictly from decoded cryptographic token, NOT from request body.
   */
  app.post('/api/admin/login', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'missing_token',
          message: 'Authorization header with Bearer Firebase ID token is required for Super Admin login.'
        });
      }

      const idToken = authHeader.split('Bearer ')[1]?.trim();
      if (!idToken) {
        return res.status(401).json({
          error: 'invalid_token',
          message: 'Bearer token cannot be empty.'
        });
      }

      let decodedToken: DecodedIdToken;
      try {
        decodedToken = await getAdminAuth().verifyIdToken(idToken);
      } catch (tokenErr: any) {
        console.warn('[Admin Auth] Firebase ID token verification failed:', tokenErr.message);
        return res.status(401).json({
          error: 'invalid_or_expired_token',
          message: 'Firebase ID token is invalid or expired. Please sign in again.'
        });
      }

      const verifiedEmail = (decodedToken.email || '').trim().toLowerCase();
      const verifiedUid = decodedToken.uid;

      if (!verifiedEmail) {
        return res.status(403).json({
          error: 'unverified_email',
          message: 'The authenticated Firebase token does not contain an email address.'
        });
      }

      const isAuthorized = AUTHORIZED_SUPER_ADMIN_EMAILS.includes(verifiedEmail);
      if (!isAuthorized) {
        console.warn(`[Admin Auth] Forbidden: Authenticated user ${verifiedEmail} (UID: ${verifiedUid}) is not an authorized Super Admin.`);
        return res.status(403).json({
          error: 'unauthorized',
          message: 'Only authorized Super Administrators are permitted to access this portal.'
        });
      }

      const now = Date.now();
      const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days persistent session

      const sessionPayload: SuperAdminSessionPayload = {
        email: verifiedEmail,
        role: 'super_admin',
        membershipNumber: 'NMO-ADMIN-001',
        name: (req.body.name as string) || decodedToken.name || 'Dr. Devansh Shah',
        uid: verifiedUid,
        issuedAt: now,
        expiresAt
      };

      const token = createSuperAdminSessionToken(sessionPayload);
      const isProduction = process.env.NODE_ENV === 'production';

      // Set httpOnly cookie with cross-site support (sameSite: 'none' in production)
      res.cookie(SUPER_ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      console.log(`[Admin Auth] Verified Firebase ID token and created admin session for ${verifiedEmail}`);

      return res.json({
        success: true,
        message: 'Super Admin authenticated and session established successfully',
        sessionToken: token, // Also return bearer token for clients where third-party cookies are partitioned or blocked
        user: {
          email: verifiedEmail,
          role: 'super_admin',
          membershipNumber: sessionPayload.membershipNumber,
          name: sessionPayload.name,
          uid: verifiedUid
        }
      });
    } catch (err: any) {
      console.error('[Admin Auth] Error establishing admin session:', err);
      return res.status(500).json({ error: 'Failed to establish admin session' });
    }
  });

  /**
   * GET /api/admin/session
   * Checks for valid Super Admin session via:
   * 1. httpOnly cookie (SUPER_ADMIN_COOKIE_NAME)
   * 2. OR Authorization header (Bearer <sessionToken>) for cross-site browser setups
   */
  app.get('/api/admin/session', (req, res) => {
    try {
      const cookieToken = req.cookies[SUPER_ADMIN_COOKIE_NAME];
      const headerAuth = req.headers.authorization;
      const bearerToken = headerAuth?.startsWith('Bearer ') ? headerAuth.split('Bearer ')[1]?.trim() : null;

      const tokenToVerify = cookieToken || bearerToken;
      if (!tokenToVerify) {
        return res.status(401).json({ authenticated: false, message: 'No admin session token found' });
      }

      const verified = verifySuperAdminSessionToken(tokenToVerify);
      if (!verified) {
        if (cookieToken) {
          res.clearCookie(SUPER_ADMIN_COOKIE_NAME, {
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
          });
        }
        return res.status(401).json({ authenticated: false, message: 'Invalid or expired admin session token' });
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
      console.error('[Admin Auth] Error checking admin session:', err);
      return res.status(500).json({ error: 'Failed to check admin session' });
    }
  });

  /**
   * POST /api/admin/logout
   * Clears the Super Admin server-side cookie.
   */
  app.post('/api/admin/logout', (_req, res) => {
    res.clearCookie(SUPER_ADMIN_COOKIE_NAME, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
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

  // =========================================================================
  // Google Drive Logical Folder Hierarchy: "NMO Gujarat → Events → [Event Folder]"
  // Automatically resolves folders dynamically without hardcoded IDs.
  // Never creates duplicate folders automatically.
  // =========================================================================

  async function resolveDriveHierarchy(token: string) {
    const rootQuery = "mimeType = 'application/vnd.google-apps.folder' and name = 'NMO Gujarat' and trashed = false";
    const rootResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(rootQuery)}&fields=files(id,name,webViewLink,parents)&pageSize=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!rootResp.ok) {
      const errText = await rootResp.text().catch(() => '');
      throw new Error(`Failed to query Google Drive for "NMO Gujarat" root folder: ${errText}`);
    }
    const rootData = await rootResp.json();
    const rootFiles: any[] = rootData.files || [];

    if (rootFiles.length === 0) {
      return {
        success: false,
        error: 'Root folder "NMO Gujarat" was not found in your connected Google Drive account. Please verify that a folder named "NMO Gujarat" exists.',
        code: 'ROOT_FOLDER_NOT_FOUND'
      };
    }

    let rootFolder = rootFiles[0];
    if (rootFiles.length > 1) {
      const session = readSecureDriveSession();
      const matched = rootFiles.find((f) => f.id === session?.folderId);
      if (matched) {
        rootFolder = matched;
      } else {
        return {
          success: false,
          error: `Multiple folders named "NMO Gujarat" were detected in Google Drive (${rootFiles.length} found). Resolution is ambiguous. Please remove duplicate folders.`,
          code: 'ROOT_FOLDER_AMBIGUOUS',
          folders: rootFiles.map((f) => ({ id: f.id, name: f.name }))
        };
      }
    }

    const eventsQuery = `'${rootFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = 'Events' and trashed = false`;
    const eventsResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(eventsQuery)}&fields=files(id,name,webViewLink)&pageSize=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!eventsResp.ok) {
      const errText = await eventsResp.text().catch(() => '');
      throw new Error(`Failed to query Google Drive for "Events" subfolder: ${errText}`);
    }
    const eventsData = await eventsResp.json();
    const eventsFiles: any[] = eventsData.files || [];

    if (eventsFiles.length === 0) {
      return {
        success: false,
        error: 'The "Events" subfolder was not found inside the "NMO Gujarat" folder. Please create the "Events" subfolder inside "NMO Gujarat" before managing certificates.',
        code: 'EVENTS_FOLDER_NOT_FOUND',
        rootFolder: { id: rootFolder.id, name: rootFolder.name, webViewLink: rootFolder.webViewLink }
      };
    }

    if (eventsFiles.length > 1) {
      return {
        success: false,
        error: `Multiple folders named "Events" were found inside "NMO Gujarat" (${eventsFiles.length} found). Resolution is ambiguous.`,
        code: 'EVENTS_FOLDER_AMBIGUOUS',
        rootFolder: { id: rootFolder.id, name: rootFolder.name },
        folders: eventsFiles.map((f) => ({ id: f.id, name: f.name }))
      };
    }

    const eventsFolder = eventsFiles[0];
    return {
      success: true,
      rootFolder: { id: rootFolder.id, name: rootFolder.name, webViewLink: rootFolder.webViewLink },
      eventsFolder: { id: eventsFolder.id, name: eventsFolder.name, webViewLink: eventsFolder.webViewLink }
    };
  }

  async function resolveEventFolder(token: string, eventId: string, eventTitle?: string, knownDriveFolderId?: string) {
    const hierarchy = await resolveDriveHierarchy(token);
    if (!hierarchy.success || !hierarchy.eventsFolder) {
      return hierarchy;
    }

    const eventsFolderId = hierarchy.eventsFolder.id;
    const query = `'${eventsFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,createdTime)&pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Failed to list folders inside "Events": ${errText}`);
    }
    const data = await resp.json();
    const folders: any[] = data.files || [];

    // Priority 1: Match by stable Drive folder ID inside "Events"
    if (knownDriveFolderId) {
      const matchedById = folders.find((f) => f.id === knownDriveFolderId);
      if (matchedById) {
        return {
          success: true,
          rootFolder: hierarchy.rootFolder,
          eventsFolder: hierarchy.eventsFolder,
          eventFolder: { id: matchedById.id, name: matchedById.name, webViewLink: matchedById.webViewLink }
        };
      }
    }

    const cleanId = (eventId || '').trim().toLowerCase();
    const cleanTitle = (eventTitle || '').trim().toLowerCase();

    // Priority 2: Exact name match
    if (cleanTitle) {
      const exactTitleMatches = folders.filter((f) => (f.name || '').trim().toLowerCase() === cleanTitle);
      if (exactTitleMatches.length === 1) {
        return {
          success: true,
          rootFolder: hierarchy.rootFolder,
          eventsFolder: hierarchy.eventsFolder,
          eventFolder: { id: exactTitleMatches[0].id, name: exactTitleMatches[0].name, webViewLink: exactTitleMatches[0].webViewLink }
        };
      }
    }

    // Priority 3: Exact ID match
    if (cleanId) {
      const exactIdMatches = folders.filter((f) => (f.name || '').trim().toLowerCase() === cleanId);
      if (exactIdMatches.length === 1) {
        return {
          success: true,
          rootFolder: hierarchy.rootFolder,
          eventsFolder: hierarchy.eventsFolder,
          eventFolder: { id: exactIdMatches[0].id, name: exactIdMatches[0].name, webViewLink: exactIdMatches[0].webViewLink }
        };
      }
    }

    // Priority 4: Normalized comparison (ignoring non-alphanumeric differences)
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normTitle = normalize(cleanTitle);
    const normId = normalize(cleanId);

    const normMatches = folders.filter((f) => {
      const fn = normalize(f.name || '');
      return (normTitle && fn === normTitle) || (normId && fn === normId);
    });
    if (normMatches.length === 1) {
      return {
        success: true,
        rootFolder: hierarchy.rootFolder,
        eventsFolder: hierarchy.eventsFolder,
        eventFolder: { id: normMatches[0].id, name: normMatches[0].name, webViewLink: normMatches[0].webViewLink }
      };
    }

    // Priority 5: Substring matching if cleanTitle or cleanId is distinct (at least 4 chars)
    const subMatches = folders.filter((f) => {
      const fn = (f.name || '').trim().toLowerCase();
      if (cleanTitle && cleanTitle.length >= 4 && (fn.includes(cleanTitle) || cleanTitle.includes(fn))) return true;
      if (cleanId && cleanId.length >= 4 && fn.includes(cleanId)) return true;
      return false;
    });

    if (subMatches.length === 1) {
      return {
        success: true,
        rootFolder: hierarchy.rootFolder,
        eventsFolder: hierarchy.eventsFolder,
        eventFolder: { id: subMatches[0].id, name: subMatches[0].name, webViewLink: subMatches[0].webViewLink }
      };
    }

    if (subMatches.length > 1) {
      return {
        success: false,
        error: `Multiple folders matching "${eventTitle || eventId}" were found inside "NMO Gujarat → Events" (${subMatches.map((m) => m.name).join(', ')}). Resolution is ambiguous. Please disambiguate in Google Drive.`,
        code: 'EVENT_FOLDER_AMBIGUOUS',
        rootFolder: hierarchy.rootFolder,
        eventsFolder: hierarchy.eventsFolder,
        matchingFolders: subMatches.map((f) => ({ id: f.id, name: f.name }))
      };
    }

    return {
      success: false,
      error: `Event folder for "${eventTitle || eventId}" was not found inside "NMO Gujarat → Events". As per safety policy, duplicate event folders are never created automatically. Please create or assign this event's folder in Google Drive.`,
      code: 'EVENT_FOLDER_NOT_FOUND',
      rootFolder: hierarchy.rootFolder,
      eventsFolder: hierarchy.eventsFolder,
      availableFolders: folders.map((f) => ({ id: f.id, name: f.name }))
    };
  }

  /**
   * GET /api/drive/resolve-hierarchy
   * Locates "NMO Gujarat" root and its "Events" subfolder dynamically.
   */
  app.get('/api/drive/resolve-hierarchy', async (_req, res) => {
    try {
      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ success: false, error: 'Google Drive is not connected.', code: 'NOT_CONNECTED' });
      }

      const result = await resolveDriveHierarchy(token);
      return res.json(result);
    } catch (err: any) {
      console.error('[Drive Hierarchy] Error resolving hierarchy:', err);
      return res.status(500).json({ success: false, error: err.message || 'Error resolving hierarchy' });
    }
  });

  /**
   * GET /api/drive/resolve-event-folder/:eventId
   * Resolves the selected event folder inside "NMO Gujarat → Events".
   * Never creates duplicate folders automatically.
   */
  app.get('/api/drive/resolve-event-folder/:eventId', async (req, res) => {
    try {
      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ success: false, error: 'Google Drive is not connected.', code: 'NOT_CONNECTED' });
      }

      const eventId = req.params.eventId;
      const eventTitle = req.query.title as string | undefined;
      const folderId = req.query.folderId as string | undefined;

      const result = await resolveEventFolder(token, eventId, eventTitle, folderId);
      return res.json(result);
    } catch (err: any) {
      console.error('[Drive Event Folder] Error resolving event folder:', err);
      return res.status(500).json({ success: false, error: err.message || 'Error resolving event folder' });
    }
  });

  /**
   * GET /api/drive/event-folder-files/:folderId
   * Lists all files in the designated event folder, groups them by membership ID string.
   * Flags ambiguities if multiple files share the same membership ID.
   */
  app.get('/api/drive/event-folder-files/:folderId', async (req, res) => {
    try {
      const folderId = req.params.folderId;
      if (!folderId) {
        return res.status(400).json({ error: 'Folder ID is required' });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive storage is disconnected.' });
      }

      const query = `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
      const fields = 'files(id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,description,properties)';
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=500`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return res.status(resp.status).json({ error: 'Drive query failed', details: errText });
      }

      const data = await resp.json();
      const rawFiles: any[] = data.files || [];

      // Group by membership ID (base filename without extension, treated as string to preserve leading zeros)
      const memberMap: { [key: string]: any[] } = {};
      rawFiles.forEach((f) => {
        const parts = (f.name || '').split('.');
        const baseName = parts.length > 1 ? parts.slice(0, -1).join('.') : f.name;
        const cleanNo = String(baseName).trim().toUpperCase();
        if (!memberMap[cleanNo]) memberMap[cleanNo] = [];
        memberMap[cleanNo].push(f);
      });

      const processedFiles = rawFiles.map((f) => {
        const parts = (f.name || '').split('.');
        const baseName = parts.length > 1 ? parts.slice(0, -1).join('.') : f.name;
        const cleanNo = String(baseName).trim().toUpperCase();
        const matchesCount = memberMap[cleanNo]?.length || 0;
        return {
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size ? `${(Number(f.size) / (1024 * 1024)).toFixed(2)} MB` : undefined,
          createdTime: f.createdTime,
          webViewLink: f.webViewLink,
          membershipNumber: cleanNo,
          isAmbiguous: matchesCount > 1,
          ambiguousMatchesCount: matchesCount,
          uploadSource: f.properties?.uploadSource || 'admin',
          approvalStatus: f.properties?.approvalStatus || 'not_required',
          proxyViewUrl: `/api/drive/file/${f.id}`,
          proxyDownloadUrl: `/api/drive/file/${f.id}?download=true`
        };
      });

      return res.json({
        success: true,
        folderId,
        count: processedFiles.length,
        files: processedFiles,
        memberMap
      });
    } catch (err: any) {
      console.error('[Drive Folder Files] Error listing folder files:', err);
      return res.status(500).json({ error: err.message || 'Error listing folder files' });
    }
  });

  /**
   * GET /api/drive/subfolders
   * Lists subfolders inside a given parent folder (defaults to NMO Gujarat root or events folder).
   */
  app.get('/api/drive/subfolders', async (req, res) => {
    try {
      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive is disconnected.', folders: [] });
      }
      const parentId = (req.query.parentId as string) || '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2';
      const q = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,createdTime)&pageSize=100&orderBy=name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!driveRes.ok) {
        const errText = await driveRes.text().catch(() => '');
        return res.status(driveRes.status).json({ error: 'Failed to list subfolders', details: errText });
      }
      const data = await driveRes.json();
      return res.json({
        success: true,
        folders: (data.files || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
          createdTime: f.createdTime
        }))
      });
    } catch (err: any) {
      console.error('[Drive Subfolders] Error listing subfolders:', err);
      return res.status(500).json({ error: err.message || 'Error listing subfolders' });
    }
  });

  /**
   * POST /api/drive/create-folder
   * Creates a subfolder in Google Drive securely server-side.
   */
  app.post('/api/drive/create-folder', async (req, res) => {
    try {
      const { name, parentId } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Folder name is required' });
      }
      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive is disconnected.' });
      }
      const parent = parentId || '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2';
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink,createdTime', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name.trim(),
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parent]
        })
      });
      if (!createRes.ok) {
        const err = await createRes.text().catch(() => '');
        return res.status(createRes.status).json({ error: 'Drive folder creation failed', details: err });
      }
      const folder = await createRes.json();
      return res.json({
        success: true,
        folder: {
          id: folder.id,
          name: folder.name,
          webViewLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
          createdTime: folder.createdTime
        }
      });
    } catch (err: any) {
      console.error('[Drive Create Folder] Error creating folder:', err);
      return res.status(500).json({ error: err.message || 'Error creating folder' });
    }
  });

  /**
   * POST /api/drive/check-duplicate
   * Checks if a certificate for this membership ID already exists in the event folder.
   * Differentiates events so legitimate certificates for different events are never blocked.
   */
  app.post('/api/drive/check-duplicate', async (req, res) => {
    try {
      const { folderId, membershipNumber, eventId } = req.body;
      if (!folderId || !membershipNumber) {
        return res.status(400).json({ error: 'folderId and membershipNumber are required' });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive storage is disconnected.' });
      }

      const cleanNo = String(membershipNumber).trim().toUpperCase();
      const cleanEventId = eventId ? String(eventId).replace(/[^a-zA-Z0-9_-]/g, '_') : '';
      const query = `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and (name contains '${cleanNo}') and trashed = false`;
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,createdTime,properties)&pageSize=25`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resp.ok) {
        return res.status(500).json({ error: 'Failed to check duplicate' });
      }

      const data = await resp.json();
      const files: any[] = data.files || [];
      const exactMatches = files.filter((f) => {
        const propMemNo = (f.properties?.membershipNumber || '').toUpperCase();
        const fName = (f.name || '').toUpperCase();
        const isMemMatch = fName.startsWith(cleanNo) || propMemNo === cleanNo;
        if (!isMemMatch) return false;

        // If eventId was specified, differentiate between events:
        if (cleanEventId && f.properties?.eventId) {
          return f.properties.eventId === eventId;
        }
        return true;
      });

      return res.json({
        success: true,
        exists: exactMatches.length > 0,
        matchesCount: exactMatches.length,
        existingFiles: exactMatches
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error checking duplicate' });
    }
  });

  /**
   * POST /api/drive/upload-certificate
   * Secure backend certificate upload endpoint:
   * - Validates event folder hierarchy ("NMO Gujarat → Events → [Event Folder]")
   * - Standardizes filename starting with membership ID (${cleanNo}.${ext} or ${cleanNo}_${eventId}.${ext})
   * - Segregates certificates strictly by verified membership ID
   * - Safe retry handling: reuses verified existing record on retry without failing
   * - Prevents duplicate creation without blocking legitimate certificates for different events
   * - Differentiates admin vs user upload source & approval status
   */
  app.post('/api/drive/upload-certificate', async (req, res) => {
    try {
      const {
        fileBase64,
        fileName,
        mimeType,
        membershipNumber,
        memberName,
        eventId,
        eventTitle,
        uploadSource,
        uploaderUid,
        overwriteExisting,
        existingFileId,
        targetFolderId
      } = req.body;

      if (!fileBase64 || !membershipNumber || !eventId) {
        return res.status(400).json({ error: 'fileBase64, membershipNumber, and eventId are required' });
      }

      const cleanNo = String(membershipNumber).trim().toUpperCase();
      if (!cleanNo) {
        return res.status(400).json({ error: 'Invalid Membership Number' });
      }

      const source = uploadSource === 'user' ? 'user' : 'admin';
      const approvalStatus = source === 'admin' ? 'not_required' : 'pending';

      // Membership ID integrity: If user upload, compare with verified cookie session
      const cookieMemberId = req.cookies && req.cookies['nmo_member_id']
        ? String(req.cookies['nmo_member_id']).trim().toUpperCase()
        : null;
      const verifiedMemberNo = (source === 'user' && cookieMemberId) ? cookieMemberId : cleanNo;

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive storage is disconnected.' });
      }

      // 1. Resolve or verify the event folder inside "NMO Gujarat → Events"
      let folderId = targetFolderId;
      if (!folderId) {
        const resolved: any = await resolveEventFolder(token, eventId, eventTitle);
        if (!resolved.success || !resolved.eventFolder) {
          return res.status(400).json({
            error: resolved.error || 'Event folder could not be resolved inside "NMO Gujarat → Events".'
          });
        }
        folderId = resolved.eventFolder.id;
      }

      // 2. Validate file type & extension
      const rawExt = (fileName || '').split('.').pop()?.toLowerCase() || 'jpg';
      const fileExt = ['pdf', 'jpg', 'jpeg', 'png'].includes(rawExt) ? rawExt : 'jpg';

      // Standardize filename: begins with membership ID and preserves event identifier if relevant
      const cleanEventId = (eventId && eventId !== 'general')
        ? String(eventId).replace(/[^a-zA-Z0-9_-]/g, '_')
        : '';
      const finalFileName = cleanEventId
        ? `${verifiedMemberNo}_${cleanEventId}.${fileExt}`
        : `${verifiedMemberNo}.${fileExt}`;
      const legacyFileName = `${verifiedMemberNo}.${fileExt}`;
      const finalMime = mimeType || (fileExt === 'pdf' ? 'application/pdf' : 'image/jpeg');

      // Convert base64 to buffer
      let cleanBase64 = fileBase64;
      if (cleanBase64.includes('base64,')) {
        cleanBase64 = cleanBase64.split('base64,')[1];
      }
      const fileBuffer = Buffer.from(cleanBase64, 'base64');

      if (fileBuffer.length > 15 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size exceeds maximum limit of 15MB' });
      }

      // 3. Duplicate conflict verification & safe retry handling
      const dupCheckQuery = `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and (name = '${finalFileName}' or name = '${legacyFileName}' or name contains '${verifiedMemberNo}') and trashed = false`;
      const dupResp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(dupCheckQuery)}&fields=files(id,name,mimeType,size,createdTime,webViewLink,properties)&pageSize=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (dupResp.ok) {
        const dupData = await dupResp.json();
        const candidateFiles: any[] = dupData.files || [];

        // Identify existing file specifically for THIS member and THIS event:
        const existingForThisEvent = candidateFiles.find((f: any) => {
          const propMemNo = (f.properties?.membershipNumber || '').toUpperCase();
          const fName = (f.name || '').toUpperCase();
          const isMemberMatch = fName.startsWith(verifiedMemberNo) || propMemNo === verifiedMemberNo;
          if (!isMemberMatch) return false;

          const fPropEventId = f.properties?.eventId;
          // If the file explicitly records eventId, match it:
          if (fPropEventId && eventId) {
            return fPropEventId === eventId;
          }
          // If filename has the eventId:
          if (cleanEventId && fName.includes(cleanEventId.toUpperCase())) {
            return true;
          }
          // If filenames match exactly:
          if (f.name === finalFileName || f.name === legacyFileName) {
            return true;
          }
          return false;
        });

        if (existingForThisEvent) {
          if (overwriteExisting) {
            // Explicit overwrite confirmed: remove previous file to prevent duplicates
            const fileToDelete = existingFileId || existingForThisEvent.id;
            console.log(`[Drive Upload] Replacing existing certificate file ${fileToDelete} for ${verifiedMemberNo} in event ${eventId}...`);
            await fetch(`https://www.googleapis.com/drive/v3/files/${fileToDelete}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            }).catch(() => {});
          } else {
            // Safe retry handling: If the certificate already exists in Google Drive for this event,
            // report success and return the existing verified certificate record.
            console.log(`[Drive Upload] Safe retry detected: reusing existing certificate ${existingForThisEvent.id} for member ${verifiedMemberNo} in event ${eventId}`);
            const existingRecord = {
              certId: `${eventId}_${verifiedMemberNo}`,
              eventId,
              eventTitle: existingForThisEvent.properties?.eventTitle || eventTitle || '',
              membershipNumber: verifiedMemberNo,
              memberName: existingForThisEvent.properties?.memberName || memberName || '',
              uploaderUid: existingForThisEvent.properties?.uploaderUid || uploaderUid || '',
              uploadSource: existingForThisEvent.properties?.uploadSource || source,
              approvalStatus: existingForThisEvent.properties?.approvalStatus || approvalStatus,
              driveFileId: existingForThisEvent.id,
              driveFolderId: folderId,
              originalFileName: existingForThisEvent.name,
              mimeType: existingForThisEvent.mimeType || finalMime,
              fileSize: existingForThisEvent.size ? `${(Number(existingForThisEvent.size) / (1024 * 1024)).toFixed(2)} MB` : undefined,
              uploadedAt: existingForThisEvent.createdTime || new Date().toISOString(),
              webViewLink: existingForThisEvent.webViewLink,
              proxyViewUrl: `/api/drive/file/${existingForThisEvent.id}`,
              proxyDownloadUrl: `/api/drive/file/${existingForThisEvent.id}?download=true`,
              alreadyExisted: true
            };

            return res.json({
              success: true,
              alreadyExisted: true,
              message: `Certificate for member ${verifiedMemberNo} is already safely recorded in Google Drive.`,
              certificate: existingRecord
            });
          }
        }
      }

      // 4. Perform Multipart Upload to Google Drive
      const metadata = {
        name: finalFileName,
        description: `NMO Certificate for Membership ID: ${cleanNo} (${memberName || 'Member'}). Event: ${eventTitle || eventId}. Source: ${source}. Approval: ${approvalStatus}.`,
        parents: [folderId],
        properties: {
          membershipNumber: cleanNo,
          memberName: memberName || '',
          eventId,
          eventTitle: eventTitle || '',
          uploadSource: source,
          approvalStatus,
          uploaderUid: uploaderUid || ''
        }
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartBody = Buffer.concat([
        Buffer.from(
          delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            `Content-Type: ${finalMime}\r\n` +
            'Content-Transfer-Encoding: base64\r\n\r\n'
        ),
        Buffer.from(cleanBase64),
        Buffer.from(closeDelim)
      ]);

      console.log(`[Drive Upload] Uploading certificate "${finalFileName}" to folder ${folderId} (Source: ${source}, Approval: ${approvalStatus})...`);
      const uploadResp = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,description,properties',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartBody
        }
      );

      if (!uploadResp.ok) {
        const errText = await uploadResp.text().catch(() => '');
        console.error('[Drive Upload] Google Drive API upload error:', uploadResp.status, errText);
        return res.status(uploadResp.status).json({
          error: 'Failed to upload certificate file to Google Drive',
          details: errText
        });
      }

      const uploadedFile = await uploadResp.json();
      console.log(`[Drive Upload] Successfully uploaded file ID ${uploadedFile.id} for ${cleanNo}`);

      const certRecord = {
        certId: `${eventId}_${cleanNo}`,
        eventId,
        eventTitle: eventTitle || '',
        membershipNumber: cleanNo,
        memberName: memberName || '',
        uploaderUid: uploaderUid || '',
        uploadSource: source,
        approvalStatus,
        driveFileId: uploadedFile.id,
        driveFolderId: folderId,
        originalFileName: fileName || finalFileName,
        mimeType: finalMime,
        fileSize: `${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`,
        uploadedAt: new Date().toISOString(),
        webViewLink: uploadedFile.webViewLink,
        proxyViewUrl: `/api/drive/file/${uploadedFile.id}`,
        proxyDownloadUrl: `/api/drive/file/${uploadedFile.id}?download=true`
      };

      return res.json({
        success: true,
        message:
          source === 'admin'
            ? `Certificate successfully uploaded directly to Google Drive for member ${cleanNo}.`
            : `Certificate successfully uploaded for member ${cleanNo} and submitted for Admin Approval.`,
        certificate: certRecord
      });
    } catch (err: any) {
      console.error('[Drive Upload] Exception during certificate upload:', err);
      return res.status(500).json({ error: err.message || 'Internal error uploading certificate' });
    }
  });

  // =========================================================================
  // Google Drive Folder Lookup & Event Disambiguation Helpers
  // =========================================================================
  interface CachedDriveFolderMeta {
    id: string;
    name: string;
    parents?: string[];
    expiresAt: number;
  }

  // Server-level in-memory cache for folder lookups (10-minute TTL)
  const serverDriveFolderCache = new Map<string, CachedDriveFolderMeta | null>();

  function isStructuralDriveFolder(folderName?: string): boolean {
    if (!folderName || typeof folderName !== 'string') return true;
    const clean = folderName.trim().toLowerCase();
    if (!clean) return true;

    const structuralNames = new Set([
      'nmo gujarat',
      'nmo-gujarat',
      'nmo india',
      'nmo_gujarat',
      'nmo',
      'events',
      'all events',
      'nmo events',
      'certificates',
      'certificate',
      'all certificates',
      'member certificates',
      'event certificates',
      'my drive',
      'drive',
      'root',
      'uploads',
      'documents',
      'files'
    ]);

    if (structuralNames.has(clean)) return true;
    if (/^(all\s+)?(certificates?|events)(\s+(files|docs|records))?$/i.test(clean)) return true;
    if (/^nmo(\s+gujarat)?$/i.test(clean)) return true;
    // Don't treat technical folder IDs as folder names
    if (/^[a-zA-Z0-9_-]{25,}$/.test(clean)) return true;

    return false;
  }

  async function getDriveFolderMetadata(
    folderId: string,
    token: string,
    requestFolderCache?: Map<string, CachedDriveFolderMeta | null>
  ): Promise<CachedDriveFolderMeta | null> {
    const cleanId = (folderId || '').trim();
    if (!cleanId) return null;

    // 1. Check request-scoped cache first
    if (requestFolderCache && requestFolderCache.has(cleanId)) {
      return requestFolderCache.get(cleanId) || null;
    }

    // 2. Check server-level memory cache
    const cached = serverDriveFolderCache.get(cleanId);
    if (cached !== undefined) {
      if (cached === null || cached.expiresAt > Date.now()) {
        if (requestFolderCache) requestFolderCache.set(cleanId, cached);
        return cached;
      }
    }

    // 3. Query Google Drive API
    try {
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanId)}?fields=id,name,parents,trashed`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resp.ok) {
        serverDriveFolderCache.set(cleanId, null);
        if (requestFolderCache) requestFolderCache.set(cleanId, null);
        return null;
      }

      const data = await resp.json();
      if (data.trashed) {
        serverDriveFolderCache.set(cleanId, null);
        if (requestFolderCache) requestFolderCache.set(cleanId, null);
        return null;
      }

      const meta: CachedDriveFolderMeta = {
        id: data.id,
        name: data.name || '',
        parents: Array.isArray(data.parents) ? data.parents : undefined,
        expiresAt: Date.now() + 10 * 60 * 1000
      };

      serverDriveFolderCache.set(cleanId, meta);
      if (requestFolderCache) requestFolderCache.set(cleanId, meta);
      return meta;
    } catch (err) {
      console.warn(`[Drive Folder Lookup] Error fetching folder ${cleanId}:`, err);
      serverDriveFolderCache.set(cleanId, null);
      if (requestFolderCache) requestFolderCache.set(cleanId, null);
      return null;
    }
  }

  async function resolveCertificateEventFolder(
    parentIds: string[] | undefined,
    token: string,
    requestFolderCache: Map<string, CachedDriveFolderMeta | null>
  ): Promise<{
    driveFolderId?: string;
    driveFolderName?: string;
    eventName?: string;
  }> {
    if (!parentIds || !parentIds.length) {
      return {};
    }

    const immediateFolderId = parentIds[0];
    const immediateFolder = await getDriveFolderMetadata(immediateFolderId, token, requestFolderCache);

    if (!immediateFolder) {
      return { driveFolderId: immediateFolderId };
    }

    // Build the ancestor chain from immediate folder upwards (depth limit: 6 to prevent cycles)
    const chain: CachedDriveFolderMeta[] = [immediateFolder];
    let curr = immediateFolder;
    let depth = 0;
    while (curr.parents && curr.parents.length > 0 && depth < 6) {
      depth++;
      const nextParentId = curr.parents[0];
      const parentMeta = await getDriveFolderMetadata(nextParentId, token, requestFolderCache);
      if (!parentMeta) break;
      chain.push(parentMeta);
      curr = parentMeta;
    }

    // 1. Check if an ancestor is the structural "Events" folder
    let eventFolder: CachedDriveFolderMeta | undefined;
    const eventsIdx = chain.findIndex((f) => {
      const n = (f.name || '').trim().toLowerCase();
      return n === 'events' || n === 'all events' || n === 'nmo events';
    });

    if (eventsIdx > 0) {
      const candidate = chain[eventsIdx - 1];
      if (candidate && !isStructuralDriveFolder(candidate.name)) {
        eventFolder = candidate;
      }
    }

    // 2. If no "Events" folder found, take the highest non-structural folder in the chain
    if (!eventFolder) {
      const nonStructural = chain.filter((f) => !isStructuralDriveFolder(f.name));
      if (nonStructural.length > 0) {
        eventFolder = nonStructural[nonStructural.length - 1];
      }
    }

    const eventName = eventFolder ? eventFolder.name.trim() : undefined;
    const immediateIsStructural = isStructuralDriveFolder(immediateFolder.name);

    return {
      driveFolderId: eventFolder ? eventFolder.id : immediateFolder.id,
      driveFolderName: immediateIsStructural
        ? (eventName || undefined)
        : immediateFolder.name.trim(),
      eventName
    };
  }

  /**
   * GET /api/drive/member-certificates/:membershipNumber
   * Queries Google Drive exclusively for files matching the participant's membership ID.
   * Strictly filters results: Does NOT show all certificates to everyone.
   * Resolves certificate parent folders and event names via Google Drive API with caching.
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

      // Read member cookie if present to compare and enforce isolation
      const cookieMemberId = req.cookies && req.cookies['nmo_member_id']
        ? String(req.cookies['nmo_member_id']).trim().toUpperCase()
        : null;

      // Set cookie in response header to maintain verified membership session
      res.cookie('nmo_member_id', cleanMemNo, {
        maxAge: 31536000 * 1000,
        path: '/',
        sameSite: 'lax'
      });

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.json({
          connected: false,
          membershipNumber: cleanMemNo,
          certificates: [],
          message: 'Google Drive integration not currently connected on server.'
        });
      }

      // Query Google Drive for files where name matches or contains the participant's membership ID
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
      // The file name would be membership ID (e.g. 231112001791.pdf or 231112001791.jpg).
      const matchingFiles = rawFiles.filter((f) => {
        const fNameUpper = (f.name || '').toUpperCase();
        const propMemNo = (f.properties?.membershipNumber || '').toUpperCase();
        return fNameUpper.startsWith(cleanMemNo) || fNameUpper.includes(cleanMemNo) || propMemNo === cleanMemNo;
      });

      // Request-scoped cache to reuse folder lookups across files within this single request
      const requestFolderCache = new Map<string, CachedDriveFolderMeta | null>();

      const strictlyFiltered = await Promise.all(
        matchingFiles.map(async (f) => {
          const folderMeta = await resolveCertificateEventFolder(
            f.parents,
            token,
            requestFolderCache
          );

          // Priority for resolved event name:
          // 1. Google Drive event folder name (folderMeta.eventName)
          // 2. Non-structural driveFolderName
          // 3. Certificate property eventTitle (if non-structural)
          const resolvedEventName =
            folderMeta.eventName ||
            (!isStructuralDriveFolder(folderMeta.driveFolderName) ? folderMeta.driveFolderName : undefined) ||
            (!isStructuralDriveFolder(f.properties?.eventTitle) ? f.properties?.eventTitle : undefined);

          return {
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
            eventId: f.properties?.eventId,
            eventTitle: f.properties?.eventTitle,
            driveFolderId: folderMeta.driveFolderId,
            driveFolderName: folderMeta.driveFolderName,
            eventName: resolvedEventName,
            approvalStatus: f.properties?.approvalStatus || (f.properties?.uploadSource === 'user' ? 'pending' : 'not_required'),
            uploadSource: f.properties?.uploadSource || (f.properties?.uploadedBy === 'member' ? 'user' : 'admin'),
            uploadedBy: f.properties?.uploadedBy || (f.properties?.uploadSource === 'user' ? 'member' : 'admin'),
            proxyViewUrl: `/api/drive/file/${f.id}`,
            proxyDownloadUrl: `/api/drive/file/${f.id}?download=true`
          };
        })
      );

      return res.json({
        success: true,
        connected: true,
        membershipNumber: cleanMemNo,
        cookieVerified: Boolean(cookieMemberId && cookieMemberId === cleanMemNo),
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

  /**
   * DELETE /api/drive/file/:fileId
   * Deletes a file from Google Drive (e.g. when admin rejects an uploaded certificate).
   */
  app.delete('/api/drive/file/:fileId', async (req, res) => {
    try {
      const fileId = req.params.fileId;
      if (!fileId) {
        return res.status(400).json({ error: 'File ID is required' });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive storage is disconnected.' });
      }

      console.log(`[Drive Delete] Attempting to delete file ${fileId} from Google Drive...`);
      const deleteResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!deleteResp.ok && deleteResp.status !== 404) {
        const errText = await deleteResp.text().catch(() => '');
        console.warn('[Drive Delete] Failed to delete file:', deleteResp.status, errText);
        return res.status(deleteResp.status).json({ error: 'Failed to delete file from Google Drive' });
      }

      console.log(`[Drive Delete] File ${fileId} successfully deleted from Google Drive.`);
      return res.json({ success: true, message: 'File deleted from Google Drive' });
    } catch (err: any) {
      console.error('[Drive Delete] Exception deleting file:', err);
      return res.status(500).json({ error: err.message || 'Internal error deleting file' });
    }
  });

  /**
   * POST /api/drive/approve-certificate
   * Privileged admin approval endpoint:
   * Updates file properties on Google Drive and confirms approval status.
   */
  app.post('/api/drive/approve-certificate', async (req, res) => {
    try {
      const { driveFileId, adminUid, adminName } = req.body;
      if (!driveFileId) {
        return res.status(400).json({ error: 'driveFileId is required' });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive storage is disconnected.' });
      }

      const patchResp = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            approvalStatus: 'approved',
            decisionByAdminUid: adminUid || '',
            decisionByAdminName: adminName || 'Administrator',
            decisionAt: new Date().toISOString()
          }
        })
      });

      if (!patchResp.ok) {
        const errText = await patchResp.text().catch(() => '');
        console.warn('[Drive Approve] Drive file property update returned:', patchResp.status, errText);
      }

      return res.json({ success: true, message: 'Certificate successfully approved and updated in Drive.' });
    } catch (err: any) {
      console.error('[Drive Approve] Error approving certificate:', err);
      return res.status(500).json({ error: err.message || 'Error approving certificate' });
    }
  });

  /**
   * POST /api/drive/reject-certificate
   * Privileged admin rejection endpoint:
   * Permanently deletes unapproved file from Google Drive.
   */
  app.post('/api/drive/reject-certificate', async (req, res) => {
    try {
      const { driveFileId, rejectionReason, adminUid, adminName } = req.body;
      if (!driveFileId) {
        return res.status(400).json({ error: 'driveFileId is required' });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive storage is disconnected.' });
      }

      console.log(`[Drive Reject] Deleting unapproved file ${driveFileId} (Reason: ${rejectionReason || 'Rejected by Admin'})...`);
      const deleteResp = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!deleteResp.ok && deleteResp.status !== 404) {
        const errText = await deleteResp.text().catch(() => '');
        console.warn('[Drive Reject] Drive deletion returned:', deleteResp.status, errText);
      }

      return res.json({ success: true, message: 'Unapproved file deleted from Google Drive.' });
    } catch (err: any) {
      console.error('[Drive Reject] Error rejecting certificate:', err);
      return res.status(500).json({ error: err.message || 'Error rejecting certificate' });
    }
  });

  // Vite SPA middlewares in development, or fallback if dist not yet built
  const distPath = path.resolve(__dirname, 'dist');
  const isProduction = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve pre-built static files in production
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`NMO Gujarat Server running at http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
