import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '../firebase-applet-config.json');
if (!fs.existsSync(configPath)) {
  console.error('Error: firebase-applet-config.json not found!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log('--- Initializing Firebase connection ---');
console.log(`Project: ${config.projectId}`);
console.log(`Database ID: ${config.firestoreDatabaseId}`);

const app = initializeApp(config);
const auth = getAuth(app);
const db = config.firestoreDatabaseId ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);

async function run() {
  try {
    console.log('\n--- 1. Testing write to Users collection ---');
    // Read CSV data
    const csvPath = path.join(__dirname, '../sample_nmo_members.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
    const headers = lines[0].split(',').map(h => h.trim());
    
    console.log(`Found ${lines.length - 1} records in ${path.basename(csvPath)}`);

    let importedCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim());
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = parts[idx] || '';
      });

      const membershipNumber = (row['Membership Number'] || '').toUpperCase();
      if (!membershipNumber) continue;

      const userDoc = {
        membershipNumber,
        name: row['Name'] || '',
        bloodGroup: row['Blood Group'] || '',
        medicalCollege: row['Medical College'] || '',
        dob: row['DOB'] || '',
        email: row['Email'] || '',
        gender: row['Gender'] || '',
        memberOn: row['Member On'] || '',
        studentMembershipValidTill: row['Student Membership Valid Till'] || '',
        address: row['Address'] || '',
        pincode: row['Pincode'] || '',
        nmoState: row['NMO State'] || 'Gujarat',
        phone: row['Phone'] || '',
        prant: row['Prant'] || 'Gujarat',
        qualifications: row['Qualifications'] || '',
        refMembershipNumber: row['Ref. Membership Number'] || '',
        refPerson: row['Ref. Person'] || '',
        refPersonPhone: row['Ref. Person Phone'] || '',
        registrationNumber: row['Registration Number'] || '',
        specialization: row['Specialization'] || '',
        stateSecretaryEmail: row['State Secretary Email'] || 'secretary.gujarat@nmogujarat.org',
        applicationFee: row['Application Fee'] || 'Paid',
        role: 'member',
        accountStatus: row['Status'] || 'Active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      console.log(`Writing Users/${membershipNumber} (${userDoc.name})...`);
      await setDoc(doc(db, 'Users', membershipNumber), userDoc, { merge: true });
      importedCount++;
    }

    console.log(`Successfully wrote ${importedCount} records to "Users" collection!`);

    console.log('\n--- 2. Testing read from Users collection ---');
    const usersSnap = await getDocs(collection(db, 'Users'));
    console.log(`Retrieved ${usersSnap.size} user documents from live Firestore:`);
    usersSnap.forEach(d => {
      const data = d.data();
      console.log(` - [${d.id}] ${data.name} (${data.prant} Prant, Role: ${data.role})`);
    });

    console.log('\n--- 3. Testing write & participant workflow in Events collection ---');
    const sampleEventId = 'NMO-EVT-2026-001';
    const sampleEvent = {
      eventId: sampleEventId,
      title: 'State Medical Symposium & Seva Orientation 2026',
      description: 'Annual Gujarat State conference on ethical medical practices, primary health camps, and rural outreach programs.',
      eventImage: '',
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
        }
      ]
    };

    await setDoc(doc(db, 'Events', sampleEventId), sampleEvent, { merge: true });
    console.log(`Successfully wrote Events/${sampleEventId}`);

    console.log('\n--- 4. Testing read from Events collection ---');
    const eventDoc = await getDoc(doc(db, 'Events', sampleEventId));
    if (eventDoc.exists()) {
      const data = eventDoc.data();
      console.log(`Retrieved event "${data.title}" with ${(data.participants || []).length} registered participants.`);
    }

    console.log('\n>>> All live Firestore read/write tests PASSED successfully! <<<');
    process.exit(0);
  } catch (err) {
    console.error('Firestore operation error:', err);
    process.exit(1);
  }
}

run();
