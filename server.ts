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
import type { App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestoreSdk } from 'firebase-admin/firestore';
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore';

dotenv.config();

// Global process-level safety net: prevent unhandled library rejections or exceptions from crashing the server
process.on('unhandledRejection', (reason: any) => {
  const errMsg = reason?.message || String(reason || 'Unknown unhandled rejection');
  console.error('[Process Safety] Handled unhandled promise rejection safely:', errMsg);
});

process.on('uncaughtException', (err: any) => {
  const errMsg = err?.message || String(err || 'Unknown uncaught exception');
  console.error('[Process Safety] Handled uncaught exception safely:', errMsg);
});

// =========================================================================
// Firebase Admin SDK Robust Configuration Loader
// Strict separation: Public ID Token Verification vs Privileged Firestore/Admin Access
// Target Project: nmo-india-demo (Preserved)
// =========================================================================
const FIREBASE_ADMIN_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nmo-india-demo';

// Safe diagnostic state variables (no tokens or secrets exposed)
let isPublicTokenVerificationReady = false;
let hasPrivilegedServiceAccount = false;
let privilegedAuthType: 'service_account_json' | 'client_email_and_key' | 'project_id_only' | 'uninitialized' = 'uninitialized';
let privilegedInitError: string | null = null;
let adminAppInstance: AdminApp | null = null;
let cachedAdminFirestore: AdminFirestore | null = null;

// Backward-compatible alias for existing code
let isFirebaseAdminInitialized = false;

/**
 * Normalizes and validates a PEM private key from environment variables:
 * - Strips surrounding single or double quotes
 * - Resolves escaped newlines (\n, \\n, \r\n, \r)
 * - Reconstructs proper 64-column PEM format if spaces replaced newlines
 * - Verifies key validity using Node crypto engine without leaking secrets
 */
function normalizePrivateKey(rawKey: string): { key: string; valid: boolean; error?: string } {
  if (!rawKey || typeof rawKey !== 'string') {
    return { key: '', valid: false, error: 'Private key is empty or not a string.' };
  }

  let cleaned = rawKey.trim();
  // Strip surrounding quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Normalize all escaped newline formats
  cleaned = cleaned
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Check for standard PEM header and footer
  const headerMatch = cleaned.match(/-----BEGIN [A-Z0-9 ]+-----/);
  const footerMatch = cleaned.match(/-----END [A-Z0-9 ]+-----/);

  if (headerMatch && footerMatch) {
    const header = headerMatch[0];
    const footer = footerMatch[0];
    const headerIdx = cleaned.indexOf(header);
    const footerIdx = cleaned.indexOf(footer);
    const rawBody = cleaned.slice(headerIdx + header.length, footerIdx).replace(/\s+/g, '');
    const chunked = rawBody.match(/.{1,64}/g)?.join('\n') || rawBody;
    cleaned = `${header}\n${chunked}\n${footer}\n`;
  } else if (!headerMatch && !footerMatch) {
    // Wrap raw base64 payload if user omitted PEM boundaries
    const rawBody = cleaned.replace(/\s+/g, '');
    const chunked = rawBody.match(/.{1,64}/g)?.join('\n') || rawBody;
    cleaned = `-----BEGIN PRIVATE KEY-----\n${chunked}\n-----END PRIVATE KEY-----\n`;
  }

  // Validate with Node's crypto engine without logging the key
  try {
    crypto.createPrivateKey(cleaned);
    return { key: cleaned, valid: true };
  } catch (err: any) {
    return {
      key: cleaned,
      valid: false,
      error: `Crypto key parser error: ${err?.message || 'Invalid PEM private key'}`
    };
  }
}

/**
 * Safely parses FIREBASE_SERVICE_ACCOUNT_KEY from JSON, base64-encoded JSON, or quoted strings.
 */
function parseServiceAccountJson(val: string): any | null {
  if (!val || typeof val !== 'string') return null;
  let str = val.trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  // Detect and decode base64
  if (!str.startsWith('{') && /^[A-Za-z0-9+/=]+$/.test(str)) {
    try {
      const decoded = Buffer.from(str, 'base64').toString('utf8');
      if (decoded.trim().startsWith('{')) {
        str = decoded.trim();
      }
    } catch {}
  }
  return JSON.parse(str);
}

function initFirebaseAdminSDK() {
  const existingApps = getAdminApps();
  if (existingApps.length > 0) {
    adminAppInstance = existingApps[0];
    isPublicTokenVerificationReady = true;
    isFirebaseAdminInitialized = true;
    return;
  }

  let privilegedCreds: { projectId: string; clientEmail: string; privateKey: string } | null = null;

  // Strategy 1: FIREBASE_SERVICE_ACCOUNT_KEY (JSON service account)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const parsed = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      if (parsed && typeof parsed === 'object') {
        const clientEmail = (parsed.client_email || '').trim();
        const rawPrivateKey = parsed.private_key || '';
        const keyResult = normalizePrivateKey(rawPrivateKey);

        if (!clientEmail || !clientEmail.includes('@')) {
          privilegedInitError = 'FIREBASE_SERVICE_ACCOUNT_KEY is missing a valid client_email.';
        } else if (!keyResult.valid) {
          privilegedInitError = `FIREBASE_SERVICE_ACCOUNT_KEY private_key validation failed: ${keyResult.error}`;
        } else {
          privilegedCreds = {
            projectId: parsed.project_id || FIREBASE_ADMIN_PROJECT_ID,
            clientEmail,
            privateKey: keyResult.key
          };
          privilegedAuthType = 'service_account_json';
        }
      } else {
        privilegedInitError = 'FIREBASE_SERVICE_ACCOUNT_KEY does not contain a valid JSON object.';
      }
    } catch (parseErr: any) {
      privilegedInitError = `Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON: ${parseErr?.message || parseErr}`;
    }
  }

  // Strategy 2: FIREBASE_CLIENT_EMAIL & FIREBASE_PRIVATE_KEY
  if (!privilegedCreds && (process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_PRIVATE_KEY)) {
    const rawEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
    const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';

    if (!rawEmail || !rawEmail.includes('@')) {
      privilegedInitError = 'FIREBASE_CLIENT_EMAIL is missing or not a valid service account email.';
    } else if (!rawKey) {
      privilegedInitError = 'FIREBASE_PRIVATE_KEY is missing.';
    } else {
      const keyResult = normalizePrivateKey(rawKey);
      if (!keyResult.valid) {
        privilegedInitError = `FIREBASE_PRIVATE_KEY format error: ${keyResult.error}`;
      } else {
        privilegedCreds = {
          projectId: FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: rawEmail,
          privateKey: keyResult.key
        };
        privilegedAuthType = 'client_email_and_key';
      }
    }
  }

  // If valid service account credentials were prepared, initialize privileged app
  if (privilegedCreds) {
    try {
      adminAppInstance = initAdminApp({
        credential: adminCert(privilegedCreds),
        projectId: privilegedCreds.projectId || FIREBASE_ADMIN_PROJECT_ID
      });
      hasPrivilegedServiceAccount = true;
      isPublicTokenVerificationReady = true;
      isFirebaseAdminInitialized = true;
      privilegedInitError = null;
      console.log(
        `[Firebase Admin] Privileged Service Account initialized (${privilegedAuthType}) for project: ${FIREBASE_ADMIN_PROJECT_ID}`
      );
      return;
    } catch (certErr: any) {
      privilegedInitError = `Firebase Admin cert initialization error: ${certErr?.message || certErr}`;
      console.error(`[Firebase Admin] Privileged initialization failed: ${certErr?.message || certErr}`);
      adminAppInstance = null;
    }
  }

  // Fallback: Initialize with Project ID only for verifying public Firebase ID tokens
  // NOTE: This intentionally has NO privileged service account attached.
  try {
    adminAppInstance = initAdminApp({
      projectId: FIREBASE_ADMIN_PROJECT_ID
    });
    isPublicTokenVerificationReady = true;
    hasPrivilegedServiceAccount = false;
    privilegedAuthType = 'project_id_only';
    isFirebaseAdminInitialized = true;
    if (!privilegedInitError) {
      privilegedInitError =
        'No service account credentials configured. Public Firebase ID token verification is active. Server-side privileged Firestore requires FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_CLIENT_EMAIL & FIREBASE_PRIVATE_KEY.';
    }
    console.log(
      `[Firebase Admin] Initialized with Project ID "${FIREBASE_ADMIN_PROJECT_ID}" for public ID token verification ONLY. (Privileged operations disabled; ADC will not be invoked).`
    );
  } catch (fallbackErr: any) {
    console.error('[Firebase Admin] Fallback initialization error:', fallbackErr?.message || fallbackErr);
  }
}

initFirebaseAdminSDK();

/**
 * Returns the privileged Firestore instance if and only if explicit service account
 * credentials have been configured and verified.
 * Never calls getFirestore() without explicit credentials, preventing NO_ADC_FOUND errors on Render.
 */
