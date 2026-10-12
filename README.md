# National Medicos Organisation (NMO) Gujarat Portal & Management System

> **॥ प्राणिनाम् आर्तिनाशनम् ॥**  
> *"Relief to the suffering of living beings"*

Production-ready web application and administrative management system for **National Medicos Organisation (NMO) Gujarat State** (encompassing **Gujarat Prant** and **Saurashtra Prant**).

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Installation & Local Setup](#2-installation--local-setup)
3. [Firebase Setup](#3-firebase-setup)
4. [Authentication Setup](#4-authentication-setup)
5. [Firestore Setup & Schema](#5-firestore-setup--schema)
6. [Firebase Storage Setup](#6-firebase-storage-setup)
7. [Environment Variables](#7-environment-variables)
8. [Firestore Security Rules](#8-firestore-security-rules)
9. [Compound Index Deployment](#9-compound-index-deployment)
10. [Initial Excel / CSV Database Import](#10-initial-excel--csv-database-import)
11. [Creating and Bootstrapping Super Admin](#11-creating-and-bootstrapping-super-admin)
12. [Uploading and Managing High-Resolution Images](#12-uploading-and-managing-high-resolution-images)
13. [Creating Events with Dynamic Member Columns](#13-creating-events-with-dynamic-member-columns)
14. [CSV Import & Replace Synchronization](#14-csv-import--replace-synchronization)
15. [CSV Export Modes](#15-csv-export-modes)
16. [Production Deployment](#16-production-deployment)

---

## 1. System Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Authentication**: Firebase Authentication (Email/Password, Member Account Linking)
- **Primary Database**: Google Cloud Firestore (Normalized schema, sub-collections, scalable indexation)
- **File & Media Storage**: Firebase Storage (Hero backgrounds, event banners, member ID photos)
- **Security & Authorization**: Attribute-Based Access Control (ABAC) with role-based partitioning:
  - `super_admin`: Full statewide access, user role assignments, audit log governance.
  - `state_admin`: Access across Gujarat State (both Gujarat and Saurashtra Prants).
  - `prant_admin`: Strictly isolated to assigned Prant (`Gujarat` or `Saurashtra`).
  - `member`: Personal verified profile, printable ID card with cryptographic QR code, event registrations.

---

## 2. Installation & Local Setup

```bash
# Clone the repository
git clone <repository-url>
cd nmo-gujarat

# Install dependencies
npm install

# Start Vite development server on port 3000
npm run dev
```

The application runs on `http://localhost:3000`.

---

## 3. Firebase Setup

This application connects to the user-provided Firebase project `nmo-india-demo`.

To connect your own Firebase project:
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select or create your Firebase Project.
3. Add a Web App (`</>`) to obtain your Firebase credentials.
4. Copy the values into your `.env` file (see Environment Variables).

---

## 4. Authentication Setup

1. In the Firebase Console, navigate to **Build → Authentication**.
2. Click **Get Started** and enable the **Email/Password** sign-in method.
3. Ensure authorized domains in Firebase Authentication settings include:
   - `localhost`
   - Your production application domain (e.g. Cloud Run / Firebase Hosting).
4. Members can register or sign in using their official email address and link their unique **Membership Number** (e.g. `NMO-GUJ-2024-001`).

---

## 5. Firestore Setup & Schema

1. In the Firebase Console, go to **Build → Firestore Database**.
2. Click **Create Database** and select your regional location (e.g. `asia-south1` or `asia-southeast1`).
3. Start in production mode (rules are supplied in `firestore.rules`).

### Firestore Collections

- `/members/{membershipNumber}`: Master member records keyed by unique Membership Number.
- `/users/{uid}`: Authenticated Firebase accounts linked to membership records.
- `/events/{eventId}`: Master list of state CMEs, tribal medical camps, and conclaves.
- `/eventRegistrations/{registrationId}`: Scalable participation documents linking `eventId` and `membershipNumber`.
- `/announcements/{announcementId}`: Circulars and notices targeting visitors, members, or admins.
- `/imports/{importId}`: Historical audit logs of batch imports and master dataset synchronizations.
- `/auditLogs/{logId}`: Append-only security audit trail of administrative modifications.
- `/settings/{settingId}`: System configuration and contact info.

---

## 6. Firebase Storage Setup

1. In Firebase Console, go to **Build → Storage** and click **Get Started**.
2. Folder directory structure:
   ```text
   /public/assets/nmo/
     hero/           # Homepage slider images
     backgrounds/    # Section backgrounds and fallbacks
     events/         # Event posters and banners
     gallery/        # Photo chronicle albums
     activities/     # Seva program graphics
   ```
3. Any photograph placed into `/public/assets/nmo/hero/` or `/public/assets/nmo/gallery/` is automatically displayed in the slider and photo gallery.

---

## 7. Environment Variables

Create a `.env` file in the root directory (based on `.env.example`):

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY="AIzaSyD3fJNxR4kylm4csslEbReoFOROzMZNOks"
VITE_FIREBASE_AUTH_DOMAIN="nmo-india-demo.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="nmo-india-demo"
VITE_FIREBASE_STORAGE_BUCKET="nmo-india-demo.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="321117934169"
VITE_FIREBASE_APP_ID="1:321117934169:web:35376991c49f4606179748"
VITE_FIREBASE_MEASUREMENT_ID="G-ER2LW8Y18M"

# Super Admin Email Bootstrap
VITE_SUPER_ADMIN_EMAIL="devanshshah768@gmail.com"
```

---

## 8. Firestore Security Rules

Deploy the included `firestore.rules` using the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

The rules enforce:
- Role-based permissions preventing unauthorized reads across Prants.
- Member self-editing is restricted exclusively to contact fields (`phone`, `email`, `address`, `pincode`, `photoUrl`).
- Protected administrative fields (`membershipNumber`, `medicalCollege`, `registrationNumber`, `studentMembershipValidTill`) are locked against member modification.
- Append-only audit logging where `delete` and `update` are forbidden.

---

## 9. Compound Index Deployment

Deploy the indexes defined in `firestore.indexes.json`:

```bash
firebase deploy --only firestore:indexes
```

---

## 10. Initial Excel / CSV Database Import

Use the built-in standalone Node.js script `scripts/importMembers.js`:

```bash
# Dry run to test and validate headers without writing
node scripts/importMembers.js sample_nmo_members.csv --dry-run

# Execute full import
node scripts/importMembers.js sample_nmo_members.csv
```

The script:
1. Normalizes varied column headers (e.g. `Membership No`, `Member ID`, `Doctor Name`).
2. Validates mandatory keys (`membershipNumber`, `name`).
3. Detects duplicate records.
4. Safely parses dates (including Excel serial numbers).
5. Produces an `import-report.json` summary.

Alternatively, administrators can use **EDIT NMO GUJARAT DATA → Import CSV** in the Admin Portal.

---

## 11. Creating and Bootstrapping Super Admin

1. Sign up or log in with the email address configured in `VITE_SUPER_ADMIN_EMAIL` (`devanshshah768@gmail.com`).
2. The system automatically grants **Super Admin** privileges to this verified address.
3. The Super Admin can navigate to **Users** in the Admin Portal to promote or assign other users as **State Admin** or **Prant Admin (Saurashtra / Gujarat)**.
4. For live testing, the top navbar includes an instant **Demo Role Switcher** to simulate Super Admin, State Admin, Saurashtra Prant Admin, and Member permissions with zero latency.

---

## 12. Uploading and Managing High-Resolution Images

1. Place high-resolution hero banners into `public/assets/nmo/hero/`.
2. Place event photographs into `public/assets/nmo/events/`.
3. Place camp albums into `public/assets/nmo/gallery/`.
4. The homepage hero slider automatically loads images placed in `/hero/` with automatic rotation, manual next/previous controls, and dark readability scrim overlays.

---

## 13. Creating Events with Dynamic Member Columns

When creating an event in **Admin Portal → Events**:
1. Fill in title, date, time, venue, city, and Prant.
2. Toggle **"Add Event Field to Member Database"**.
3. Choose the column header name (e.g. `Dang Camp 2026`) and field display type:
   - `Attended/Not Attended`
   - `Approved/Rejected`
   - `Registered/Not Registered`
   - `Yes/No`
4. This renders the event as an interactive dynamic column in **Member Data** without modifying underlying member documents, using a normalized join against `eventRegistrations`.

---

## 14. CSV Import & Replace Synchronization

### Import CSV
- Uploads an incremental CSV or XLSX file.
- Categorizes records into **New**, **Updated**, **Duplicate**, and **Invalid**.
- Requires confirmation before writing to Firestore.

### Replace CSV
- Synchronizes the entire master database with an authoritative state dataset.
- Performs a live differential comparison.
- **Deactivation Policy**: Members present in Firestore but omitted from the new file are marked as **Inactive** rather than permanently deleted, preserving audit and historical event records.

---

## 15. CSV Export Modes

Navigate to **EDIT NMO GUJARAT DATA → Export CSV**:
- **Export Complete Database**: Exports all permitted records with full biographical and council fields.
- **Export Filtered View**: Exports members matching selected Prant, status, degree, or medical college.
- **Export Event Participants**: Exports participant lists and attendance for a selected event.
- Filenames follow the standardized timestamp convention:
  `NMO_Gujarat_Members_YYYY-MM-DD.csv`  
  `NMO_Saurashtra_Members_YYYY-MM-DD.csv`  
  `NMO_Event_Participants_Camp2026_YYYY-MM-DD.csv`

---

## 16. Production Deployment

```bash
# Build the production bundle
npm run build

# Preview build locally
npm run preview
```

Deploy to Firebase Hosting or Cloud Run:
```bash
firebase deploy
```

---

## License

Copyright © 2026 National Medicos Organisation (NMO) Gujarat. All rights reserved.
