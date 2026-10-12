/**
 * National Medicos Organisation (NMO) Gujarat
 * Batch Member Import Script for "Users" Collection
 * 
 * Usage:
 *   node scripts/importUsers.js [path-to-file.xlsx|csv] [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLUMN_MAPPINGS = {
  'membership number': 'membershipNumber',
  'membership no': 'membershipNumber',
  'membership no.': 'membershipNumber',
  'membership': 'membershipNumber',
  'member no': 'membershipNumber',
  'name': 'name',
  'full name': 'name',
  'member name': 'name',
  'blood group': 'bloodGroup',
  'blood': 'bloodGroup',
  'bg': 'bloodGroup',
  'medical college': 'medicalCollege',
  'college': 'medicalCollege',
  'dob': 'dob',
  'date of birth': 'dob',
  'email': 'email',
  'email address': 'email',
  'gender': 'gender',
  'sex': 'gender',
  'member on': 'memberOn',
  'membership date': 'memberOn',
  'student membership valid till': 'studentMembershipValidTill',
  'valid till': 'studentMembershipValidTill',
  'address': 'address',
  'residential address': 'address',
  'pincode': 'pincode',
  'pin': 'pincode',
  'postal code': 'pincode',
  'nmo state': 'nmoState',
  'state': 'nmoState',
  'phone': 'phone',
  'mobile': 'phone',
  'contact': 'phone',
  'prant': 'prant',
  'qualifications': 'qualifications',
  'qualification': 'qualifications',
  'degree': 'qualifications',
  'ref. membership number': 'refMembershipNumber',
  'ref membership number': 'refMembershipNumber',
  'ref membership no': 'refMembershipNumber',
  'ref. person': 'refPerson',
  'ref person': 'refPerson',
  'reference': 'refPerson',
  'ref. person phone': 'refPersonPhone',
  'ref person phone': 'refPersonPhone',
  'registration number': 'registrationNumber',
  'reg number': 'registrationNumber',
  'reg no': 'registrationNumber',
  'council reg no': 'registrationNumber',
  'specialization': 'specialization',
  'speciality': 'specialization',
  'state secretary email': 'stateSecretaryEmail',
  'application fee': 'applicationFee',
  'fee': 'applicationFee',
  'fees': 'applicationFee',
  'role': 'role',
  'account status': 'accountStatus',
  'status': 'accountStatus'
};

function normalizeHeader(header) {
  if (!header) return '';
  return header.toString().trim().toLowerCase().replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ');
}

function parseDateValue(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date format
    const parsed = new Date((val - (25567 + 2)) * 86400 * 1000);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }
  const str = val.toString().trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return str;
}

function normalizePrant(val) {
  if (!val) return 'Gujarat';
  const clean = val.toString().trim().toLowerCase();
  if (clean.includes('saurashtra') || clean.includes('sau')) {
    return 'Saurashtra';
  }
  return 'Gujarat';
}

function processFile(filePath, isDryRun = false) {
  console.log(`\n======================================================`);
  console.log(`NMO Gujarat - "Users" Collection Import Utility`);
  console.log(`File: ${filePath}`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (Validation only)' : 'DATABASE BATCH WRITE'}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File "${filePath}" does not exist.`);
    process.exit(1);
  }

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rawRows.length < 2) {
    console.error('Error: Sheet contains no data rows.');
    process.exit(1);
  }

  const headerRow = rawRows[0];
  const fieldMapping = {};

  headerRow.forEach((colName, index) => {
    const normalized = normalizeHeader(colName);
    if (COLUMN_MAPPINGS[normalized]) {
      fieldMapping[index] = COLUMN_MAPPINGS[normalized];
    }
  });

  console.log('Detected column mappings:');
  Object.keys(fieldMapping).forEach((idx) => {
    console.log(`  Col ${idx} ("${headerRow[idx]}") -> ${fieldMapping[idx]}`);
  });

  const parsedUsers = [];
  const errors = [];
  const duplicateSet = new Set();

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every((c) => c === '')) continue; // Skip empty row

    const userObj = {
      role: 'member',
      accountStatus: 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    Object.keys(fieldMapping).forEach((idx) => {
      const field = fieldMapping[idx];
      let val = row[idx];
      if (val !== undefined && val !== null) {
        val = val.toString().trim();
      }
      userObj[field] = val;
    });

    // Validations
    if (!userObj.membershipNumber) {
      errors.push({ row: i + 1, error: 'Missing Membership Number' });
      continue;
    }

    userObj.membershipNumber = userObj.membershipNumber.trim().toUpperCase();

    if (duplicateSet.has(userObj.membershipNumber)) {
      errors.push({ row: i + 1, error: `Duplicate Membership Number: ${userObj.membershipNumber}` });
      continue;
    }
    duplicateSet.add(userObj.membershipNumber);

    if (!userObj.name) {
      errors.push({ row: i + 1, error: `Missing Name for ${userObj.membershipNumber}` });
      continue;
    }

    // Normalizations
    userObj.prant = normalizePrant(userObj.prant);
    if (userObj.dob) userObj.dob = parseDateValue(userObj.dob);
    if (userObj.memberOn) userObj.memberOn = parseDateValue(userObj.memberOn);
    if (userObj.studentMembershipValidTill) {
      userObj.studentMembershipValidTill = parseDateValue(userObj.studentMembershipValidTill);
    }
    if (!userObj.email) {
      userObj.email = `${userObj.membershipNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}@nmogujarat.org`;
    }

    parsedUsers.push(userObj);
  }

  console.log(`\nImport Summary:`);
  console.log(`  Total rows evaluated: ${rawRows.length - 1}`);
  console.log(`  Valid users parsed: ${parsedUsers.length}`);
  console.log(`  Validation errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log(`\nFirst 10 Errors:`);
    errors.slice(0, 10).forEach((err) => {
      console.log(`  Row ${err.row}: ${err.error}`);
    });
  }

  const outJsonPath = path.join(__dirname, '../parsed_users.json');
  fs.writeFileSync(outJsonPath, JSON.stringify(parsedUsers, null, 2));
  console.log(`Validated users exported to ${outJsonPath}`);
}

// CLI argument execution
const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith('--')) || path.join(__dirname, '../sample_nmo_members.csv');
const isDry = args.includes('--dry-run');

processFile(fileArg, isDry);
