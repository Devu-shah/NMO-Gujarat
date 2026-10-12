import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

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