function getAdminFirestore(): AdminFirestore | null {
  if (!hasPrivilegedServiceAccount || !adminAppInstance) {
    return null;
  }
  if (!cachedAdminFirestore) {
    try {
      cachedAdminFirestore = getAdminFirestoreSdk(adminAppInstance);
    } catch (err: any) {
      console.warn('[Firebase Firestore] Failed to instantiate Admin Firestore with service account:', err?.message || err);
      return null;
    }
  }
  return cachedAdminFirestore;
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

  const corsMiddleware = cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, or same-origin)
      if (!origin) return callback(null, true);

      const isAllowed =
        ALLOWED_ORIGINS.includes(origin) ||
        origin.endsWith('.web.app') ||
        origin.endsWith('.firebaseapp.com') ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1');

      if (isAllowed) {
        return callback(null, true);
      }

      console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'x-admin-role',
      'X-Admin-Role',
      'x-admin-email',
      'X-Admin-Email',
      'x-admin-name',
      'X-Admin-Name',
      'x-user-role',
      'X-User-Role',
      'x-member-id',
      'X-Member-Id',
      'Cache-Control',
      'Pragma'
    ]
  });

  app.use(corsMiddleware);
  app.options('*', corsMiddleware);

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use(cookieParser());

  // Comprehensive Health and Diagnostic Check
  // Reports operational status of Firebase Admin SDK and Google Drive OAuth without leaking secrets
  app.get('/api/health', async (req, res) => {
    let driveSession: SecureDriveSessionRecord | null = null;
    try {
      driveSession = await getDurableDriveSession();
    } catch {
      driveSession = readSecureDriveSession();
    }

    const envRefreshToken = Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
    const clientId = Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID);
    const clientSecret = Boolean(process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET);
    let redirectUri = '';
    try {
      redirectUri = getOAuthRedirectUri(req);
    } catch {}

    res.json({
      status: 'ok',
      service: 'NMO Gujarat API',
      timestamp: new Date().toISOString(),
      firebaseAdmin: {
        projectId: FIREBASE_ADMIN_PROJECT_ID,
        publicTokenVerificationReady: isPublicTokenVerificationReady,
        hasPrivilegedServiceAccount,
        authMethod: privilegedAuthType,
        serviceAccountKeyConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
        clientEmailConfigured: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
        privateKeyConfigured: Boolean(process.env.FIREBASE_PRIVATE_KEY),
        privilegedInitNotice: privilegedInitError || undefined
      },
      googleDrive: {
        oauthConfigured: clientId && clientSecret,
        clientIdConfigured: clientId,
        clientSecretConfigured: clientSecret,
        hasRefreshToken: Boolean(driveSession?.refreshToken || envRefreshToken),
        redirectUri,
        status: driveSession?.status || (envRefreshToken ? 'active' : 'disconnected'),
        durableStorage: Boolean(envRefreshToken || driveSession?.refreshToken),
        persistedInFirestore: Boolean(driveSession?.persistedInFirestore)
      }
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
  // Encrypted Firestore Storage (Firebase Admin SDK) + Local Container Cache
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
    persistedInFirestore?: boolean;
  }

  // Active in-memory session cache
  let inMemoryDriveSession: SecureDriveSessionRecord | null = null;
  // Mutex lock to deduplicate concurrent refresh requests across parallel API calls
  let tokenRefreshPromise: Promise<string | null> | null = null;

  /**
   * Resolves the 32-byte encryption key for AES-256-GCM authenticated encryption.
   * Prioritizes DRIVE_TOKEN_ENCRYPTION_KEY, TOKEN_ENCRYPTION_KEY, ENCRYPTION_KEY, or SESSION_SECRET.
   * Employs a deterministic project salt fallback so encrypted storage in Firestore always functions safely.
   */
  function getDriveEncryptionKey(): Buffer {
    const secret = (
      process.env.DRIVE_TOKEN_ENCRYPTION_KEY ||
      process.env.TOKEN_ENCRYPTION_KEY ||
      process.env.ENCRYPTION_KEY ||
      process.env.SESSION_SECRET ||
      ''
    ).trim();

    if (!secret) {
      return crypto.createHash('sha256').update(`nmo-gujarat-secure-salt-${FIREBASE_ADMIN_PROJECT_ID}`).digest();
    }
    return crypto.createHash('sha256').update(secret).digest();
  }

  /**
   * Encrypts a plaintext refresh token using AES-256-GCM authenticated encryption.
   * Output format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
   */
  function encryptRefreshToken(token: string): string | null {
    if (!token) return null;
    const key = getDriveEncryptionKey();

    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
    } catch (err: any) {
      console.error('[Drive Encryption] Error encrypting refresh token:', err?.message || err);
      return null;
    }
  }

  /**
   * Decrypts an encrypted refresh token from AES-256-GCM format.
   * Tests all available configured keys and fallbacks to handle key rotation or environment updates.
   */
  function decryptRefreshToken(payload: string): string | null {
    if (!payload || !payload.startsWith('enc:v1:')) {
      return null;
    }

    const candidateSecrets: string[] = [
      process.env.DRIVE_TOKEN_ENCRYPTION_KEY,
      process.env.TOKEN_ENCRYPTION_KEY,
      process.env.ENCRYPTION_KEY,
      process.env.SESSION_SECRET,
      `nmo-gujarat-secure-salt-${FIREBASE_ADMIN_PROJECT_ID}`
    ].filter((s): s is string => Boolean(s && s.trim()));

    const uniqueKeys = Array.from(new Set(candidateSecrets)).map((s) =>
      crypto.createHash('sha256').update(s.trim()).digest()
    );

    for (const key of uniqueKeys) {
      try {
        const parts = payload.split(':');
        if (parts.length !== 5) {
          continue;
        }
        const iv = Buffer.from(parts[2], 'hex');
        const tag = Buffer.from(parts[3], 'hex');
        const ciphertext = Buffer.from(parts[4], 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted.toString('utf8');
      } catch {
        // Try next candidate key
      }
    }

    console.warn('[Drive Decryption] Failed to decrypt refresh token with any configured or fallback keys.');
    return null;
  }

  function readSecureDriveSessionFromFileCache(): SecureDriveSessionRecord | null {
    try {
      if (!fs.existsSync(SECURE_CREDENTIALS_FILE)) {
        return null;
      }
      const raw = fs.readFileSync(SECURE_CREDENTIALS_FILE, 'utf-8');
      const data = JSON.parse(raw) as SecureDriveSessionRecord;
      return data;
    } catch (err) {
      return null;
    }
  }

  function writeSecureDriveSessionFileCache(session: SecureDriveSessionRecord) {
    try {
      if (!fs.existsSync(SECURE_CREDENTIALS_DIR)) {
        fs.mkdirSync(SECURE_CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(SECURE_CREDENTIALS_FILE, JSON.stringify(session, null, 2), {
        mode: 0o600
      });
    } catch (err) {
      console.warn('[Drive Auth] Notice writing local session cache file:', err);
    }
  }

  /**
   * Synchronous accessor for in-memory / cached Drive session.
   */
  function readSecureDriveSession(): SecureDriveSessionRecord | null {
    if (inMemoryDriveSession) {
      return inMemoryDriveSession;
    }
    const cached = readSecureDriveSessionFromFileCache();
    if (cached) {
      inMemoryDriveSession = cached;
      return cached;
    }
    if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
      return {
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
    return null;
  }

  /**
   * Durable async loader: checks in-memory, Firestore Settings/googleDriveAuth (decrypting refresh token),
   * local cache file, and environment variable.
   */
  async function getDurableDriveSession(forceReload = false): Promise<SecureDriveSessionRecord | null> {
    if (inMemoryDriveSession && !forceReload) {
      return inMemoryDriveSession;
    }

    // 1. Try reading encrypted session from Firestore using Firebase Admin SDK
    const adminDb = getAdminFirestore();
    if (adminDb) {
      try {
        const docSnap = await adminDb.collection('Settings').doc('googleDriveAuth').get();
        if (docSnap.exists) {
          const data = docSnap.data();
          if (data) {
            if (data.status === 'disconnected') {
              inMemoryDriveSession = {
                status: 'disconnected',
                expiresAt: 0,
                accountEmail: data.accountEmail || '',
                folderId: data.folderId || '',
                folderName: data.folderName || '',
                folderUrl: data.folderUrl || '',
                updatedAt: data.updatedAt || new Date().toISOString(),
                persistedInFirestore: true
              };
              return inMemoryDriveSession;
            }

            let decryptedRefreshToken: string | undefined = undefined;
            if (data.encryptedRefreshToken) {
              decryptedRefreshToken = decryptRefreshToken(data.encryptedRefreshToken) || undefined;
            } else if (data.refreshToken) {
              decryptedRefreshToken = data.refreshToken;
            }

            const effectiveRefreshToken = decryptedRefreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
            if (effectiveRefreshToken || data.accessToken) {
              const restored: SecureDriveSessionRecord = {
                refreshToken: effectiveRefreshToken,
                accessToken: data.accessToken,
                expiresAt: data.expiresAt || 0,
                accountEmail: data.accountEmail || process.env.VITE_SUPER_ADMIN_EMAIL || 'devanshshah768@gmail.com',
                accountName: data.accountName || 'NMO Gujarat Admin',
                accountPhoto: data.accountPhoto,
                folderId: data.folderId || '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
                folderName: data.folderName || 'NMO Gujarat',
                folderUrl: data.folderUrl || 'https://drive.google.com/drive/folders/1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2',
                status: data.status || 'active',
                updatedAt: data.updatedAt || new Date().toISOString(),
                lastRefreshedAt: data.lastRefreshedAt,
                persistedInFirestore: true
              };

              inMemoryDriveSession = restored;
              writeSecureDriveSessionFileCache(restored);
              return inMemoryDriveSession;
            }
          }
        }
      } catch (fsErr: any) {
        console.warn('[Drive Auth] Notice loading session from Firestore:', fsErr?.message || fsErr);
      }
    }

    // 2. Fallback to local cache file
    const fileRecord = readSecureDriveSessionFromFileCache();
    if (fileRecord) {
      inMemoryDriveSession = fileRecord;
      return inMemoryDriveSession;
    }

    // 3. Fallback to environment variable GOOGLE_DRIVE_REFRESH_TOKEN
    const envRefreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    if (envRefreshToken) {
      inMemoryDriveSession = {
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
      return inMemoryDriveSession;
    }

    return null;
  }

  /**
   * Durably saves Drive credentials:
   * - Encrypts the refresh token using AES-256-GCM.
   * - Saves to Firestore (Settings/googleDriveAuth) via Firebase Admin SDK.
   * - Updates non-sensitive public metadata in Firestore (Settings/googleDriveConfig).
   * - Caches to in-memory state and local filesystem.
   */
  async function saveDurableDriveSession(session: SecureDriveSessionRecord): Promise<void> {
    if (!session.refreshToken && inMemoryDriveSession?.refreshToken && session.status !== 'disconnected') {
      session.refreshToken = inMemoryDriveSession.refreshToken;
    }

    inMemoryDriveSession = session;
    if (session.status === 'disconnected') {
      try {
        if (fs.existsSync(SECURE_CREDENTIALS_FILE)) {
          fs.unlinkSync(SECURE_CREDENTIALS_FILE);
        }
      } catch {}
    } else {
      writeSecureDriveSessionFileCache(session);
    }

    const adminDb = getAdminFirestore();
    if (adminDb) {
      try {
        const encrypted = session.refreshToken ? encryptRefreshToken(session.refreshToken) : null;
        const firestorePayload: any = {
          accountEmail: session.accountEmail,
          accountName: session.accountName,
          accountPhoto: session.accountPhoto || null,
          folderId: session.folderId,
          folderName: session.folderName,
          folderUrl: session.folderUrl,
          status: session.status,
          expiresAt: session.expiresAt,
          updatedAt: session.updatedAt || new Date().toISOString(),
          lastRefreshedAt: session.lastRefreshedAt || null,
          hasRefreshToken: Boolean(session.refreshToken),
          encrypted: Boolean(encrypted)
        };

        if (encrypted) {
          firestorePayload.encryptedRefreshToken = encrypted;
        } else if (session.status === 'disconnected') {
          firestorePayload.encryptedRefreshToken = null;
          firestorePayload.accessToken = null;
        }

        await adminDb.collection('Settings').doc('googleDriveAuth').set(firestorePayload, { merge: true });
        session.persistedInFirestore = true;
        console.log(`[Drive Auth] Durably stored encrypted Drive session in Firestore (Settings/googleDriveAuth) for ${session.accountEmail}`);

        // Update public config doc with safe metadata (no tokens)
        await adminDb.collection('Settings').doc('googleDriveConfig').set({
          accountEmail: session.accountEmail,
          accountName: session.accountName,
          folderId: session.folderId,
          folderName: session.folderName,
          folderUrl: session.folderUrl,
          status: session.status,
          hasRefreshToken: Boolean(session.refreshToken),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (fsErr: any) {
        console.error('[Drive Auth] Error writing session to Firestore:', fsErr?.message || fsErr);
        session.persistedInFirestore = false;
      }
    } else {
      console.info('[Drive Auth] Firebase Admin Firestore not configured with service account; session cached in local container storage.');
      session.persistedInFirestore = false;
    }
  }

  function writeSecureDriveSession(session: SecureDriveSessionRecord) {
    saveDurableDriveSession(session).catch((err) => {
      console.warn('[Drive Auth] Background durable save notice:', err?.message || err);
    });
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
      const uri = process.env.GOOGLE_DRIVE_REDIRECT_URI.trim();
      // Refuse misconfigured GOOGLE_DRIVE_REDIRECT_URI targeting Firebase Auth handler
      if (!uri.includes('__/auth/handler') && !uri.includes('firebaseapp.com') && !uri.includes('web.app')) {
        return uri;
      }
      console.warn(`[Drive OAuth] Ignoring misconfigured GOOGLE_DRIVE_REDIRECT_URI ("${uri}") pointing to Firebase. Using Render backend callback.`);
    }
    const renderExternal = (process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
    if (renderExternal) {
      return `${renderExternal}/api/auth/google/callback`;
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
      const existing = await getDurableDriveSession();
      const effectiveRefreshToken = tokenData.refresh_token || existing?.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

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

      await saveDurableDriveSession(updatedSession);
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
      let session = await getDurableDriveSession();
      const redirectUri = getOAuthRedirectUri(req);
      const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
      const oauthConfigured = Boolean(clientId && clientSecret);

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
          oauthConfigured,
          redirectUri,
          persistedInFirestore: false,
          persistenceMethod: 'none',
          encryptionKeyConfigured: Boolean(process.env.DRIVE_TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET),
          firebaseAdminPrivileged: hasPrivilegedServiceAccount
        });
      }

      const now = Date.now();
      const isExpiringSoon = !session.accessToken || session.expiresAt < now + 5 * 60 * 1000; // less than 5 min left or expired

      // If token is expiring soon or expired and we have a refresh token, auto-renew now!
      if (isExpiringSoon && session.refreshToken) {
        const refreshed = await refreshAccessTokenWithGoogle(session.refreshToken);
        if (refreshed) {
          session.accessToken = refreshed.accessToken;
          session.expiresAt = now + refreshed.expiresIn * 1000;
          session.lastRefreshedAt = new Date().toISOString();
          session.status = 'active';
          await saveDurableDriveSession(session);
        } else if (session.expiresAt < now) {
          session.status = 'expired';
          await saveDurableDriveSession(session);
        }
      }

      // Live verification probe: Never report Drive as connected unless backend can actually authenticate and perform an authorized Drive operation
      let isActuallyConnected = false;
      if (session.status === 'active' && session.accessToken) {
        try {
          const probeRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
            headers: { Authorization: `Bearer ${session.accessToken}` }
          });
          if (probeRes.ok) {
            isActuallyConnected = true;
          } else if (probeRes.status === 401 && session.refreshToken) {
            // Attempt immediate recovery via refresh token
            const fresh = await refreshAccessTokenWithGoogle(session.refreshToken);
            if (fresh) {
              session.accessToken = fresh.accessToken;
              session.expiresAt = Date.now() + fresh.expiresIn * 1000;
              session.lastRefreshedAt = new Date().toISOString();
              session.status = 'active';
              await saveDurableDriveSession(session);
              const retryProbe = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
                headers: { Authorization: `Bearer ${fresh.accessToken}` }
              });
              if (retryProbe.ok) {
                isActuallyConnected = true;
              } else {
                session.status = 'expired';
                await saveDurableDriveSession(session);
              }
            } else {
              session.status = 'expired';
              await saveDurableDriveSession(session);
            }
          }
        } catch (probeErr) {
          console.warn('[Drive Auth] Live connectivity probe error:', probeErr);
        }
      }

      const persistenceMethod = session.persistedInFirestore
        ? 'firestore_encrypted'
        : fs.existsSync(SECURE_CREDENTIALS_FILE)
        ? 'local_file'
        : envRefreshToken
        ? 'environment'
        : 'in_memory';

      return res.json({
        connected: isActuallyConnected,
        status: isActuallyConnected ? 'active' : 'expired',
        accountEmail: session.accountEmail,
        accountName: session.accountName,
        accountPhoto: session.accountPhoto,
        expiresAt: session.expiresAt,
        folderId: session.folderId,
        folderName: session.folderName,
        folderUrl: session.folderUrl,
        hasRefreshToken: Boolean(session.refreshToken),
        oauthConfigured,
        redirectUri,
        persistedInFirestore: Boolean(session.persistedInFirestore),
        persistenceMethod,
        encryptionKeyConfigured: Boolean(process.env.DRIVE_TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET),
        firebaseAdminPrivileged: hasPrivilegedServiceAccount,
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
      let session = await getDurableDriveSession();

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
          await saveDurableDriveSession(session);
        } else if (session.expiresAt < now) {
          session.status = 'expired';
          await saveDurableDriveSession(session);
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

      const existing = await getDurableDriveSession();
      const updatedSession: SecureDriveSessionRecord = {
        refreshToken: tokenData.refresh_token || existing?.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
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

      await saveDurableDriveSession(updatedSession);
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

      const existing = await getDurableDriveSession();
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

      await saveDurableDriveSession(newSession);
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
      const disconnectedSession: SecureDriveSessionRecord = {
        status: 'disconnected',
        expiresAt: 0,
        accountEmail: '',
        folderId: '',
        folderName: '',
        folderUrl: '',
        updatedAt: new Date().toISOString()
      };
      await saveDurableDriveSession(disconnectedSession);
      console.log('[Drive Auth] Drive session disconnected and backend credentials wiped.');
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
      const session = await getDurableDriveSession();
      if (!session) {
        return res.status(404).json({ error: 'No stored session found to test' });
      }

      const initialExpiresAt = session.expiresAt;
      // Force expiration
      session.expiresAt = Date.now() - 1000;
      session.status = 'expired';
      await saveDurableDriveSession(session);

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
      await saveDurableDriveSession(session);

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

  function getRequesterAdminIdentity(req: express.Request): { isAdmin: boolean; role?: string; email?: string } {
    // 1. Check Super Admin session cookie
    const cookieToken = req.cookies && req.cookies[SUPER_ADMIN_COOKIE_NAME];
    if (cookieToken) {
      const verified = verifySuperAdminSessionToken(cookieToken);
      if (verified && verified.role === 'super_admin') {
        return { isAdmin: true, role: 'super_admin', email: verified.email };
      }
    }

    // 2. Check Authorization Bearer header for HMAC admin session token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const bearer = authHeader.split('Bearer ')[1]?.trim();
      if (bearer) {
        const sessionVerified = verifySuperAdminSessionToken(bearer);
        if (sessionVerified && sessionVerified.role === 'super_admin') {
          return { isAdmin: true, role: 'super_admin', email: sessionVerified.email };
        }
      }
    }

    // 3. Check x-admin-role header, query parameters, or cookies
    const queryRole = typeof req.query.adminRole === 'string'
      ? req.query.adminRole
      : (typeof req.query.role === 'string' ? req.query.role : '');
    const isExplicitAdminQuery = req.query.admin === 'true' || req.query.isAdmin === 'true';
    const cookieRole = (req.cookies && (req.cookies['nmo_user_role'] || req.cookies['admin_role'] || req.cookies['user_role'])) || '';
    const adminRoleHeader = String(
      req.headers['x-admin-role'] ||
      req.headers['X-Admin-Role'] ||
      queryRole ||
      cookieRole ||
      (isExplicitAdminQuery ? 'super_admin' : '')
    ).trim().toLowerCase();

    const queryEmail = typeof req.query.adminEmail === 'string' ? req.query.adminEmail : (typeof req.query.email === 'string' ? req.query.email : '');
    const cookieEmail = (req.cookies && (req.cookies['nmo_user_email'] || req.cookies['admin_email'])) || '';
    const adminEmailHeader = req.headers['x-admin-email'] || req.headers['X-Admin-Email'] || queryEmail || cookieEmail;
    const cleanEmail = typeof adminEmailHeader === 'string' ? adminEmailHeader.trim().toLowerCase() : undefined;

    if (adminRoleHeader === 'super_admin' || adminRoleHeader === 'state_admin' || adminRoleHeader === 'prant_admin' || adminRoleHeader === 'city_admin' || adminRoleHeader === 'admin') {
      return { isAdmin: true, role: adminRoleHeader === 'admin' ? 'super_admin' : adminRoleHeader, email: cleanEmail };
    }

    return { isAdmin: false };
  }

  function createCertificateAccessToken(fileId: string, membershipNumber: string): string {
    const payload = `${fileId}:${membershipNumber.toUpperCase().trim()}`;
    return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  }

  function verifyCertificateAccessToken(fileId: string, membershipNumber: string, token: string): boolean {
    try {
      if (!fileId || !membershipNumber || !token) return false;
      const expected = createCertificateAccessToken(fileId, membershipNumber);
      return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  function getRequesterMemberId(req: express.Request): string | null {
    // 1. Check query parameters: memberId, membershipNumber, m, userMemberId
    const queryMem = req.query?.memberId || req.query?.membershipNumber || req.query?.m || req.query?.userMemberId;
    if (queryMem && typeof queryMem === 'string') {
      const clean = queryMem.trim().toUpperCase();
      if (clean) return clean;
    }

    // 2. Check header x-member-id
    const headerMem = req.headers['x-member-id'] || req.headers['X-Member-Id'];
    if (headerMem && typeof headerMem === 'string') {
      const clean = headerMem.trim().toUpperCase();
      if (clean) return clean;
    }

    // 3. Check cookies: nmo_member_id, user_member_id, nmo_user_membership
    if (req.cookies) {
      const cookieMem = req.cookies['nmo_member_id'] || req.cookies['user_member_id'] || req.cookies['nmo_user_membership'];
      if (cookieMem) {
        const clean = String(cookieMem).trim().toUpperCase();
        if (clean) return clean;
      }
    }

    return null;
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
    let session = await getDurableDriveSession();
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
    // Return existing token if valid for at least 2 minutes
    if (session.accessToken && session.expiresAt > now + 2 * 60 * 1000) {
      return session.accessToken;
    }

    // Auto-refresh access token if refresh token is present, using tokenRefreshPromise mutex
    if (session.refreshToken) {
      if (tokenRefreshPromise) {
        const refreshedToken = await tokenRefreshPromise;
        if (refreshedToken) return refreshedToken;
      }

      tokenRefreshPromise = (async () => {
        try {
          const refreshed = await refreshAccessTokenWithGoogle(session!.refreshToken!);
          if (refreshed) {
            session!.accessToken = refreshed.accessToken;
            session!.expiresAt = Date.now() + refreshed.expiresIn * 1000;
            session!.lastRefreshedAt = new Date().toISOString();
            session!.status = 'active';
            await saveDurableDriveSession(session!);
            return session!.accessToken;
          } else {
            if (session!.expiresAt < Date.now()) {
              session!.status = 'expired';
              await saveDurableDriveSession(session!);
            }
            return session!.accessToken || null;
          }
        } finally {
          tokenRefreshPromise = null;
        }
      })();

      return await tokenRefreshPromise;
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
    let rootFiles: any[] = rootData.files || [];

    // Fallback: If not found by name query, check session.folderId directly
    if (rootFiles.length === 0) {
      const session = await getDurableDriveSession();
      const targetFolderId = session?.folderId || '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2';
      if (targetFolderId) {
        try {
          const directResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(targetFolderId)}?fields=id,name,webViewLink,parents,trashed`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (directResp.ok) {
            const directData = await directResp.json();
            if (!directData.trashed) {
              rootFiles = [directData];
            }
          }
        } catch (e) {
          console.warn('[Drive Hierarchy] Direct root lookup notice:', e);
        }
      }
    }

    if (rootFiles.length === 0) {
      return {
        success: false,
        error: 'Root folder "NMO Gujarat" was not found in your connected Google Drive account. Please verify that a folder named "NMO Gujarat" exists.',
        code: 'ROOT_FOLDER_NOT_FOUND'
      };
    }

    let rootFolder = rootFiles[0];
    if (rootFiles.length > 1) {
      const session = await getDurableDriveSession();
      const matched = rootFiles.find((f) => f.id === session?.folderId);
      if (matched) {
        rootFolder = matched;
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

    // If "Events" subfolder does not yet exist inside "NMO Gujarat", auto-create it now
    if (eventsFiles.length === 0) {
      try {
        console.log(`[Drive Hierarchy] "Events" subfolder not found under "${rootFolder.name}" (${rootFolder.id}). Automatically creating "Events" subfolder...`);
        const createEventsResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Events',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [rootFolder.id],
            description: 'NMO Gujarat Event Certificates Repository'
          })
        });
        if (createEventsResp.ok) {
          const newEventsFolder = await createEventsResp.json();
          eventsFiles.push(newEventsFolder);
          console.log(`[Drive Hierarchy] Successfully created "Events" subfolder with ID: ${newEventsFolder.id}`);
        } else {
          const errBody = await createEventsResp.text().catch(() => '');
          console.warn('[Drive Hierarchy] Could not auto-create "Events" subfolder:', createEventsResp.status, errBody);
        }
      } catch (err) {
        console.warn('[Drive Hierarchy] Notice during auto-creation of "Events" folder:', err);
      }
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

    const eventsFolder = eventsFiles[0] || rootFolder;
    return {
      success: true,
      rootFolder: { id: rootFolder.id, name: rootFolder.name, webViewLink: rootFolder.webViewLink },
      eventsFolder: { id: eventsFolder.id, name: eventsFolder.name, webViewLink: eventsFolder.webViewLink }
    };
  }

  // =========================================================================
  // Google Drive Filename Exact Matching & Membership Isolation Helpers
  // =========================================================================

  function getBaseFilename(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') return '';
    const clean = fileName.trim();
    const lastDot = clean.lastIndexOf('.');
    return lastDot > 0 ? clean.substring(0, lastDot) : clean;
  }

  function isFilenameMatchingMembershipId(
    fileName: string,
    membershipId: string,
    fileProperties?: Record<string, any>
  ): boolean {
    const targetId = String(membershipId || '').trim().toUpperCase();
    if (!targetId) return false;

    // Check file property if available
    if (fileProperties?.membershipNumber) {
      const propId = String(fileProperties.membershipNumber).trim().toUpperCase();
      if (propId === targetId) return true;
    }
    if (fileProperties?.membershipId) {
      const propId = String(fileProperties.membershipId).trim().toUpperCase();
      if (propId === targetId) return true;
    }

    let base = getBaseFilename(fileName).trim().toUpperCase();
    if (base.startsWith('PENDING_')) {
      base = base.replace(/^PENDING_/, '');
    }

    if (base === targetId) return true;

    // Delimited prefix, suffix, and token formats (e.g. 9521_EVT, EVT_9521, 9521-EVT, 9521 (1))
    // Strict requirement: "9521" must match "9521.pdf", "9521_CME.pdf", "EVT_9521.pdf"
    // but NEVER match "95210.pdf" or "19521.pdf"
    const escaped = targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tokenRegex = new RegExp(`(?:^|[_\\s\\-(])${escaped}(?:[_\\s\\-().]|$)`, 'i');
    return tokenRegex.test(base);
  }

  /**
   * Extracts a membership ID from a filename by matching against known membership IDs
   * or detecting valid numeric / NMO- format prefixes with supported delimiters.
   * - Supports IDs of any length (including short numeric IDs like "9521").
   * - Preserves leading zeros (e.g. "001").
   * - Requires a valid delimiter ('_', '-', space, or '(') or an exact match.
   * - Prevents partial matches (e.g. "9521" does NOT match "95210_EVT-1.jpg").
   * - Preserves "NMO-" format support.
   */
  function extractMembershipIdFromFilename(
    fileName: string,
    knownMembershipIds?: Set<string> | Map<string, any> | string[],
    fileProperties?: Record<string, any>
  ): string | null {
    if (fileProperties?.membershipNumber) {
      const propId = String(fileProperties.membershipNumber).trim().toUpperCase();
      if (propId) return propId;
    }
    if (fileProperties?.membershipId) {
      const propId = String(fileProperties.membershipId).trim().toUpperCase();
      if (propId) return propId;
    }

    if (!fileName || typeof fileName !== 'string') return null;
    let base = getBaseFilename(fileName).trim().toUpperCase();
    if (base.startsWith('PENDING_')) {
      base = base.replace(/^PENDING_/, '').trim();
    }
    if (!base) return null;

    if (knownMembershipIds) {
      const hasId = (id: string) => {
        if (knownMembershipIds instanceof Set || knownMembershipIds instanceof Map) {
          return knownMembershipIds.has(id);
        }
        return (knownMembershipIds as string[]).includes(id);
      };

      // 1a. Exact match
      if (hasId(base)) {
        return base;
      }

      // 1b. Check if base matches any candidate prefix before delimiter
      // Delimiters: '_', '-', ' ', '('
      const delimMatch = base.match(/^(NMO-[A-Z0-9-]+|\d+)(?:[_ \-(]|$)/i);
      if (delimMatch && delimMatch[1]) {
        const candidate = delimMatch[1].toUpperCase();
        if (hasId(candidate)) {
          return candidate;
        }
      }

      // Check candidate suffix: e.g. EVENT_9521
      const suffixMatch = base.match(/(?:^|[_ \-(])(NMO-[A-Z0-9-]+|\d+)$/i);
      if (suffixMatch && suffixMatch[1]) {
        const candidate = suffixMatch[1].toUpperCase();
        if (hasId(candidate)) {
          return candidate;
        }
      }

      // 1c. Scan known IDs sorted longest first
      const idList = knownMembershipIds instanceof Set || knownMembershipIds instanceof Map
        ? Array.from(knownMembershipIds.keys())
        : (knownMembershipIds as string[]);

      const sorted = [...idList].sort((a, b) => b.length - a.length);
      for (const rawId of sorted) {
        const id = String(rawId).trim().toUpperCase();
        if (!id) continue;
        if (isFilenameMatchingMembershipId(base, id)) {
          return id;
        }
      }
    }

    // Pattern-based fallback when knownMembershipIds not provided
    const match = base.match(/^(NMO-[A-Z0-9-]+|\d+)(?:[_ \-(]|$)/i);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
    const suffix = base.match(/(?:^|[_ \-(])(NMO-[A-Z0-9-]+|\d+)$/i);
    if (suffix && suffix[1]) {
      return suffix[1].toUpperCase();
    }

    return null;
  }

  // Set of tombstoned Drive file IDs (in-memory cache for fast lookup during requests)
  const tombstonedDriveFileIds = new Set<string>();

  async function isDriveFileTombstoned(driveFileId: string): Promise<boolean> {
    if (!driveFileId) return false;
    if (tombstonedDriveFileIds.has(driveFileId)) return true;
    const adminDb = getAdminFirestore();
    if (adminDb) {
      try {
        const snap = await adminDb.collection('CertificateTombstones').doc(driveFileId).get();
        if (snap.exists) {
          tombstonedDriveFileIds.add(driveFileId);
          return true;
        }
      } catch (e) {
        console.warn('[Tombstone Check] Notice checking tombstone:', e);
      }
    }
    return false;
  }

  async function recordCertificateTombstone(tombstone: {
    driveFileId: string;
    certId?: string;
    membershipNumber?: string;
    eventId?: string;
    uploadSource?: string;
    deletedByAdminUid?: string;
    deletedByAdminName?: string;
  }): Promise<void> {
    tombstonedDriveFileIds.add(tombstone.driveFileId);
    const adminDb = getAdminFirestore();
    if (adminDb) {
      try {
        await adminDb.collection('CertificateTombstones').doc(tombstone.driveFileId).set({
          ...tombstone,
          deletedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        console.warn('[Tombstone Write] Notice writing tombstone:', e);
      }
    }
  }

  // Cache for known membership IDs loaded from Firestore Users collection (5-minute TTL)
  let usersMembershipIdsCache: Set<string> | null = null;
  let usersMembershipIdsCacheExpiresAt = 0;

  async function getKnownMembershipIdsFromUsers(): Promise<Set<string>> {
    if (usersMembershipIdsCache && Date.now() < usersMembershipIdsCacheExpiresAt) {
      return usersMembershipIdsCache;
    }
    const adminDb = getAdminFirestore();
    const idSet = new Set<string>();
    if (adminDb) {
      try {
        const snap = await adminDb.collection('Users').get();
        snap.docs.forEach((d) => {
          const docId = d.id.trim().toUpperCase();
          if (docId) idSet.add(docId);
          const data = d.data();
          if (data?.membershipNumber) {
            idSet.add(String(data.membershipNumber).trim().toUpperCase());
          }
        });
        usersMembershipIdsCache = idSet;
        usersMembershipIdsCacheExpiresAt = Date.now() + 5 * 60 * 1000;
      } catch (e) {
        console.warn('[Users ID Lookup] Notice querying Users collection:', e);
      }
    }
    return idSet;
  }

  // Pre-load tombstoned certificate IDs on startup
  setTimeout(async () => {
    const adminDb = getAdminFirestore();
    if (adminDb) {
      try {
        const snap = await adminDb.collection('CertificateTombstones').get();
        snap.docs.forEach((d) => {
          tombstonedDriveFileIds.add(d.id);
          const data = d.data();
          if (data?.driveFileId) tombstonedDriveFileIds.add(data.driveFileId);
        });
        if (tombstonedDriveFileIds.size > 0) {
          console.log(`[Tombstones] Loaded ${tombstonedDriveFileIds.size} tombstoned certificate IDs.`);
        }
      } catch (e) {
        console.warn('[Tombstones] Notice loading tombstones on startup:', e);
      }
    }
  }, 1000);

  // In-memory cache for dynamically discovered event folders (5-minute TTL)
  interface DiscoveredEventFoldersCache {
    rootFolder?: { id: string; name: string; webViewLink?: string };
    eventsFolder?: { id: string; name: string; webViewLink?: string };
    folders: Array<{ id: string; name: string; webViewLink?: string; createdTime?: string; eventId?: string }>;
    cachedAt: number;
    expiresAt: number;
  }

  let discoveredFoldersCache: DiscoveredEventFoldersCache | null = null;
  const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;

  function invalidateDiscoveredFoldersCache() {
    discoveredFoldersCache = null;
  }

  async function isChildOfEventsFolder(
    token: string,
    folderId: string,
    eventsFolderId: string
  ): Promise<boolean> {
    if (!folderId || !eventsFolderId) return false;
    if (folderId === eventsFolderId) return false;

    try {
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,parents,trashed`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!resp.ok) return false;
      const data = await resp.json();
      if (data.trashed) return false;
      return Array.isArray(data.parents) && data.parents.includes(eventsFolderId);
    } catch {
      return false;
    }
  }

  async function resolveEventFolder(token: string, eventId: string, eventTitle?: string, knownDriveFolderId?: string) {
    const hierarchy = await resolveDriveHierarchy(token);
    if (!hierarchy.success || !hierarchy.eventsFolder) {
      return hierarchy;
    }

    const eventsFolderId = hierarchy.eventsFolder.id;
    let folders: any[] = [];
    let pageToken: string | undefined = undefined;

    // Paginate through all child folders inside "Events"
    do {
      const query = `'${eventsFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,webViewLink,createdTime,properties)&pageSize=100&orderBy=name`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Failed to list folders inside "Events": ${errText}`);
      }
      const data = await resp.json();
      if (data.files && Array.isArray(data.files)) {
        folders.push(...data.files);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

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

    // Priority 3: Exact ID match or property match
    if (cleanId) {
      const exactIdMatches = folders.filter(
        (f) =>
          (f.name || '').trim().toLowerCase() === cleanId ||
          f.properties?.eventId?.toLowerCase() === cleanId
      );
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
   * GET /api/drive/event-folders
   * Dynamically discovers all event folders inside "NMO Gujarat → Events"
   * with full pagination (nextPageToken) and server-side memory caching.
   * Query params:
   *   - refresh=true: bypasses cache and re-queries live Google Drive
   */
  app.get('/api/drive/event-folders', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';

      // Check server cache if valid
      if (!forceRefresh && discoveredFoldersCache && discoveredFoldersCache.expiresAt > Date.now()) {
        return res.json({
          success: true,
          fromCache: true,
          rootFolder: discoveredFoldersCache.rootFolder,
          eventsFolder: discoveredFoldersCache.eventsFolder,
          count: discoveredFoldersCache.folders.length,
          folders: discoveredFoldersCache.folders
        });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({
          success: false,
          error: 'Google Drive is disconnected on server.',
          code: 'DRIVE_DISCONNECTED',
          folders: []
        });
      }

      const hierarchy = await resolveDriveHierarchy(token);
      if (!hierarchy.success || !hierarchy.eventsFolder) {
        return res.status(hierarchy.code === 'EVENTS_FOLDER_NOT_FOUND' ? 404 : 400).json({
          success: false,
          error: hierarchy.error || 'Failed to resolve "Events" folder inside "NMO Gujarat".',
          code: hierarchy.code || 'EVENTS_FOLDER_NOT_FOUND',
          folders: []
        });
      }

      const eventsFolderId = hierarchy.eventsFolder.id;
      let allFolders: any[] = [];
      let pageToken: string | undefined = undefined;

      do {
        let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `'${eventsFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        )}&fields=nextPageToken,files(id,name,webViewLink,createdTime,properties)&pageSize=100&orderBy=name`;
        if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

        const driveRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!driveRes.ok) {
          const errText = await driveRes.text().catch(() => '');
          console.error('[Drive Event Folders] Drive query error:', driveRes.status, errText);
          return res.status(driveRes.status).json({
            success: false,
            error: 'Failed to discover event folders from Google Drive API',
            details: errText,
            folders: []
          });
        }

        const data = await driveRes.json();
        if (data.files && Array.isArray(data.files)) {
          allFolders.push(...data.files);
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      const processedFolders = allFolders.map((f: any) => ({
        id: f.id,
        name: f.name,
        webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
        createdTime: f.createdTime,
        eventId: f.properties?.eventId
      }));

      // Cache result
      discoveredFoldersCache = {
        rootFolder: hierarchy.rootFolder,
        eventsFolder: hierarchy.eventsFolder,
        folders: processedFolders,
        cachedAt: Date.now(),
        expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS
      };

      console.log(`[Drive Event Folders] Discovered ${processedFolders.length} event folders inside "Events"`);
      return res.json({
        success: true,
        fromCache: false,
        rootFolder: hierarchy.rootFolder,
        eventsFolder: hierarchy.eventsFolder,
        count: processedFolders.length,
        folders: processedFolders
      });
    } catch (err: any) {
      console.error('[Drive Event Folders] Error discovering event folders:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Error discovering event folders',
        folders: []
      });
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
   * Lists all files directly inside the designated event folder with full pagination (nextPageToken).
   * Strictly matches filenames against membership IDs (preserving leading zeros, no loose substrings).
   * Identifies ambiguous duplicates if multiple files match the same membership ID in this folder.
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

      let allRawFiles: any[] = [];
      let pageToken: string | undefined = undefined;

      do {
        const query = `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
        const fields = 'nextPageToken,files(id,name,mimeType,size,createdTime,webViewLink,webContentLink,thumbnailLink,description,properties,parents)';
        let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=100`;
        if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          return res.status(resp.status).json({ error: 'Drive query failed', details: errText });
        }

        const data = await resp.json();
        if (data.files && Array.isArray(data.files)) {
          allRawFiles.push(...data.files);
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      // Filter out tombstoned deleted certificates so they cannot reappear
      const activeRawFiles = allRawFiles.filter((f) => !tombstonedDriveFileIds.has(f.id));

      // Retrieve known membership IDs from Users collection for strict matching
      const knownUsers = await getKnownMembershipIdsFromUsers();

      // Group files by exact membership ID (extracting ID from filename or properties, preserving leading zeros)
      const memberMap: { [key: string]: any[] } = {};
      activeRawFiles.forEach((f) => {
        const propMem = f.properties?.membershipNumber || f.properties?.membershipId;
        const extracted = extractMembershipIdFromFilename(f.name || '', knownUsers, f.properties);
        const cleanNo = String(propMem || extracted || getBaseFilename(f.name || '')).trim().toUpperCase();
        if (!memberMap[cleanNo]) memberMap[cleanNo] = [];
        memberMap[cleanNo].push(f);
      });

      const processedFiles = activeRawFiles.map((f) => {
        const propMem = f.properties?.membershipNumber || f.properties?.membershipId;
        const extracted = extractMembershipIdFromFilename(f.name || '', knownUsers, f.properties);
        const cleanNo = String(propMem || extracted || getBaseFilename(f.name || '')).trim().toUpperCase();
        const matches = memberMap[cleanNo] || [];
        const matchesCount = matches.length;

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
   * Lists subfolders inside a given parent folder.
   * If parentId is omitted, dynamically discovers and defaults to "NMO Gujarat → Events" subfolder.
   * Paginates through all results with nextPageToken.
   */
  app.get('/api/drive/subfolders', async (req, res) => {
    try {
      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive is disconnected.', folders: [] });
      }

      let parentId = req.query.parentId as string | undefined;
      if (!parentId || parentId === '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2') {
        const hierarchy = await resolveDriveHierarchy(token);
        if (hierarchy.success && hierarchy.eventsFolder) {
          parentId = hierarchy.eventsFolder.id;
        } else {
          parentId = hierarchy.rootFolder?.id || '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2';
        }
      }

      let allFolders: any[] = [];
      let pageToken: string | undefined = undefined;

      do {
        let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        )}&fields=nextPageToken,files(id,name,webViewLink,createdTime,properties)&pageSize=100&orderBy=name`;
        if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

        const driveRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!driveRes.ok) {
          const errText = await driveRes.text().catch(() => '');
          return res.status(driveRes.status).json({ error: 'Failed to list subfolders', details: errText, folders: [] });
        }

        const data = await driveRes.json();
        if (data.files && Array.isArray(data.files)) {
          allFolders.push(...data.files);
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      return res.json({
        success: true,
        parentId,
        count: allFolders.length,
        folders: allFolders.map((f: any) => ({
          id: f.id,
          name: f.name,
          webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
          createdTime: f.createdTime,
          eventId: f.properties?.eventId
        }))
      });
    } catch (err: any) {
      console.error('[Drive Subfolders] Error listing subfolders:', err);
      return res.status(500).json({ error: err.message || 'Error listing subfolders', folders: [] });
    }
  });

  // =========================================================================
  // Automatic Event Drive Folder Creation & Deduplication Logic
  // =========================================================================

  async function verifyAdminAuthorization(req: express.Request): Promise<{
    authorized: boolean;
    role?: string;
    email?: string;
    name?: string;
    error?: string;
  }> {
    // 1. Check Super Admin session cookie
    const cookieToken = req.cookies && req.cookies[SUPER_ADMIN_COOKIE_NAME];
    if (cookieToken) {
      const session = verifySuperAdminSessionToken(cookieToken);
      if (session) {
        return { authorized: true, role: session.role, email: session.email, name: session.name };
      }
    }

    // 2. Check Authorization Header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1]?.trim();
      if (token) {
        // 2a. Check if it's our HMAC signed Super Admin session token
        const session = verifySuperAdminSessionToken(token);
        if (session) {
          return { authorized: true, role: session.role, email: session.email, name: session.name };
        }

        // 2b. Check if it's a Firebase ID token
        try {
          const decoded = await getAdminAuth().verifyIdToken(token);
          const email = (decoded.email || '').toLowerCase().trim();
          const role = (decoded as any).role || (decoded as any).adminRole;
          const isAuthorizedEmail = AUTHORIZED_SUPER_ADMIN_EMAILS.includes(email);
          const isAdminRole = ['super_admin', 'state_admin', 'prant_admin', 'city_admin'].includes(role);
          if (isAuthorizedEmail || isAdminRole) {
            return {
              authorized: true,
              role: role || 'super_admin',
              email,
              name: decoded.name || email
            };
          }
        } catch {
          // Token verification error
        }
      }
    }

    // 3. Fallback for client requests where admin session is asserted via headers/body
    const clientRole = req.body?.adminRole || req.headers['x-admin-role'];
    const clientEmail = (req.body?.adminEmail || req.headers['x-admin-email'] || '').toString().toLowerCase().trim();
    if (
      clientRole &&
      ['super_admin', 'state_admin', 'prant_admin', 'city_admin'].includes(String(clientRole))
    ) {
      return {
        authorized: true,
        role: String(clientRole),
        email: clientEmail || 'admin@nmogujarat.org',
        name: (req.body?.adminName || 'Admin').toString()
      };
    }

    return {
      authorized: false,
      error: 'Unauthorized: Administrator privileges are required to create or modify event folders.'
    };
  }

  const ROOT_DRIVE_FOLDER_ID = '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2';

  /**
   * Resolves or creates the "pending" root folder directly under "NMO GUJARAT/" (1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2).
   */
  async function getOrCreatePendingRootFolder(token: string): Promise<{ id: string; name: string; webViewLink?: string }> {
    const query = `'${ROOT_DRIVE_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = 'pending' and trashed = false`;
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data.files && data.files.length > 0) {
        return data.files[0];
      }
    }

    console.log(`[Drive Folder Structure] Creating "pending" folder under root ${ROOT_DRIVE_FOLDER_ID}...`);
    const createResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'pending',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [ROOT_DRIVE_FOLDER_ID],
        description: 'NMO Gujarat Pending Member Submissions Root'
      })
    });
    if (!createResp.ok) {
      const err = await createResp.text().catch(() => '');
      throw new Error(`Failed to create pending root folder in Google Drive: ${err}`);
    }
    return await createResp.json();
  }

  /**
   * Ensures both folders exist for an event in Google Drive:
   * 1. Approved event folder: "NMO GUJARAT/{Exact Event Name}" (or under "Events/{Exact Event Name}")
   * 2. Pending event folder: "NMO GUJARAT/pending/{Exact Event Name}"
   * Idempotent: checks before creating and never duplicates.
   */
  async function ensureEventDriveFolders(
    token: string,
    eventTitle: string,
    eventId?: string,
    knownFolderId?: string
  ): Promise<{
    success: boolean;
    approvedFolder: { id: string; name: string; webViewLink?: string; createdTime?: string };
    pendingFolder: { id: string; name: string; webViewLink?: string; createdTime?: string };
    alreadyExisted?: boolean;
    error?: string;
    code?: string;
  }> {
    const cleanTitle = (eventTitle || '').trim();
    const cleanId = (eventId || '').trim();
    if (!cleanTitle) {
      return {
        success: false,
        error: 'Event title is required to create a Google Drive folder',
        code: 'INVALID_TITLE',
        approvedFolder: {} as any,
        pendingFolder: {} as any
      };
    }

    // 1. Resolve or create Approved Event Folder
    let approvedFolder: { id: string; name: string; webViewLink?: string; createdTime?: string } | null = null;
    let approvedAlreadyExisted = false;

    // Check if knownFolderId was provided and valid
    if (knownFolderId) {
      try {
        const kResp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(knownFolderId)}?fields=id,name,webViewLink,createdTime,trashed`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (kResp.ok) {
          const kData = await kResp.json();
          if (!kData.trashed) {
            approvedFolder = kData;
            approvedAlreadyExisted = true;
          }
        }
      } catch {}
    }

    if (!approvedFolder) {
      // Check for existing folder matching cleanTitle (case-insensitive) under root or Events subfolder
      const hierarchy = await resolveDriveHierarchy(token).catch(() => null);
      const searchParentIds = [ROOT_DRIVE_FOLDER_ID];
      if (hierarchy?.success && hierarchy?.eventsFolder?.id && hierarchy.eventsFolder.id !== ROOT_DRIVE_FOLDER_ID) {
        searchParentIds.push(hierarchy.eventsFolder.id);
      }

      for (const parentId of searchParentIds) {
        const query = `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const qResp = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,createdTime,properties)&pageSize=100`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (qResp.ok) {
          const qData = await qResp.json();
          const list: any[] = qData.files || [];
          const matched = list.find(
            (f) =>
              (f.name || '').trim().toLowerCase() === cleanTitle.toLowerCase() ||
              (cleanId && f.properties?.eventId === cleanId)
          );
          if (matched) {
            approvedFolder = matched;
            approvedAlreadyExisted = true;
            break;
          }
        }
      }
    }

    // If still not found, create approved folder under ROOT_DRIVE_FOLDER_ID (or events folder)
    if (!approvedFolder) {
      const hierarchy = await resolveDriveHierarchy(token).catch(() => null);
      const targetApprovedParent = hierarchy?.success && hierarchy?.eventsFolder?.id ? hierarchy.eventsFolder.id : ROOT_DRIVE_FOLDER_ID;
      console.log(`[Drive Event Folders] Creating approved folder "${cleanTitle}" under ${targetApprovedParent}...`);
      const createResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink,createdTime', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanTitle,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [targetApprovedParent],
          description: `NMO Gujarat Approved Certificates Folder for "${cleanTitle}"`,
          properties: { eventId: cleanId || '', eventTitle: cleanTitle }
        })
      });
      if (!createResp.ok) {
        const err = await createResp.text().catch(() => '');
        return {
          success: false,
          error: `Failed to create approved event folder: ${err}`,
          code: 'APPROVED_FOLDER_CREATION_FAILED',
          approvedFolder: {} as any,
          pendingFolder: {} as any
        };
      }
      approvedFolder = await createResp.json();
    }

    // 2. Resolve or create Pending Event Folder inside "NMO GUJARAT/pending/{Exact Event Name}"
    const pendingRoot = await getOrCreatePendingRootFolder(token);
    let pendingFolder: { id: string; name: string; webViewLink?: string; createdTime?: string } | null = null;

    const pendingQuery = `'${pendingRoot.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const pResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pendingQuery)}&fields=files(id,name,webViewLink,createdTime,properties)&pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (pResp.ok) {
      const pData = await pResp.json();
      const pList: any[] = pData.files || [];
      const pMatched = pList.find(
        (f) =>
          (f.name || '').trim().toLowerCase() === cleanTitle.toLowerCase() ||
          (cleanId && f.properties?.eventId === cleanId)
      );
      if (pMatched) {
        pendingFolder = pMatched;
      }
    }

    if (!pendingFolder) {
      console.log(`[Drive Event Folders] Creating pending folder "${cleanTitle}" under pending root ${pendingRoot.id}...`);
      const createPendingResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink,createdTime', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanTitle,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [pendingRoot.id],
          description: `NMO Gujarat Pending Certificates Folder for "${cleanTitle}"`,
          properties: { eventId: cleanId || '', eventTitle: cleanTitle, isPendingFolder: 'true' }
        })
      });
      if (!createPendingResp.ok) {
        const err = await createPendingResp.text().catch(() => '');
        return {
          success: false,
          error: `Failed to create pending event folder: ${err}`,
          code: 'PENDING_FOLDER_CREATION_FAILED',
          approvedFolder: approvedFolder || ({} as any),
          pendingFolder: {} as any
        };
      }
      pendingFolder = await createPendingResp.json();
    }

    return {
      success: true,
      alreadyExisted: approvedAlreadyExisted,
      approvedFolder: approvedFolder || ({} as any),
      pendingFolder: pendingFolder || ({} as any)
    };
  }

  // Backward compatibility alias for legacy callers
  const createOrReuseEventDriveFolder = async (
    token: string,
    eventId: string,
    eventTitle: string,
    existingFolderId?: string
  ) => {
    const res = await ensureEventDriveFolders(token, eventTitle, eventId, existingFolderId);
    return {
      success: res.success,
      folder: res.approvedFolder,
      pendingFolder: res.pendingFolder,
      alreadyExisted: res.alreadyExisted,
      error: res.error,
      code: res.code
    };
  };

  /**
   * POST /api/drive/events/ensure-folders
   * POST /api/drive/events/create-folder
   * POST /api/events/create-folder
   * Automatically creates or safely reuses BOTH "NMO GUJARAT/{Event}" (approved)
   * and "NMO GUJARAT/pending/{Event}" (pending) folders for an event.
   */
  const handleEventFolderCreation = async (req: express.Request, res: express.Response) => {
    try {
      const authResult = await verifyAdminAuthorization(req);
      if (!authResult.authorized) {
        return res.status(403).json({
          success: false,
          error: authResult.error || 'Unauthorized: Only administrators can create or link event folders.',
          code: 'UNAUTHORIZED'
        });
      }

      const { eventId, title, existingFolderId } = req.body;
      const cleanTitle = (title || req.body.eventTitle || '').trim();
      const cleanId = (eventId || '').trim();

      if (!cleanTitle) {
        return res.status(400).json({
          success: false,
          error: 'Event title is required to create Google Drive folders.',
          code: 'INVALID_TITLE'
        });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({
          success: false,
          error: 'Google Drive is disconnected on server. Please connect Google Drive first.',
          code: 'DRIVE_DISCONNECTED'
        });
      }

      const result = await ensureEventDriveFolders(token, cleanTitle, cleanId, existingFolderId);
      if (!result.success || !result.approvedFolder) {
        return res.status(502).json({
          success: false,
          error: result.error,
          code: result.code,
          eventId: cleanId
        });
      }

      // Safe Firestore database update on backend if privileged Admin SDK is initialized
      let dbUpdated = false;
      if (cleanId) {
        try {
          const adminDb = getAdminFirestore();
          if (adminDb) {
            await adminDb.collection('Events').doc(cleanId).set(
              {
                driveFolderId: result.approvedFolder.id,
                driveFolderName: result.approvedFolder.name,
                driveFolderLink: result.approvedFolder.webViewLink,
                pendingDriveFolderId: result.pendingFolder.id,
                pendingDriveFolderName: result.pendingFolder.name,
                pendingDriveFolderLink: result.pendingFolder.webViewLink,
                driveFolderCreated: true,
                updatedAt: new Date().toISOString()
              },
              { merge: true }
            );
            dbUpdated = true;
            console.log(`[Event Folder] Saved approved folder ${result.approvedFolder.id} and pending folder ${result.pendingFolder.id} to Firestore event ${cleanId}`);
          }
        } catch (dbErr: any) {
          console.warn('[Event Folder] Backend Firestore write notice:', dbErr?.message);
        }
      }

      return res.json({
        success: true,
        alreadyExisted: Boolean(result.alreadyExisted),
        folder: result.approvedFolder,
        approvedFolder: result.approvedFolder,
        pendingFolder: result.pendingFolder,
        eventId: cleanId,
        eventTitle: cleanTitle,
        dbUpdated,
        message: result.alreadyExisted
          ? `Reused existing Google Drive folders for "${cleanTitle}".`
          : `Created dedicated Google Drive folders (Approved and Pending) for "${cleanTitle}".`
      });
    } catch (err: any) {
      console.error('[Event Folder] Exception during event folder creation:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Internal server error during event folder creation',
        code: 'INTERNAL_ERROR'
      });
    }
  };

  app.post('/api/drive/events/ensure-folders', handleEventFolderCreation);
  app.post('/api/drive/events/create-folder', handleEventFolderCreation);
  app.post('/api/events/create-folder', handleEventFolderCreation);

  /**
   * POST /api/drive/events/reconcile-all-folders
   * Privileged endpoint: iterates through all events in Firestore and ensures both
   * approved and pending Google Drive folders exist without creating duplicates.
   */
  app.post('/api/drive/events/reconcile-all-folders', async (req, res) => {
    try {
      const authResult = await verifyAdminAuthorization(req);
      if (!authResult.authorized) {
        return res.status(403).json({ error: 'Unauthorized: Administrator access required.' });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive is disconnected on server.' });
      }

      const adminDb = getAdminFirestore();
      if (!adminDb) {
        return res.status(500).json({ error: 'Firestore Admin is not initialized.' });
      }

      const snap = await adminDb.collection('Events').get();
      let reconciledCount = 0;
      const details: any[] = [];

      for (const d of snap.docs) {
        const evtData = d.data();
        const eventTitle = evtData.title || evtData.name || d.id;
        try {
          const resFolder = await ensureEventDriveFolders(token, eventTitle, d.id, evtData.driveFolderId);
          if (resFolder.success) {
            await adminDb.collection('Events').doc(d.id).set(
              {
                driveFolderId: resFolder.approvedFolder.id,
                driveFolderName: resFolder.approvedFolder.name,
                driveFolderLink: resFolder.approvedFolder.webViewLink,
                pendingDriveFolderId: resFolder.pendingFolder.id,
                pendingDriveFolderName: resFolder.pendingFolder.name,
                pendingDriveFolderLink: resFolder.pendingFolder.webViewLink,
                driveFolderCreated: true,
                updatedAt: new Date().toISOString()
              },
              { merge: true }
            );
            reconciledCount++;
            details.push({
              eventId: d.id,
              eventTitle,
              approvedFolderId: resFolder.approvedFolder.id,
              pendingFolderId: resFolder.pendingFolder.id
            });
          }
        } catch (e: any) {
          console.warn(`[Reconcile Event Folders] Failed for event ${d.id}:`, e.message);
        }
      }

      return res.json({
        success: true,
        reconciledCount,
        totalEvents: snap.docs.length,
        details,
        message: `Successfully reconciled Google Drive folders for ${reconciledCount} events.`
      });
    } catch (err: any) {
      console.error('[Reconcile Folders] Error reconciling all event folders:', err);
      return res.status(500).json({ error: err.message || 'Error reconciling event folders' });
    }
  });

  /**
   * POST /api/drive/events/delete-event
   * Safely deletes an event and optionally cleans up its associated Google Drive folders.
   * Enforces strict safety guardrails: ROOT_DRIVE_FOLDER_ID, pending root, and events root
   * are never deleted or trashed.
   */
  app.post('/api/drive/events/delete-event', async (req, res) => {
    try {
      const authResult = await verifyAdminAuthorization(req);
      if (!authResult.authorized) {
        return res.status(403).json({ error: 'Unauthorized: Administrator access required.' });
      }

      const { eventId, deleteDriveFolders, confirmationTitle } = req.body;
      if (!eventId || typeof eventId !== 'string') {
        return res.status(400).json({ error: 'Event ID is required' });
      }

      const adminDb = getAdminFirestore();
      let eventDocData: any = null;
      if (adminDb) {
        const docSnap = await adminDb.collection('Events').doc(eventId).get();
        if (docSnap.exists) {
          eventDocData = docSnap.data();
        }
      }

      const token = await getValidServerDriveToken();
      const protectedFolderIds = new Set<string>([ROOT_DRIVE_FOLDER_ID]);

      if (token) {
        const hierarchy = await resolveDriveHierarchy(token).catch(() => null);
        if (hierarchy?.eventsFolder?.id) {
          protectedFolderIds.add(hierarchy.eventsFolder.id);
        }
        const pendingRoot = await getOrCreatePendingRootFolder(token).catch(() => null);
        if (pendingRoot?.id) {
          protectedFolderIds.add(pendingRoot.id);
        }
      }

      const approvedFolderId = eventDocData?.driveFolderId || req.body.approvedFolderId;
      const pendingFolderId = eventDocData?.pendingDriveFolderId || req.body.pendingFolderId;
      const eventTitle = eventDocData?.title || confirmationTitle || eventId;

      const deletedFolders: { approved?: string | null; pending?: string | null } = {};
      const errors: string[] = [];

      if (deleteDriveFolders && token) {
        // Guardrail: NEVER delete protected root folders
        if (approvedFolderId) {
          if (protectedFolderIds.has(approvedFolderId)) {
            console.warn(`[Safe Delete] Prevented deletion of protected folder: ${approvedFolderId}`);
            errors.push('Cannot delete protected root/events folder');
          } else {
            try {
              const trashResp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(approvedFolderId)}?fields=id,trashed`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ trashed: true })
              });
              if (trashResp.ok) {
                deletedFolders.approved = approvedFolderId;
              } else {
                const errTxt = await trashResp.text().catch(() => '');
                errors.push(`Approved folder trash failed: ${errTxt}`);
              }
            } catch (e: any) {
              errors.push(`Approved folder error: ${e.message}`);
            }
          }
        }

        if (pendingFolderId) {
          if (protectedFolderIds.has(pendingFolderId)) {
            console.warn(`[Safe Delete] Prevented deletion of protected pending root: ${pendingFolderId}`);
            errors.push('Cannot delete protected pending root folder');
          } else {
            try {
              const trashResp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(pendingFolderId)}?fields=id,trashed`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ trashed: true })
              });
              if (trashResp.ok) {
                deletedFolders.pending = pendingFolderId;
              } else {
                const errTxt = await trashResp.text().catch(() => '');
                errors.push(`Pending folder trash failed: ${errTxt}`);
              }
            } catch (e: any) {
              errors.push(`Pending folder error: ${e.message}`);
            }
          }
        }
      }

      // Delete from Firestore
      if (adminDb) {
        await adminDb.collection('Events').doc(eventId).delete().catch(() => {});
      }

      return res.json({
        success: true,
        eventId,
        eventTitle,
        deletedFolders,
        driveCleanupPerformed: Boolean(deleteDriveFolders),
        errors: errors.length > 0 ? errors : undefined,
        message: `Event "${eventTitle}" deleted successfully.`
      });
    } catch (err: any) {
      console.error('[Delete Event API] Error deleting event:', err);
      return res.status(500).json({ error: err.message || 'Internal server error deleting event' });
    }
  });

  /**
   * POST /api/drive/create-folder
   * Creates a subfolder in Google Drive securely server-side.
   * Defaults to the "Events" folder if parent is not specified or points to root.
   * Checks for duplicate folder names before creating.
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

      // Default to "Events" folder under "NMO Gujarat" if parentId is not specified or points to root
      let targetParent = parentId;
      if (!targetParent || targetParent === '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2') {
        const hierarchy = await resolveDriveHierarchy(token);
        if (hierarchy.success && hierarchy.eventsFolder) {
          targetParent = hierarchy.eventsFolder.id;
        } else {
          targetParent = hierarchy.rootFolder?.id || '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2';
        }
      }

      // Check if folder with same name already exists in target parent
      const cleanFolderName = name.trim();
      const checkQuery = `'${targetParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${cleanFolderName.replace(/'/g, "\\'")}' and trashed = false`;
      const checkRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(checkQuery)}&fields=files(id,name,webViewLink,createdTime)&pageSize=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.files && checkData.files.length > 0) {
          const existing = checkData.files[0];
          return res.json({
            success: true,
            alreadyExisted: true,
            folder: {
              id: existing.id,
              name: existing.name,
              webViewLink: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
              createdTime: existing.createdTime
            }
          });
        }
      }

      const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink,createdTime', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: cleanFolderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [targetParent]
        })
      });
      if (!createRes.ok) {
        const err = await createRes.text().catch(() => '');
        return res.status(createRes.status).json({ error: 'Drive folder creation failed', details: err });
      }
      const folder = await createRes.json();
      return res.json({
        success: true,
        alreadyExisted: false,
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
        const isMemMatch = isFilenameMatchingMembershipId(f.name, cleanNo, f.properties);
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

      // 1. Resolve or verify event folders (Approved and Pending)
      const eventFoldersRes = await ensureEventDriveFolders(token, eventTitle || 'General', eventId);
      let folderId = targetFolderId;
      if (source === 'user') {
        // Member uploads MUST enter the pending folder directly: NMO GUJARAT/pending/{Event}/
        folderId = eventFoldersRes.pendingFolder.id;
        console.log(`[Drive Upload] User upload directed to pending folder "${eventFoldersRes.pendingFolder.name}" (${folderId})`);
      } else {
        // Admin uploads enter approved folder directly: NMO GUJARAT/{Event}/
        if (!folderId || folderId === '1zdA37h9VZqy2YKbWEUGhYlEtGC5sCqW2') {
          folderId = eventFoldersRes.approvedFolder.id;
        }
        console.log(`[Drive Upload] Admin upload directed to approved folder "${eventFoldersRes.approvedFolder.name}" (${folderId})`);
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
          const isMemberMatch = isFilenameMatchingMembershipId(f.name, verifiedMemberNo, f.properties);
          if (!isMemberMatch) return false;

          const fPropEventId = f.properties?.eventId;
          // If the file explicitly records eventId, match it:
          if (fPropEventId && eventId) {
            return fPropEventId === eventId;
          }
          // If filename has the eventId:
          if (cleanEventId && (f.name || '').toUpperCase().includes(cleanEventId.toUpperCase())) {
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
            const existingDriveLink = existingForThisEvent.webViewLink || (existingForThisEvent.id ? `https://drive.google.com/file/d/${existingForThisEvent.id}/view` : '');
            const existingEvtName = existingForThisEvent.properties?.eventTitle || eventTitle || 'General Certificate';
            const existingMemName = existingForThisEvent.properties?.memberName || memberName || 'NMO Member';

            const existingRecord = {
              // 4 mandatory fields
              eventName: existingEvtName,
              membershipName: existingMemName,
              eventId,
              googleDriveLink: existingDriveLink,

              // Core schema
              driveFileId: existingForThisEvent.id,
              membershipId: verifiedMemberNo,
              memberUid: existingForThisEvent.properties?.uploaderUid || uploaderUid || '',
              uploadedAt: existingForThisEvent.createdTime || new Date().toISOString(),
              status: existingForThisEvent.properties?.approvalStatus || approvalStatus,

              // Backward compatibility
              certId: `${eventId}_${verifiedMemberNo}`,
              eventTitle: existingEvtName,
              membershipNumber: verifiedMemberNo,
              memberName: existingMemName,
              uploaderUid: existingForThisEvent.properties?.uploaderUid || uploaderUid || '',
              uploadSource: existingForThisEvent.properties?.uploadSource || source,
              approvalStatus: existingForThisEvent.properties?.approvalStatus || approvalStatus,
              driveFolderId: folderId,
              originalFileName: existingForThisEvent.name,
              mimeType: existingForThisEvent.mimeType || finalMime,
              fileSize: existingForThisEvent.size ? `${(Number(existingForThisEvent.size) / (1024 * 1024)).toFixed(2)} MB` : undefined,
              webViewLink: existingDriveLink,
              proxyViewUrl: `/api/drive/file/${existingForThisEvent.id}`,
              proxyDownloadUrl: `/api/drive/file/${existingForThisEvent.id}?download=true`,
              alreadyExisted: true
            };

            try {
              const adminDb = getAdminFirestore();
              if (adminDb) {
                await Promise.all([
                  adminDb.collection('Certificates').doc(existingRecord.certId).set(existingRecord, { merge: true }),
                  adminDb.collection('certificates').doc(existingRecord.certId).set(existingRecord, { merge: true }),
                  adminDb.collection('Certificates').doc(existingForThisEvent.id).set(existingRecord, { merge: true }),
                  adminDb.collection('certificates').doc(existingForThisEvent.id).set(existingRecord, { merge: true })
                ]);
              }
            } catch (saveErr) {
              console.warn('[Drive Upload] Notice updating existing record in Firestore:', saveErr);
            }

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

      const finalDriveLink = uploadedFile.webViewLink || uploadedFile.webContentLink || `https://drive.google.com/file/d/${uploadedFile.id}/view`;
      const finalEventName = eventTitle || 'General Certificate';
      const finalMemberName = memberName || 'NMO Member';

      const certRecord = {
        // 4 mandatory fields
        eventName: finalEventName,
        membershipName: finalMemberName,
        eventId,
        googleDriveLink: finalDriveLink,

        // Core schema identifiers
        driveFileId: uploadedFile.id,
        membershipId: cleanNo,
        memberUid: uploaderUid || '',
        uploadedAt: new Date().toISOString(),
        status: approvalStatus,

        // Backward compatibility fields
        certId: `${eventId}_${cleanNo}`,
        eventTitle: finalEventName,
        membershipNumber: cleanNo,
        memberName: finalMemberName,
        uploaderUid: uploaderUid || '',
        uploadSource: source,
        approvalStatus,
        driveFolderId: folderId,
        originalFileName: fileName || finalFileName,
        mimeType: finalMime,
        fileSize: `${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`,
        webViewLink: finalDriveLink,
        proxyViewUrl: `/api/drive/file/${uploadedFile.id}`,
        proxyDownloadUrl: `/api/drive/file/${uploadedFile.id}?download=true`
      };

      // Durably record certificate submission in Firestore database
      // CRITICAL REQUIREMENT: "Do not show upload success if the database record fails to save."
      try {
        const adminDb = getAdminFirestore();
        if (adminDb) {
          await Promise.all([
            adminDb.collection('Certificates').doc(`${eventId}_${cleanNo}`).set(certRecord, { merge: true }),
            adminDb.collection('certificates').doc(`${eventId}_${cleanNo}`).set(certRecord, { merge: true }),
            adminDb.collection('Certificates').doc(uploadedFile.id).set(certRecord, { merge: true }),
            adminDb.collection('certificates').doc(uploadedFile.id).set(certRecord, { merge: true })
          ]);
          console.log(`[Drive Upload] Persisted certificate record to Firestore (Certificates & certificates for ${eventId}_${cleanNo} and ${uploadedFile.id})`);
        } else {
          console.warn('[Drive Upload] Warning: Firestore Admin DB not available, cannot save certificate record.');
          return res.status(500).json({
            error: 'database_error',
            message: 'Certificate uploaded to Google Drive but failed to save in Firestore database.'
          });
        }
      } catch (dbErr: any) {
        console.error('[Drive Upload] Fatal: Failed to persist certificate to Firestore:', dbErr);
        return res.status(500).json({
          error: 'database_error',
          message: 'Failed to record certificate submission in database: ' + (dbErr?.message || 'Database write failed')
        });
      }

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

      // Verify Authorization & Ownership:
      const adminIdentity = getRequesterAdminIdentity(req);
      const requesterMemberId = getRequesterMemberId(req);
      const cookieMemberId = requesterMemberId;

      // Non-admin members cannot query another member's certificates
      if (!adminIdentity.isAdmin && requesterMemberId && requesterMemberId !== cleanMemNo) {
        return res.status(403).json({
          error: 'forbidden',
          message: `Access denied: You are authenticated as membership ID ${requesterMemberId} and cannot query certificates for ${cleanMemNo}.`
        });
      }

      // Maintain verified membership session cookie
      if (!adminIdentity.isAdmin && !requesterMemberId) {
        res.cookie('nmo_member_id', cleanMemNo, {
          maxAge: 31536000 * 1000,
          path: '/',
          sameSite: 'lax'
        });
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
        if (tombstonedDriveFileIds.has(f.id)) return false;
        return isFilenameMatchingMembershipId(f.name, cleanMemNo, f.properties);
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

          const certToken = createCertificateAccessToken(f.id, cleanMemNo);
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
            proxyViewUrl: `/api/drive/file/${f.id}?memberId=${encodeURIComponent(cleanMemNo)}&token=${certToken}`,
            proxyDownloadUrl: `/api/drive/file/${f.id}?download=true&memberId=${encodeURIComponent(cleanMemNo)}&token=${certToken}`
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

      // Fetch metadata first to get correct filename, mimeType, and properties
      const metaResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,properties`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!metaResp.ok) {
        return res.status(metaResp.status).send('Certificate file not found in Google Drive');
      }

      const meta = await metaResp.json();

      // Enforce backend authorization & ownership
      const adminIdentity = getRequesterAdminIdentity(req);
      if (!adminIdentity.isAdmin) {
        const requesterMemberId = getRequesterMemberId(req);
        const fileMemNo = (meta.properties?.membershipNumber || meta.properties?.membershipId || '').trim().toUpperCase();
        const queryToken = typeof req.query.token === 'string' ? req.query.token : '';

        const tokenValid = Boolean(
          queryToken && requesterMemberId && verifyCertificateAccessToken(fileId, requesterMemberId, queryToken)
        );

        let isOwner = Boolean(
          requesterMemberId && (
            tokenValid ||
            (fileMemNo && fileMemNo === requesterMemberId) ||
            isFilenameMatchingMembershipId(meta.name, requesterMemberId, meta.properties)
          )
        );

        // Firestore fallback check: verify if document in Certificates collection links this file to member
        if (!isOwner && requesterMemberId) {
          try {
            const adminDb = getAdminFirestore();
            if (adminDb) {
              const [docCap, docLow] = await Promise.all([
                adminDb.collection('Certificates').doc(fileId).get().catch(() => null),
                adminDb.collection('certificates').doc(fileId).get().catch(() => null)
              ]);
              const fsData = docCap?.data() || docLow?.data();
              if (fsData) {
                const fsMem = (fsData.membershipNumber || fsData.membershipId || '').trim().toUpperCase();
                if (fsMem && fsMem === requesterMemberId) {
                  isOwner = true;
                }
              }
            }
          } catch (e) {
            console.warn('[File Proxy Auth] Firestore lookup notice:', e);
          }
        }

        if (!isOwner) {
          const acceptsHtml = req.accepts && req.accepts('html') && !req.xhr && !req.accepts('json');
          if (acceptsHtml) {
            return res.status(403).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Access Restricted — NMO Gujarat Certificate Portal</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d16; color: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
    .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 24px; padding: 40px 32px; max-width: 480px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); }
    .badge { display: inline-block; padding: 6px 14px; background: rgba(239, 68, 68, 0.15); color: #f87171; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 900; color: #ffffff; margin: 0 0 12px; }
    p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 12px 28px; background: #b91c1c; color: #ffffff; text-decoration: none; border-radius: 14px; font-weight: 700; font-size: 14px; transition: background 0.2s; }
    .btn:hover { background: #dc2626; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Security Policy</div>
    <h1>Certificate Access Restricted</h1>
    <p>You can only access official certificates tagged with your verified Membership ID. Please sign in to your Member Dashboard to view and download your certificates.</p>
    <a href="/" class="btn">Return to Member Dashboard</a>
  </div>
</body>
</html>`);
          }

          return res.status(403).json({
            error: 'forbidden',
            message: 'Access denied: You are only authorized to access your own certificates.'
          });
        }

        // Verified owner authenticated. Proceed to stream file content.
      }

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
      res.setHeader('Cache-Control', 'private, max-age=3600');
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
   * Explicit State Committee administrator approval endpoint:
   * 1. Authenticates admin authorization on backend.
   * 2. Moves file from "NMO GUJARAT/pending/{Event}/" to "NMO GUJARAT/{Event}/" via Google Drive API (addParents, removeParents).
   * 3. Preserves original Drive file ID and filename (strips legacy PENDING_ prefix if present, never adds APPROVED_).
   * 4. Verifies approved folder is parent and pending folder is removed before updating Firestore.
   * 5. Updates authoritative Firestore records in both 'Certificates' and 'certificates'.
   */
  app.post('/api/drive/approve-certificate', async (req, res) => {
    try {
      // 1. Authorize Administrator on backend
      const authResult = await verifyAdminAuthorization(req);
      if (!authResult.authorized) {
        return res.status(403).json({
          error: authResult.error || 'Unauthorized: State Committee administrator access required.'
        });
      }

      const { driveFileId, adminUid, adminName, certId, eventId, eventTitle } = req.body;
      if (!driveFileId) {
        return res.status(400).json({ error: 'driveFileId is required' });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive storage is disconnected.' });
      }

      // 2. Fetch current file metadata from Google Drive
      const metaResp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,parents,properties`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!metaResp.ok) {
        const errText = await metaResp.text().catch(() => '');
        return res.status(metaResp.status).json({
          error: 'Certificate file not found in Google Drive',
          details: errText
        });
      }

      const fileMeta = await metaResp.json();
      const currentParents: string[] = fileMeta.parents || [];
      const fileProps = fileMeta.properties || {};

      // 3. Resolve target event's Approved and Pending folders
      const resolvedEventTitle = eventTitle || fileProps.eventTitle || fileProps.eventName || 'General Event';
      const resolvedEventId = eventId || fileProps.eventId || '';

      const foldersRes = await ensureEventDriveFolders(token, resolvedEventTitle, resolvedEventId);
      if (!foldersRes.success || !foldersRes.approvedFolder?.id) {
        return res.status(502).json({
          error: 'Failed to resolve approved Google Drive event folder for move operation.',
          details: foldersRes.error
        });
      }

      const approvedFolderId = foldersRes.approvedFolder.id;
      const pendingFolderId = foldersRes.pendingFolder?.id;

      // 4. Move file from pending to approved folder using Google Drive API
      // If approvedFolderId is not already the parent, update parents
      let cleanFileName: string | undefined;
      if (fileMeta.name && /^PENDING_/i.test(fileMeta.name)) {
        cleanFileName = fileMeta.name.replace(/^PENDING_/i, '');
      }

      const patchBody: Record<string, any> = {
        properties: {
          approvalStatus: 'approved',
          decisionByAdminUid: adminUid || authResult.email || '',
          decisionByAdminName: adminName || authResult.name || 'Administrator',
          decisionAt: new Date().toISOString()
        }
      };
      if (cleanFileName) {
        patchBody.name = cleanFileName;
      }

      const isAlreadyInApproved = currentParents.includes(approvedFolderId);
      if (!isAlreadyInApproved) {
        const removeParents = currentParents.filter((p) => p !== approvedFolderId).join(',');
        let patchUrl = `https://www.googleapis.com/drive/v3/files/${driveFileId}?addParents=${encodeURIComponent(approvedFolderId)}&fields=id,name,parents,properties`;
        if (removeParents) {
          patchUrl += `&removeParents=${encodeURIComponent(removeParents)}`;
        }

        console.log(`[Drive Approve] Moving file ${driveFileId} into approved folder ${approvedFolderId} (removing parents: ${removeParents})...`);
        const patchResp = await fetch(patchUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(patchBody)
        });

        if (!patchResp.ok) {
          const errText = await patchResp.text().catch(() => '');
          console.error('[Drive Approve] Google Drive API move failed:', patchResp.status, errText);
          return res.status(patchResp.status >= 500 ? patchResp.status : 502).json({
            error: 'drive_move_failed',
            message: 'Failed to move certificate file in Google Drive. Submission remains pending so you can safely retry.',
            details: errText
          });
        }

        const patchedData = await patchResp.json();
        const updatedParents: string[] = patchedData.parents || [];

        // 5. Verify that the approved event folder is now the parent
        if (!updatedParents.includes(approvedFolderId)) {
          console.error('[Drive Approve] Verification failed: approved folder is not in parents:', updatedParents);
          return res.status(502).json({
            error: 'drive_move_unverified',
            message: 'Google Drive move completed without error but approved folder was not verified as parent.'
          });
        }
        console.log(`[Drive Approve] Successfully verified file ${driveFileId} is in approved folder ${approvedFolderId}`);
      } else {
        // Just update properties if already in approved folder
        await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(patchBody)
        }).catch(() => {});
      }

      // 6. Only after the move is verified, update the authoritative Firestore record to 'approved'
      const docId = certId || driveFileId;
      const approvalUpdate = {
        approvalStatus: 'approved',
        status: 'approved',
        driveFolderId: approvedFolderId,
        decisionByAdminUid: adminUid || authResult.email || 'admin',
        decisionByAdminName: adminName || authResult.name || 'Administrator',
        decisionAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      try {
        const adminDb = getAdminFirestore();
        if (adminDb) {
          const updates = [
            adminDb.collection('Certificates').doc(docId).set(approvalUpdate, { merge: true }),
            adminDb.collection('certificates').doc(docId).set(approvalUpdate, { merge: true })
          ];
          if (driveFileId !== docId) {
            updates.push(
              adminDb.collection('Certificates').doc(driveFileId).set(approvalUpdate, { merge: true }),
              adminDb.collection('certificates').doc(driveFileId).set(approvalUpdate, { merge: true })
            );
          }
          await Promise.all(updates);
          console.log(`[Drive Approve] Updated Firestore certificate record for ${docId} and ${driveFileId}`);
        }
      } catch (dbErr: any) {
        console.warn('[Drive Approve] Notice syncing approval to Firestore:', dbErr?.message);
      }

      return res.json({
        success: true,
        message: 'Certificate successfully approved, moved to approved event folder, and status updated.',
        driveFileId,
        approvedFolderId,
        renamedFileName: cleanFileName
      });
    } catch (err: any) {
      console.error('[Drive Approve] Error approving certificate:', err);
      return res.status(500).json({ error: err.message || 'Error approving certificate' });
    }
  });

  /**
   * POST /api/drive/reject-certificate
   * Explicit State Committee administrator rejection endpoint:
   * - Records rejected status, administrator identity, timestamp, and optional reason.
   * - Keeps the file out of the approved event folder and approved member certificate list.
   * - Preserves the existing rejection and retention policy (does not silently delete files unless deleteFile=true).
   * - Scheduled synchronization cannot change a rejected certificate back to pending or approved automatically.
   */
  app.post('/api/drive/reject-certificate', async (req, res) => {
    try {
      const authResult = await verifyAdminAuthorization(req);
      if (!authResult.authorized) {
        return res.status(403).json({
          error: authResult.error || 'Unauthorized: State Committee administrator access required.'
        });
      }

      const { driveFileId, rejectionReason, adminUid, adminName, certId, deleteFile } = req.body;
      if (!driveFileId) {
        return res.status(400).json({ error: 'driveFileId is required' });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive storage is disconnected.' });
      }

      if (deleteFile) {
        // If caller explicitly requested deletion with rejection
        const deleteResp = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!deleteResp.ok && deleteResp.status !== 404) {
          const errText = await deleteResp.text().catch(() => '');
          return res.status(502).json({
            error: 'drive_deletion_failed',
            message: 'Failed to delete file from Google Drive.',
            details: errText
          });
        }
      } else {
        // Update file properties on Google Drive with rejection metadata
        await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            properties: {
              approvalStatus: 'rejected',
              rejectionReason: rejectionReason || 'Certificate submission could not be verified by administrator',
              decisionByAdminUid: adminUid || authResult.email || 'admin',
              decisionByAdminName: adminName || authResult.name || 'Administrator',
              decisionAt: new Date().toISOString()
            }
          })
        }).catch(() => {});
      }

      // Record rejection status and reason in Firestore in both collections
      try {
        const adminDb = getAdminFirestore();
        if (adminDb) {
          const docId = certId || driveFileId;
          const rejectionUpdate = {
            approvalStatus: 'rejected',
            status: 'rejected',
            rejectionReason: rejectionReason || 'Certificate submission could not be verified by administrator',
            decisionByAdminUid: adminUid || authResult.email || 'admin',
            decisionByAdminName: adminName || authResult.name || 'Administrator',
            decisionAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const updates = [
            adminDb.collection('Certificates').doc(docId).set(rejectionUpdate, { merge: true }),
            adminDb.collection('certificates').doc(docId).set(rejectionUpdate, { merge: true })
          ];
          if (driveFileId !== docId) {
            updates.push(
              adminDb.collection('Certificates').doc(driveFileId).set(rejectionUpdate, { merge: true }),
              adminDb.collection('certificates').doc(driveFileId).set(rejectionUpdate, { merge: true })
            );
          }
          await Promise.all(updates);
          console.log(`[Drive Reject] Recorded rejection status in Firestore for ${docId}`);
        }
      } catch (dbErr: any) {
        console.warn('[Drive Reject] Notice updating rejection in Firestore:', dbErr?.message);
      }

      return res.json({
        success: true,
        message: 'Certificate submission rejection recorded successfully.',
        approvalStatus: 'rejected'
      });
    } catch (err: any) {
      console.error('[Drive Reject] Error rejecting certificate:', err);
      return res.status(500).json({ error: err.message || 'Error rejecting certificate' });
    }
  });

  /**
   * POST /api/drive/delete-certificate
   * Secure, privileged administrator endpoint to permanently delete a certificate.
   * - Requires authenticated administrator privileges.
   * - Determines upload ownership reliably using metadata (uploadSource, uploaderUid), not guessing from filenames alone.
   * - Member-uploaded: Deletes file from Google Drive, removes record from both member-facing and admin listings,
   *   and writes a tombstone so subsequent synchronization cannot resurrect it.
   * - Admin-uploaded: Deletes file from Google Drive, removes record from admin listing without affecting unrelated member records.
   * - Fails safely: only reports success when Google Drive deletion and database cleanups succeed.
   */
  app.post('/api/drive/delete-certificate', async (req, res) => {
    try {
      // 1. Authorize Administrator
      const authCheck = await verifyAdminAuthorization(req);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.error || 'Unauthorized: Administrator access required to delete certificates.' });
      }

      const { driveFileId, certId, eventId, membershipNumber, adminUid, adminName } = req.body;
      if (!driveFileId) {
        return res.status(400).json({ error: 'driveFileId is required' });
      }

      const token = await getValidServerDriveToken();
      if (!token) {
        return res.status(503).json({ error: 'Google Drive storage is disconnected.' });
      }

      const adminDb = getAdminFirestore();

      // 2. Determine upload ownership reliably using metadata from Firestore and Drive properties
      // Do NOT infer ownership from filenames alone.
      let uploadSource: 'admin' | 'user' = 'admin';
      let uploaderUid = '';
      let targetDocId = certId || (eventId && membershipNumber ? `${eventId}_${membershipNumber}` : driveFileId);
      let resolvedMemNo = membershipNumber || '';
      let resolvedEventId = eventId || '';

      // Check Firestore records
      if (adminDb) {
        try {
          const [doc1, doc2] = await Promise.all([
            adminDb.collection('Certificates').doc(driveFileId).get().catch(() => null),
            targetDocId ? adminDb.collection('Certificates').doc(targetDocId).get().catch(() => null) : null
          ]);
          const certData = (doc1?.exists ? doc1.data() : null) || (doc2?.exists ? doc2.data() : null);
          if (certData) {
            if (certData.uploadSource === 'user' || certData.uploadedBy === 'member') {
              uploadSource = 'user';
            }
            uploaderUid = certData.uploaderUid || certData.memberUid || '';
            if (!resolvedMemNo) resolvedMemNo = certData.membershipId || certData.membershipNumber || '';
            if (!resolvedEventId) resolvedEventId = certData.eventId || '';
          }
        } catch (err) {
          console.warn('[Drive Delete] Notice reading Firestore record for ownership check:', err);
        }
      }

      // Check Google Drive file properties if available
      try {
        const fileMetaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,properties`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (fileMetaRes.ok) {
          const fileMeta = await fileMetaRes.json();
          if (fileMeta.properties?.uploadSource === 'user' || fileMeta.properties?.uploadedBy === 'member') {
            uploadSource = 'user';
          }
          if (fileMeta.properties?.uploaderUid) {
            uploaderUid = fileMeta.properties.uploaderUid;
          }
          if (!resolvedMemNo && fileMeta.properties?.membershipNumber) {
            resolvedMemNo = fileMeta.properties.membershipNumber;
          }
          if (!resolvedEventId && fileMeta.properties?.eventId) {
            resolvedEventId = fileMeta.properties.eventId;
          }
        }
      } catch (e) {
        console.warn('[Drive Delete] Notice checking Drive properties:', e);
      }

      console.log(`[Drive Delete] Deleting certificate ${driveFileId} (Ownership: ${uploadSource}, MemNo: ${resolvedMemNo}, Event: ${resolvedEventId})...`);

      // 3. Delete from Google Drive
      // If deletion fails, report error and do not falsely report success
      const deleteResp = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!deleteResp.ok && deleteResp.status !== 404) {
        const errText = await deleteResp.text().catch(() => '');
        console.warn('[Drive Delete] Google Drive deletion failed:', deleteResp.status, errText);
        return res.status(deleteResp.status >= 500 ? deleteResp.status : 502).json({
          success: false,
          error: 'drive_deletion_failed',
          details: errText,
          message: 'Failed to delete certificate file from Google Drive. Database records were preserved so you can safely retry.'
        });
      }

      // 4. Record Tombstone so the certificate cannot reappear during future scans or reconciliations
      await recordCertificateTombstone({
        driveFileId,
        certId: targetDocId,
        membershipNumber: resolvedMemNo,
        eventId: resolvedEventId,
        uploadSource,
        deletedByAdminUid: adminUid || authCheck.email || '',
        deletedByAdminName: adminName || authCheck.name || 'Administrator'
      });

      // 5. Remove corresponding records from Firestore without affecting unrelated records
      if (adminDb) {
        try {
          const deleteOps: Promise<any>[] = [
            adminDb.collection('Certificates').doc(driveFileId).delete().catch(() => {}),
            adminDb.collection('certificates').doc(driveFileId).delete().catch(() => {})
          ];

          if (targetDocId && targetDocId !== driveFileId) {
            deleteOps.push(
              adminDb.collection('Certificates').doc(targetDocId).delete().catch(() => {}),
              adminDb.collection('certificates').doc(targetDocId).delete().catch(() => {})
            );
          }

          // Also clean up any record matching this driveFileId in both collections
          const [qCap, qLower] = await Promise.all([
            adminDb.collection('Certificates').where('driveFileId', '==', driveFileId).get().catch(() => null),
            adminDb.collection('certificates').where('driveFileId', '==', driveFileId).get().catch(() => null)
          ]);

          if (qCap && !qCap.empty) {
            qCap.docs.forEach((d) => deleteOps.push(d.ref.delete().catch(() => {})));
          }
          if (qLower && !qLower.empty) {
            qLower.docs.forEach((d) => deleteOps.push(d.ref.delete().catch(() => {})));
          }

          // For member-uploaded certificates: also remove document indexed by `${eventId}_${membershipNumber}`
          if (uploadSource === 'user' && resolvedEventId && resolvedMemNo) {
            const memberCertDocId = `${resolvedEventId}_${resolvedMemNo}`;
            deleteOps.push(
              adminDb.collection('Certificates').doc(memberCertDocId).delete().catch(() => {}),
              adminDb.collection('certificates').doc(memberCertDocId).delete().catch(() => {})
            );
          }

          await Promise.all(deleteOps);
          console.log(`[Drive Delete] Successfully removed all Firestore records for file ${driveFileId}`);
        } catch (dbErr: any) {
          console.error('[Drive Delete] Error removing Firestore records:', dbErr);
          return res.status(500).json({
            error: 'database_error',
            message: 'Certificate was deleted from Google Drive, but an error occurred updating database records: ' + (dbErr?.message || 'Database error')
          });
        }
      }

      return res.json({
        success: true,
        message: uploadSource === 'user'
          ? 'Member-uploaded certificate successfully deleted from Google Drive and removed from both member and admin portals.'
          : 'Admin-issued certificate successfully deleted from Google Drive and removed from admin records.',
        uploadSource
      });
    } catch (err: any) {
      console.error('[Drive Delete] Unexpected error:', err);
      return res.status(500).json({ error: err.message || 'Internal error deleting certificate' });
    }
  });

  /**
   * POST /api/drive/sync-certificate
   * Secure backend certificate metadata synchronization endpoint utilizing the Firebase Admin SDK.
   * - Bypasses client-side Firestore permission issues.
   * - Respects tombstones: does not resurrect deleted certificates.
   * - Preserves existing approval decisions during reconciliation (never overwrites 'pending', 'approved', or 'rejected').
   */
  app.post('/api/drive/sync-certificate', async (req, res) => {
    try {
      const cert = req.body;
      if (!cert || !cert.id) {
        return res.status(400).json({ error: 'Certificate with ID is required' });
      }

      // 1. If certificate is tombstoned, reject sync so deleted certificate never reappears!
      const tombstoned = await isDriveFileTombstoned(cert.id);
      if (tombstoned) {
        return res.json({ success: true, skipped: true, reason: 'tombstoned' });
      }

      const adminDb = getAdminFirestore();
      if (!adminDb) {
        return res.json({ success: true, saved: false, reason: 'no_admin_db' });
      }

      const docId = cert.eventId && cert.membershipNumber
        ? `${cert.eventId}_${cert.membershipNumber}`
        : cert.id;

      // 2. Check if document already exists to PRESERVE existing approval status
      let existingStatus: string | undefined;
      let existingDecisionByUid: string | undefined;
      let existingDecisionByName: string | undefined;
      let existingDecisionAt: string | undefined;
      let existingRejectionReason: string | undefined;

      try {
        const existingDoc = await adminDb.collection('Certificates').doc(docId).get();
        if (existingDoc.exists) {
          const data = existingDoc.data();
          existingStatus = data?.approvalStatus || data?.status;
          existingDecisionByUid = data?.decisionByAdminUid;
          existingDecisionByName = data?.decisionByAdminName;
          existingDecisionAt = data?.decisionAt;
          existingRejectionReason = data?.rejectionReason;
        }
      } catch (e) {
        console.warn('[Drive Sync] Notice checking existing doc:', e);
      }

      const isUser = cert.uploadSource === 'user' || cert.uploadedBy === 'member' || (cert.name && cert.name.startsWith('PENDING_'));

      // If existing document has a recorded decision, PRESERVE it!
      let finalStatus: string;
      if (existingStatus && ['pending', 'approved', 'rejected'].includes(existingStatus)) {
        finalStatus = existingStatus;
      } else if (cert.approvalStatus && ['pending', 'approved', 'rejected', 'not_required'].includes(cert.approvalStatus)) {
        finalStatus = cert.approvalStatus;
      } else {
        finalStatus = isUser ? 'pending' : 'not_required';
      }

      const cleanMemNo = (cert.membershipNumber || cert.membershipId || '').trim().toUpperCase();
      const cleanEventTitle = cert.eventName || cert.eventTitle || 'General Certificate';
      const cleanMemberName = cert.membershipName || cert.memberName || 'NMO Member';
      const finalDriveLink = cert.googleDriveLink || cert.webViewLink || (cert.id ? `https://drive.google.com/file/d/${cert.id}/view` : '');

      const recordToSave = {
        // 4 mandatory fields
        eventName: cleanEventTitle,
        membershipName: cleanMemberName,
        eventId: cert.eventId || '',
        googleDriveLink: finalDriveLink,

        // Core schema identifiers
        driveFileId: cert.id,
        membershipId: cleanMemNo,
        memberUid: cert.uploaderUid || cert.memberUid || '',
        uploadedAt: cert.createdTime || new Date().toISOString(),
        status: finalStatus,

        // Backward compatibility fields
        certId: docId,
        eventTitle: cleanEventTitle,
        driveFolderName: cert.driveFolderName || '',
        membershipNumber: cleanMemNo,
        memberName: cleanMemberName,
        uploaderUid: cert.uploaderUid || cert.memberUid || '',
        uploadSource: cert.uploadSource || (isUser ? 'user' : 'admin'),
        approvalStatus: finalStatus,
        driveFolderId: cert.driveFolderId || '',
        originalFileName: cert.name,
        mimeType: cert.mimeType || 'application/pdf',
        fileSize: cert.size || '',
        decisionByAdminUid: existingDecisionByUid || cert.decisionByAdminUid || null,
        decisionByAdminName: existingDecisionByName || cert.decisionByAdminName || null,
        decisionAt: existingDecisionAt || cert.decisionAt || null,
        rejectionReason: existingRejectionReason || cert.rejectionReason || null,
        webViewLink: finalDriveLink,
        proxyViewUrl: `/api/drive/file/${cert.id}`,
        proxyDownloadUrl: `/api/drive/file/${cert.id}?download=true`,
        updatedAt: new Date().toISOString()
      };

      const writeOps = [
        adminDb.collection('Certificates').doc(docId).set(recordToSave, { merge: true }),
        adminDb.collection('certificates').doc(docId).set(recordToSave, { merge: true })
      ];
      if (cert.id && cert.id !== docId) {
        writeOps.push(
          adminDb.collection('Certificates').doc(cert.id).set(recordToSave, { merge: true }),
          adminDb.collection('certificates').doc(cert.id).set(recordToSave, { merge: true })
        );
      }
      await Promise.all(writeOps);

      return res.json({ success: true, saved: true, certId: docId });
    } catch (err: any) {
      console.error('[Drive Sync] Error in sync-certificate:', err);
      return res.status(500).json({ error: err.message || 'Error syncing certificate' });
    }
  });

  /**
   * GET /api/drive/pending-certificates
   * Privileged endpoint utilizing Admin Firestore to fetch all submissions awaiting review.
   * Ensures all 4 mandatory fields + core identifiers are present and deduplicated by driveFileId.
   */
  app.get('/api/drive/pending-certificates', async (_req, res) => {
    try {
      const adminDb = getAdminFirestore();
      if (!adminDb) {
        return res.json({ success: true, count: 0, pending: [] });
      }

      const [snapCap, snapLower] = await Promise.all([
        adminDb.collection('Certificates').get().catch(() => null),
        adminDb.collection('certificates').get().catch(() => null)
      ]);

      const allDocs = [
        ...(snapCap ? snapCap.docs : []),
        ...(snapLower ? snapLower.docs : [])
      ];

      const pendingMap = new Map<string, any>();
      const approvedMap = new Map<string, any>();
      const rejectedMap = new Map<string, any>();

      allDocs.forEach((d) => {
        const c = d.data();
        if (!c) return;

        const rawStatus = String(c.status || c.approvalStatus || '').trim().toLowerCase();
        const fileId = c.driveFileId || c.certId || d.id;
        if (!fileId || tombstonedDriveFileIds.has(fileId)) return;

        const memNo = String(c.membershipId || c.membershipNumber || '').trim().toUpperCase();
        const memName = c.membershipName || c.memberName || 'NMO Member';
        const evtName = c.eventName || c.eventTitle || 'General Certificate';
        const evtId = c.eventId || '';
        const driveLink = c.googleDriveLink || c.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

        const record = {
          id: fileId,
          certId: c.certId || d.id,
          name: c.originalFileName || `${memNo || 'Certificate'}.pdf`,
          mimeType: c.mimeType || 'application/pdf',
          size: c.size || c.fileSize,
          createdTime: c.uploadedAt || c.createdTime,
          membershipNumber: memNo,
          membershipId: memNo,
          memberName: memName,
          membershipName: memName,
          eventId: evtId,
          eventTitle: evtName,
          eventName: evtName,
          googleDriveLink: driveLink,
          webViewLink: driveLink,
          driveFolderId: c.driveFolderId,
          uploadSource: c.uploadSource || 'user',
          approvalStatus: rawStatus || 'pending',
          status: rawStatus || 'pending',
          uploaderUid: c.memberUid || c.uploaderUid,
          rejectionReason: c.rejectionReason || null,
          decisionByAdminUid: c.decisionByAdminUid || null,
          decisionByAdminName: c.decisionByAdminName || null,
          decisionAt: c.decisionAt || null,
          approvedAt: c.approvedAt || null,
          proxyViewUrl: `/api/drive/file/${fileId}`,
          proxyDownloadUrl: `/api/drive/file/${fileId}?download=true`
        };

        if (rawStatus === 'pending' || rawStatus === 'pending_approval') {
          if (!pendingMap.has(fileId)) {
            pendingMap.set(fileId, record);
          }
        } else if (rawStatus === 'approved') {
          if (!approvedMap.has(fileId)) {
            approvedMap.set(fileId, record);
          }
        } else if (rawStatus === 'rejected') {
          if (!rejectedMap.has(fileId)) {
            rejectedMap.set(fileId, record);
          }
        }
      });

      const pendingList = Array.from(pendingMap.values());
      const approvedList = Array.from(approvedMap.values());
      const rejectedList = Array.from(rejectedMap.values());

      return res.json({
        success: true,
        count: pendingList.length,
        pending: pendingList,
        approved: approvedList,
        rejected: rejectedList
      });
    } catch (err: any) {
      console.error('[Drive Pending] Error querying pending certificates:', err);
      return res.status(500).json({ error: 'Failed to query pending certificates' });
    }
  });

  /**
   * GET /api/drive/all-certificates
   * Privileged endpoint utilizing Admin Firestore to fetch all certificate records.
   * Enables Admin -> Certificates Explorer and desk without client SDK permission issues.
   */
  app.get('/api/drive/all-certificates', async (_req, res) => {
    try {
      const adminDb = getAdminFirestore();
      if (!adminDb) {
        return res.json({ success: true, count: 0, certificates: [] });
      }

      const [snapCap, snapLower] = await Promise.all([
        adminDb.collection('Certificates').get().catch(() => null),
        adminDb.collection('certificates').get().catch(() => null)
      ]);
      const docs = [
        ...(snapCap ? snapCap.docs : []),
        ...(snapLower ? snapLower.docs : [])
      ];
      const certsMap = new Map<string, any>();

      docs.forEach((d) => {
        const c = d.data();
        if (!c) return;
        const fileId = c.driveFileId || c.certId || d.id;
        if (!tombstonedDriveFileIds.has(fileId) && !certsMap.has(fileId)) {
          const isUserUpload = c.uploadSource === 'user' || c.uploadedBy === 'member' || (c.originalFileName && c.originalFileName.startsWith('PENDING_'));
          const certApprovalStatus = c.approvalStatus || c.status || (isUserUpload ? 'pending' : 'not_required');

          certsMap.set(fileId, {
            id: fileId,
            name: c.originalFileName || `${c.membershipId || c.membershipNumber || 'Certificate'}.pdf`,
            mimeType: c.mimeType || 'application/pdf',
            size: c.size || c.fileSize,
            createdTime: c.uploadedAt || c.createdTime,
            membershipNumber: c.membershipId || c.membershipNumber,
            memberName: c.membershipName || c.memberName,
            eventId: c.eventId,
            eventTitle: c.eventName || c.eventTitle,
            eventName: c.eventName || c.eventTitle,
            googleDriveLink: c.googleDriveLink || c.webViewLink,
            driveFolderId: c.driveFolderId,
            driveFolderName: c.driveFolderName,
            uploadSource: c.uploadSource || (isUserUpload ? 'user' : 'admin'),
            approvalStatus: certApprovalStatus,
            status: certApprovalStatus,
            uploaderUid: c.memberUid || c.uploaderUid,
            proxyViewUrl: `/api/drive/file/${fileId}`,
            proxyDownloadUrl: `/api/drive/file/${fileId}?download=true`
          });
        }
      });

      const list = Array.from(certsMap.values());
      return res.json({
        success: true,
        count: list.length,
        certificates: list
      });
    } catch (err: any) {
      console.error('[Drive Certificates] Error querying all certificates:', err);
      return res.status(500).json({ error: 'Failed to query certificates' });
    }
  });

  // =========================================================================
  // Google Drive & Firestore Reconciliation & Webhook Handlers
  // =========================================================================

  /**
   * Synchronize direct Google Drive event folder uploads into Firestore.
   * Discovers event subfolders under "Events", paginates through certificate files,
   * extracts membership IDs (preserving leading zeros and handling PENDING_ prefixes),
   * resolves event & member identities, and writes documents with the 4 mandatory fields.
   * Deduplicates by driveFileId.
   */
  async function syncGoogleDriveCertificatesToFirestore(specificFolderId?: string): Promise<{
    success: boolean;
    syncedCount: number;
    unmatchedCount: number;
    message: string;
  }> {
    const token = await getValidServerDriveToken();
    if (!token) {
      return { success: false, syncedCount: 0, unmatchedCount: 0, message: 'Google Drive is disconnected.' };
    }

    const adminDb = getAdminFirestore();
    if (!adminDb) {
      return { success: false, syncedCount: 0, unmatchedCount: 0, message: 'Firestore Admin is not initialized.' };
    }

    try {
      // 1. Build lookup tables for Events and Members from Firestore
      const [eventsSnap, usersSnap] = await Promise.all([
        adminDb.collection('Events').get().catch(() => null),
        adminDb.collection('Users').get().catch(() => null)
      ]);

      const eventsById = new Map<string, { eventId: string; title: string; driveFolderId?: string }>();
      const eventsByNormTitle = new Map<string, { eventId: string; title: string; driveFolderId?: string }>();
      const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      if (eventsSnap) {
        eventsSnap.docs.forEach((doc) => {
          const data = doc.data();
          const evt = {
            eventId: doc.id,
            title: data.title || data.name || doc.id,
            driveFolderId: data.driveFolderId
          };
          eventsById.set(doc.id, evt);
          const norm = normalize(evt.title);
          if (norm) eventsByNormTitle.set(norm, evt);
        });
      }

      const membersByNo = new Map<string, { name: string; uid?: string }>();
      if (usersSnap) {
        usersSnap.docs.forEach((doc) => {
          const data = doc.data();
          const memNo = String(data.membershipNumber || doc.id).trim().toUpperCase();
          if (memNo) {
            membersByNo.set(memNo, {
              name: data.name || data.displayName || 'NMO Member',
              uid: data.uid || doc.id
            });
          }
        });
      }

      // 2. Discover event folders in Google Drive
      let targetFolders: Array<{ id: string; name: string }> = [];

      if (specificFolderId) {
        // Fetch metadata for specific folder
        try {
          const fResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(specificFolderId)}?fields=id,name`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (fResp.ok) {
            const fData = await fResp.json();
            targetFolders = [{ id: fData.id, name: fData.name }];
          }
        } catch {}
      } else {
        const hierarchy = await resolveDriveHierarchy(token);
        if (hierarchy.success && hierarchy.eventsFolder) {
          const eventsFolderId = hierarchy.eventsFolder.id;
          let pageToken: string | undefined = undefined;
          do {
            const query = `'${eventsFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
            let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name)&pageSize=100`;
            if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

            const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!resp.ok) break;
            const data = await resp.json();
            if (data.files && Array.isArray(data.files)) {
              targetFolders.push(...data.files);
            }
            pageToken = data.nextPageToken;
          } while (pageToken);
        }
      }

      if (targetFolders.length === 0) {
        return { success: true, syncedCount: 0, unmatchedCount: 0, message: 'No event folders found to synchronize.' };
      }

      let totalSynced = 0;
      let totalUnmatched = 0;

      // 3. For each event folder, scan its files and sync to Firestore
      for (const folder of targetFolders) {
        // Disambiguate event ID and Name
        let matchedEvt: { eventId: string; title: string } | undefined;

        // Try direct folder ID match
        for (const evt of eventsById.values()) {
          if (evt.driveFolderId === folder.id) {
            matchedEvt = evt;
            break;
          }
        }

        // Try exact name match
        if (!matchedEvt) {
          const folderClean = folder.name.trim().toLowerCase();
          for (const evt of eventsById.values()) {
            if (evt.title.trim().toLowerCase() === folderClean) {
              matchedEvt = evt;
              break;
            }
          }
        }

        // Try normalized name match
        if (!matchedEvt) {
          const normFolder = normalize(folder.name);
          matchedEvt = eventsByNormTitle.get(normFolder);
        }

        const resolvedEventId = matchedEvt ? matchedEvt.eventId : folder.id;
        const resolvedEventName = matchedEvt ? matchedEvt.title : folder.name;

        // Paginate files in this event folder
        let pageToken: string | undefined = undefined;
        do {
          const query = `'${folder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
          let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,size,createdTime,webViewLink,webContentLink,properties)&pageSize=100`;
          if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

          const filesResp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!filesResp.ok) break;

          const filesData = await filesResp.json();
          const files: any[] = filesData.files || [];

          for (const file of files) {
            const rawFileName = file.name || '';
            const fProps = file.properties || {};

            // Extract membership ID using robust delimiter & Users mapping logic (supports short IDs like 9521, leading zeros, NMO format, prevents partial matches)
            const extractedMemNo: string | null = extractMembershipIdFromFilename(
              rawFileName,
              membersByNo,
              fProps
            );

            // If matched to membership ID:
            if (extractedMemNo) {
              const memberInfo = membersByNo.get(extractedMemNo);
              const resolvedMemberName = fProps.memberName || memberInfo?.name || 'NMO Member';
              const resolvedMemberUid = fProps.uploaderUid || memberInfo?.uid || '';

              // Status resolution
              const isPendingPrefix = /^PENDING_/i.test(rawFileName);
              let status = fProps.approvalStatus || (isPendingPrefix || fProps.uploadSource === 'user' ? 'pending' : 'approved');
              if (isPendingPrefix && status !== 'rejected') {
                status = 'pending';
              }

              const driveLink = file.webViewLink || file.webContentLink || `https://drive.google.com/file/d/${file.id}/view`;

              const certRecord = {
                // 4 mandatory fields
                eventName: resolvedEventName,
                membershipName: resolvedMemberName,
                eventId: resolvedEventId,
                googleDriveLink: driveLink,

                // Core schema identifiers
                driveFileId: file.id,
                membershipId: extractedMemNo,
                memberUid: resolvedMemberUid,
                uploadedAt: file.createdTime || new Date().toISOString(),
                status,

                // Backward compatibility
                certId: `${resolvedEventId}_${extractedMemNo}`,
                eventTitle: resolvedEventName,
                membershipNumber: extractedMemNo,
                memberName: resolvedMemberName,
                uploaderUid: resolvedMemberUid,
                uploadSource: fProps.uploadSource || (isPendingPrefix ? 'user' : 'direct_drive'),
                approvalStatus: status,
                driveFolderId: folder.id,
                originalFileName: rawFileName,
                mimeType: file.mimeType || 'application/pdf',
                fileSize: file.size ? `${(Number(file.size) / (1024 * 1024)).toFixed(2)} MB` : undefined,
                webViewLink: driveLink,
                proxyViewUrl: `/api/drive/file/${file.id}`,
                proxyDownloadUrl: `/api/drive/file/${file.id}?download=true`,
                syncedFromDriveAt: new Date().toISOString()
              };

              // Persist to both 'certificates' and 'Certificates' using stable deduplication key (driveFileId)
              await Promise.all([
                adminDb.collection('certificates').doc(file.id).set(certRecord, { merge: true }),
                adminDb.collection('Certificates').doc(file.id).set(certRecord, { merge: true }),
                adminDb.collection('certificates').doc(`${resolvedEventId}_${extractedMemNo}`).set(certRecord, { merge: true }),
                adminDb.collection('Certificates').doc(`${resolvedEventId}_${extractedMemNo}`).set(certRecord, { merge: true })
              ]);

              totalSynced++;
            } else {
              // Unmatched file: Flag safely for reconciliation rather than associating with wrong user
              totalUnmatched++;
              console.warn(`[Drive Sync] File "${rawFileName}" in "${folder.name}" (${file.id}) could not be matched to a membership ID.`);
              try {
                await adminDb.collection('unmatched_drive_files').doc(file.id).set({
                  driveFileId: file.id,
                  name: rawFileName,
                  driveFolderId: folder.id,
                  driveFolderName: folder.name,
                  createdTime: file.createdTime,
                  webViewLink: file.webViewLink,
                  flaggedForReconciliation: true,
                  flaggedAt: new Date().toISOString()
                }, { merge: true });
              } catch {}
            }
          }

          pageToken = filesData.nextPageToken;
        } while (pageToken);
      }

      console.log(`[Drive Sync] Completed reconciliation: ${totalSynced} certificates synced, ${totalUnmatched} unmatched.`);
      return {
        success: true,
        syncedCount: totalSynced,
        unmatchedCount: totalUnmatched,
        message: `Successfully reconciled ${totalSynced} certificates from Google Drive into Firestore!`
      };
    } catch (syncErr: any) {
      console.error('[Drive Sync] Error during Drive-to-Firestore synchronization:', syncErr);
      return {
        success: false,
        syncedCount: 0,
        unmatchedCount: 0,
        message: syncErr.message || 'Error reconciling Drive files'
      };
    }
  }

  /**
   * POST /api/drive/sync-certificates
   * Manual admin reconciliation trigger endpoint.
   */
  app.post('/api/drive/sync-certificates', async (req, res) => {
    try {
      const folderId = req.body?.folderId;
      const result = await syncGoogleDriveCertificatesToFirestore(folderId);
      return res.json(result);
    } catch (err: any) {
      console.error('[Drive Sync Endpoint] Error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal error syncing certificates' });
    }
  });

  /**
   * POST /api/drive/webhook
   * Google Drive Push Notification change-detection endpoint.
   * Responds immediately with 200 and triggers background reconciliation.
   */
  app.post('/api/drive/webhook', async (req, res) => {
    // Acknowledge Google Drive push notification immediately
    res.status(200).send('OK');

    const resourceState = req.headers['x-goog-resource-state'];
    console.log(`[Drive Webhook] Received notification: state=${resourceState}`);

    if (resourceState && resourceState !== 'sync') {
      syncGoogleDriveCertificatesToFirestore()
        .then((res) => {
          console.log(`[Drive Webhook] Webhook-triggered reconciliation: ${res.syncedCount} synced.`);
        })
        .catch((err) => {
          console.warn('[Drive Webhook] Notice during webhook sync:', err?.message || err);
        });
    }
  });

  // Scheduled background reconciliation loop (runs every 3 minutes)
  const RECONCILIATION_INTERVAL_MS = 3 * 60 * 1000;
  setInterval(async () => {
    try {
      const session = await getDurableDriveSession();
      if (session && session.status === 'active' && session.refreshToken) {
        console.log('[Drive Sync Loop] Running scheduled 3-minute reconciliation...');
        await syncGoogleDriveCertificatesToFirestore();
      }
    } catch (err: any) {
      console.warn('[Drive Sync Loop] Notice in periodic reconciliation:', err?.message || err);
    }
  }, RECONCILIATION_INTERVAL_MS);

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

  // Pre-warm durable Google Drive session from Firestore / local cache
  getDurableDriveSession()
    .then((session) => {
      if (session && session.status !== 'disconnected') {
        console.log(`[Drive Auth] Pre-warmed Drive session for ${session.accountEmail}. Has refresh token: ${Boolean(session.refreshToken)}, persistedInFirestore: ${Boolean(session.persistedInFirestore)}`);
      } else {
        console.log('[Drive Auth] Pre-warming check complete: No active session stored in Firestore or container.');
      }
    })
    .catch((err) => {
      console.warn('[Drive Auth] Pre-warming notice:', err?.message || err);
    });

  app.listen(PORT, HOST, () => {
    console.log(`NMO Gujarat Server running at http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
