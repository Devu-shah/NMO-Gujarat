import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDocs, collection } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '../firebase-applet-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = initializeApp(config);
const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);

async function seed() {
  console.log('--- SEEDING ALL FIRESTORE COLLECTIONS FOR nmo-india-demo ---');

  // 1. Super Admin Document in Users collection
  const superAdmin = {
    membershipNumber: 'NMO-GUJ-ADMIN-001',
    name: 'Dr. Devansh Shah',
    bloodGroup: 'B+',
    medicalCollege: 'B.J. Medical College Ahmedabad',
    dob: '1988-04-12',
    email: 'devanshshah768@gmail.com',
    gender: 'Male',
    memberOn: '2018-01-15',
    studentMembershipValidTill: '2028-01-15',
    address: 'NMO State Office, Ellisbridge, Ahmedabad',
    pincode: '380006',
    nmoState: 'Gujarat',
    phone: '+91 98765 43210',
    prant: 'All',
    qualifications: 'MBBS, MD Community Medicine',
    refMembershipNumber: '',
    refPerson: 'State Patron',
    refPersonPhone: '+91 98250 11223',
    registrationNumber: 'G-34120',
    specialization: 'Community Medicine & Public Health',
    stateSecretaryEmail: 'secretary.gujarat@nmogujarat.org',
    applicationFee: 'Paid',
    role: 'super_admin',
    accountStatus: 'Active',
    profilePhoto: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };

  // State Admin Gujarat
  const stateAdminGujarat = {
    membershipNumber: 'NMO-GUJ-STATE-002',
    name: 'Dr. Rajesh P. Patel',
    bloodGroup: 'O+',
    medicalCollege: 'B.J. Medical College Ahmedabad',
    dob: '1985-09-20',
    email: 'secretary.gujarat@nmogujarat.org',
    gender: 'Male',
    memberOn: '2016-08-10',
    studentMembershipValidTill: '2026-08-10',
    address: 'Paldi, Ahmedabad',
    pincode: '380007',
    nmoState: 'Gujarat',
    phone: '+91 98251 33445',
    prant: 'Gujarat',
    qualifications: 'MBBS, MS General Surgery',
    refMembershipNumber: 'NMO-GUJ-ADMIN-001',
    refPerson: 'Dr. Devansh Shah',
    refPersonPhone: '+91 98765 43210',
    registrationNumber: 'G-29841',
    specialization: 'General & Laparoscopic Surgery',
    stateSecretaryEmail: 'secretary.gujarat@nmogujarat.org',
    applicationFee: 'Paid',
    role: 'state_admin',
    accountStatus: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Prant Admin Saurashtra
  const prantAdminSaurashtra = {
    membershipNumber: 'NMO-SAU-PRANT-003',
    name: 'Dr. Bhavin M. Joshi',
    bloodGroup: 'A+',
    medicalCollege: 'PDU Medical College Rajkot',
    dob: '1989-12-05',
    email: 'secretary.saurashtra@nmogujarat.org',
    gender: 'Male',
    memberOn: '2019-04-01',
    studentMembershipValidTill: '2029-04-01',
    address: 'Kalawad Road, Rajkot',
    pincode: '360005',
    nmoState: 'Gujarat',
    phone: '+91 94282 66778',
    prant: 'Saurashtra',
    qualifications: 'MBBS, MD Internal Medicine',
    refMembershipNumber: 'NMO-GUJ-STATE-002',
    refPerson: 'Dr. Rajesh P. Patel',
    refPersonPhone: '+91 98251 33445',
    registrationNumber: 'G-38914',
    specialization: 'Internal Medicine & Critical Care',
    stateSecretaryEmail: 'secretary.gujarat@nmogujarat.org',
    applicationFee: 'Paid',
    role: 'prant_admin',
    accountStatus: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'Users', superAdmin.membershipNumber), superAdmin, { merge: true });
  await setDoc(doc(db, 'Users', stateAdminGujarat.membershipNumber), stateAdminGujarat, { merge: true });
  await setDoc(doc(db, 'Users', prantAdminSaurashtra.membershipNumber), prantAdminSaurashtra, { merge: true });
  console.log('✓ Seeded admin accounts into "Users" collection.');

  // 2. Events Collection
  const events = [
    {
      eventId: 'NMO-EVT-2026-001',
      title: 'State Medical Symposium & Seva Orientation 2026',
      description: 'Annual Gujarat State conference on ethical medical practices, primary health camps, and rural tribal outreach programs with senior clinicians.',
      eventImage: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop&q=80',
      date: '2026-11-20',
      startTime: '09:00',
      endTime: '17:00',
      venue: 'Auditorium, B.J. Medical College',
      city: 'Ahmedabad',
      state: 'Gujarat',
      prant: 'Gujarat',
      registrationStart: '2026-10-01',
      registrationEnd: '2026-11-15',
      maximumParticipants: 350,
      registrationRequired: true,
      status: 'Active',
      createdBy: 'secretary.gujarat@nmogujarat.org',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participants: [
        {
          membershipNumber: 'NMO-GUJ-2026-008',
          uid: 'sample-uid-008',
          name: 'Dr. Manan K. Shah',
          email: 'manan.shah@nmogujarat.org',
          phone: '+91 98791 22334',
          medicalCollege: 'B.J. Medical College Ahmedabad',
          prant: 'Gujarat',
          registrationDate: '2026-10-05',
          approvalStatus: 'Approved',
          attendanceStatus: 'Pending',
          approvedBy: 'State Secretary',
          approvedAt: new Date().toISOString(),
          attendanceMarkedBy: '',
          attendanceMarkedAt: ''
        },
        {
          membershipNumber: 'NMO-GUJ-2026-010',
          uid: 'sample-uid-010',
          name: 'Siddharth M. Vaghela',
          email: 'siddharth.v@student.nmogujarat.org',
          phone: '+91 97123 44556',
          medicalCollege: 'Government Medical College Surat',
          prant: 'Gujarat',
          registrationDate: '2026-10-05',
          approvalStatus: 'Pending',
          attendanceStatus: 'Pending',
          approvedBy: '',
          approvedAt: '',
          attendanceMarkedBy: '',
          attendanceMarkedAt: ''
        }
      ]
    },
    {
      eventId: 'NMO-EVT-2026-002',
      title: 'Gir-Somnath Mega Diagnostic & Seva Arogya Camp',
      description: 'Comprehensive health screening, specialist consultations (pediatrics, gynecology, ophthalmology, cardiology), and free medicine distribution.',
      eventImage: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=800&auto=format&fit=crop&q=80',
      date: '2026-12-06',
      startTime: '08:30',
      endTime: '18:00',
      venue: 'Community Health Centre Complex, Veraval',
      city: 'Veraval',
      state: 'Gujarat',
      prant: 'Saurashtra',
      registrationStart: '2026-10-10',
      registrationEnd: '2026-11-30',
      maximumParticipants: 200,
      registrationRequired: true,
      status: 'Active',
      createdBy: 'secretary.saurashtra@nmogujarat.org',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participants: [
        {
          membershipNumber: 'NMO-SAU-2026-009',
          uid: 'sample-uid-009',
          name: 'Dr. Aarti B. Rathod',
          email: 'aarti.rathod@nmogujarat.org',
          phone: '+91 94264 55667',
          medicalCollege: 'PDU Medical College Rajkot',
          prant: 'Saurashtra',
          registrationDate: '2026-10-05',
          approvalStatus: 'Approved',
          attendanceStatus: 'Pending',
          approvedBy: 'Prant Secretary',
          approvedAt: new Date().toISOString(),
          attendanceMarkedBy: '',
          attendanceMarkedAt: ''
        }
      ]
    },
    {
      eventId: 'NMO-EVT-2026-003',
      title: 'Surgical Camp & Laparoscopy Workshop',
      description: 'Hands-on clinical workshop for post-graduate surgical trainees and screening camp for elective surgeries.',
      eventImage: 'https://images.unsplash.com/photo-1551076805-e1869033e561?w=800&auto=format&fit=crop&q=80',
      date: '2027-01-18',
      startTime: '09:00',
      endTime: '16:00',
      venue: 'Civil Hospital Campus, Surat',
      city: 'Surat',
      state: 'Gujarat',
      prant: 'Gujarat',
      registrationStart: '2026-11-01',
      registrationEnd: '2027-01-10',
      maximumParticipants: 120,
      registrationRequired: true,
      status: 'Active',
      createdBy: 'secretary.gujarat@nmogujarat.org',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      participants: []
    }
  ];

  for (const evt of events) {
    await setDoc(doc(db, 'Events', evt.eventId), evt, { merge: true });
    console.log(`✓ Seeded Events/${evt.eventId} ("${evt.title}") with ${evt.participants.length} participants.`);
  }

  // Verify counts
  const usersSnap = await getDocs(collection(db, 'Users'));
  const eventsSnap = await getDocs(collection(db, 'Events'));

  console.log(`\n======================================================`);
  console.log(`FIRESTORE COLLECTIONS CREATED AND POPULATED IN nmo-india-demo:`);
  console.log(`  1. "Users" collection: ${usersSnap.size} total member & admin documents`);
  console.log(`  2. "Events" collection: ${eventsSnap.size} total event documents with embedded participants[]`);
  console.log(`======================================================\n`);
}

seed().catch(console.error);
