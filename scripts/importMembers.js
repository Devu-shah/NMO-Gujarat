/**
 * National Medicos Organisation (NMO) Gujarat
 * Batch Member Import Script
 * 
 * Usage:
 *   node scripts/importMembers.js [path-to-file.xlsx|csv] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Normalization dictionary for varied Excel / CSV column headers
const HEADER_MAP = {
  'membership number': 'membershipNumber',
  'membership no': 'membershipNumber',
  'membership_no': 'membershipNumber',
  'member no': 'membershipNumber',
  'member id': 'membershipNumber',
  
  'name': 'name',
  'full name': 'name',
  'member name': 'name',
  'doctor name': 'name',
  
  'blood group': 'bloodGroup',
  'blood_group': 'bloodGroup',
  'bloodgroup': 'bloodGroup',
  
  'medical college': 'medicalCollege',
  'college': 'medicalCollege',
  'institution': 'medicalCollege',
  
  'dob': 'dob',
  'date of birth': 'dob',
  'birth date': 'dob',
  
  'email': 'email',
  'email address': 'email',
  
  'gender': 'gender',
  'sex': 'gender',
  
  'member on': 'memberOn',
  'joining date': 'memberOn',
  'membership date': 'memberOn',
  
  'student membership valid till': 'studentMembershipValidTill',
  'valid till': 'studentMembershipValidTill',
  'validity': 'studentMembershipValidTill',
  
  'address': 'address',
  'residential address': 'address',
  
  'pincode': 'pincode',
  'pin code': 'pincode',
  'postal code': 'pincode',
  'zip': 'pincode',
  
  'nmo state': 'nmoState',
  'state': 'nmoState',
  
  'phone': 'phone',
  'phone number': 'phone',
  'mobile': 'phone',
  'contact': 'phone',
  
  'prant': 'prant',
  'region': 'prant',
  
  'qualifications': 'qualifications',
  'qualification': 'qualifications',
  'degree': 'qualifications',
  
  'ref. membership number': 'refMembershipNumber',
  'ref membership number': 'refMembershipNumber',
  'ref membership no': 'refMembershipNumber',
  
  'ref. person': 'refPerson',
  'ref person': 'refPerson',
  'reference person': 'refPerson',
  
  'ref. person phone': 'refPersonPhone',
  'ref person phone': 'refPersonPhone',
  'reference phone': 'refPersonPhone',
  
  'registration number': 'registrationNumber',
  'reg no': 'registrationNumber',
  'smc registration': 'registrationNumber',
  'medical council reg no': 'registrationNumber',
  
  'specialization': 'specialization',
  'speciality': 'specialization',
  
  'state secretary email': 'stateSecretaryEmail',
  'secretary email': 'stateSecretaryEmail',
  
  'application fee': 'applicationFee',
  'fee': 'applicationFee',
  'status': 'status'
};

function normalizeDate(raw) {
  if (!raw) return '';
  if (raw instanceof Date) {
    return raw.toISOString().split('T')[0];
  }
  const str = String(raw).trim();
  // Handle Excel numeric serial dates
  if (!isNaN(Number(str)) && Number(str) > 20000 && Number(str) < 70000) {
    const d = new Date((Number(str) - (25567 + 2)) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  // Handle DD/MM/YYYY or DD-MM-YYYY
  const parts = str.split(/[\/\-\.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY or MM-DD-YYYY
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  return str;
}

function normalizePrant(val) {
  if (!val) return 'Gujarat';
  const clean = String(val).trim().toLowerCase();
  if (clean.includes('saurashtra')) return 'Saurashtra';
  return 'Gujarat';
}

function runImport() {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--')) || path.join(__dirname, '../sample_nmo_members.csv');
  const isDryRun = args.includes('--dry-run');

  console.log('----------------------------------------------------');
  console.log('   NMO Gujarat - Batch Member Import Engine');
  console.log('   "प्राणिनाम् आर्तिनाशनम्"');
  console.log('----------------------------------------------------');
  console.log(`Target file: ${filePath}`);
  console.log(`Dry run mode: ${isDryRun ? 'ENABLED (no writes)' : 'DISABLED (live import)'}`);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at path: ${filePath}`);
    process.exit(1);
  }

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { raw: false });

  console.log(`Found ${rawRows.length} raw rows in sheet "${sheetName}".`);

  const seenNumbers = new Set();
  const validRecords = [];
  const errors = [];
  let duplicates = 0;

  rawRows.forEach((row, index) => {
    const rowNum = index + 2;
    const normalized = {};

    Object.keys(row).forEach(rawKey => {
      const cleanKey = rawKey.trim().toLowerCase();
      const mappedField = HEADER_MAP[cleanKey] || cleanKey;
      normalized[mappedField] = String(row[rawKey] || '').trim();
    });

    const membershipNo = normalized.membershipNumber;
    const name = normalized.name;

    if (!membershipNo) {
      errors.push({ row: rowNum, error: 'Missing Membership Number' });
      return;
    }
    if (!name) {
      errors.push({ row: rowNum, error: 'Missing Member Name' });
      return;
    }

    const upperNo = membershipNo.toUpperCase();
    if (seenNumbers.has(upperNo)) {
      duplicates++;
      errors.push({ row: rowNum, error: `Duplicate Membership Number: ${upperNo}` });
      return;
    }
    seenNumbers.add(upperNo);

    const record = {
      membershipNumber: upperNo,
      name: name,
      bloodGroup: normalized.bloodGroup || '',
      medicalCollege: normalized.medicalCollege || '',
      dob: normalizeDate(normalized.dob),
      email: normalized.email || '',
      gender: normalized.gender || 'Not Specified',
      memberOn: normalizeDate(normalized.memberOn) || new Date().toISOString().split('T')[0],
      studentMembershipValidTill: normalizeDate(normalized.studentMembershipValidTill),
      address: normalized.address || '',
      pincode: normalized.pincode || '',
      nmoState: normalized.nmoState || 'Gujarat',
      phone: normalized.phone || '',
      prant: normalizePrant(normalized.prant),
      qualifications: normalized.qualifications || 'MBBS',
      refMembershipNumber: normalized.refMembershipNumber || '',
      refPerson: normalized.refPerson || '',
      refPersonPhone: normalized.refPersonPhone || '',
      registrationNumber: normalized.registrationNumber || '',
      specialization: normalized.specialization || '',
      stateSecretaryEmail: normalized.stateSecretaryEmail || '',
      applicationFee: normalized.applicationFee || 'Paid',
      status: normalized.status || 'Active',
      updatedAt: new Date().toISOString()
    };

    validRecords.push(record);
  });

  console.log('\n--- IMPORT SUMMARY ---');
  console.log(`Total Rows Parsed:     ${rawRows.length}`);
  console.log(`Valid Records:         ${validRecords.length}`);
  console.log(`Duplicate Keys:        ${duplicates}`);
  console.log(`Failed Validation:     ${errors.length - duplicates}`);

  if (errors.length > 0) {
    console.log('\nSample Validation Issues:');
    errors.slice(0, 10).forEach(e => console.log(`  Row ${e.row}: ${e.error}`));
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  }

  // Write sanitized JSON report
  const reportPath = path.join(__dirname, '../import-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    importedAt: new Date().toISOString(),
    total: rawRows.length,
    validCount: validRecords.length,
    duplicates,
    errors
  }, null, 2));

  console.log(`\nImport summary written to ${reportPath}`);
  console.log('Import validation process completed successfully.');
}

if (require.main === module) {
  runImport();
}

module.exports = { runImport, HEADER_MAP, normalizeDate };
