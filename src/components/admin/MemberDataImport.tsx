import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { db } from '../../lib/firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { useNMO, isProtectedAdminUser } from '../../context/NMOContext';
import { NMOUserRecord, PrantType } from '../../types/nmo';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  RefreshCw,
  FileCheck,
  Check,
  AlertCircle,
  Download,
  Database,
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronRight,
  Save,
  RotateCcw,
  Sparkles,
  ArrowDownUp,
  Fingerprint,
  Info,
  Trash2
} from 'lucide-react';

export type ImportMode = 'add_update' | 'replace_sync' | 'validate_only';

interface FieldDiff {
  field: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
}

interface RecordDiff {
  membershipNumber: string;
  name: string;
  status: 'new' | 'updated' | 'unchanged' | 'duplicate' | 'invalid' | 'missing';
  rowNumber: number;
  data: Partial<NMOUserRecord>;
  diffs: FieldDiff[];
  errors: string[];
}

interface ValidationErrorItem {
  rowNumber: number;
  membershipNumber: string;
  field: string;
  invalidValue: string;
  error: string;
  suggestedAction: string;
}

const LOCAL_STORAGE_MAPPING_KEY = 'nmo_member_data_import_mapping_v1';

// Canonical Master Field Definitions
export const MASTER_FIELDS: { key: keyof NMOUserRecord | 'ignore'; label: string; required?: boolean; description: string }[] = [
  { key: 'membershipNumber', label: 'Membership Number (Document ID)', required: true, description: 'Direct Firestore Document ID (e.g. NMO-GUJ-2026-008)' },
  { key: 'name', label: 'Member Name', required: true, description: 'Full name with honorific' },
  { key: 'bloodGroup', label: 'Blood Group', description: 'e.g. A+, O+, B-, AB+' },
  { key: 'medicalCollege', label: 'Medical College', description: 'Institution / College name' },
  { key: 'dob', label: 'Date of Birth (DOB)', description: 'YYYY-MM-DD or DD/MM/YYYY' },
  { key: 'email', label: 'Email Address', description: 'Primary contact email' },
  { key: 'gender', label: 'Gender', description: 'Male, Female, or Other' },
  { key: 'memberOn', label: 'Member On (Joining Date)', description: 'Official joining date' },
  { key: 'studentMembershipValidTill', label: 'Student Membership Valid Till', description: 'Validity date' },
  { key: 'address', label: 'Address', description: 'Postal residential address' },
  { key: 'pincode', label: 'Pincode', description: '6-digit pin/zip code' },
  { key: 'nmoState', label: 'NMO State', description: 'State chapter (e.g. Gujarat)' },
  { key: 'phone', label: 'Phone Number', description: 'Primary contact mobile' },
  { key: 'prant', label: 'Prant', description: 'Gujarat or Saurashtra' },
  { key: 'qualifications', label: 'Qualifications', description: 'Degrees (MBBS, MD, MS, etc.)' },
  { key: 'refMembershipNumber', label: 'Ref. Membership Number', description: 'Referrer ID' },
  { key: 'refPerson', label: 'Ref. Person', description: 'Name of referring person' },
  { key: 'refPersonPhone', label: 'Ref. Person Phone', description: 'Referrer mobile' },
  { key: 'registrationNumber', label: 'Registration Number', description: 'SMC/GMC Council ID' },
  { key: 'specialization', label: 'Specialization', description: 'Clinical speciality' },
  { key: 'stateSecretaryEmail', label: 'State Secretary Email', description: 'State secretary email' },
  { key: 'applicationFee', label: 'Application Fee', description: 'Fee payment status' },
  { key: 'accountStatus', label: 'Account Status', description: 'Active or Inactive' },
  { key: 'ignore', label: '(Ignore This Column)', description: 'Do not import this column' }
];

// Smart auto-mapper for raw header strings
const autoDetectField = (headerName: string): keyof NMOUserRecord | 'ignore' => {
  const clean = headerName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (clean.includes('membershipnumber') || clean.includes('membershipno') || clean.includes('memberid') || clean === 'id') return 'membershipNumber';
  if (clean === 'name' || clean.includes('fullname') || clean.includes('doctorname') || clean.includes('membername')) return 'name';
  if (clean.includes('blood')) return 'bloodGroup';
  if (clean.includes('college') || clean.includes('institution') || clean.includes('hospital')) return 'medicalCollege';
  if (clean === 'dob' || clean.includes('birth')) return 'dob';
  if (clean.includes('email') || clean === 'mail') return 'email';
  if (clean === 'gender' || clean === 'sex') return 'gender';
  if (clean.includes('memberon') || clean.includes('joindate') || clean.includes('membershipdate') || clean.includes('joining')) return 'memberOn';
  if (clean.includes('validtill') || clean.includes('validity') || clean.includes('validuntil')) return 'studentMembershipValidTill';
  if (clean.includes('address') || clean.includes('residence')) return 'address';
  if (clean.includes('pincode') || clean.includes('zip') || clean.includes('postal')) return 'pincode';
  if (clean.includes('nmostate') || clean === 'state') return 'nmoState';
  if (clean.includes('phone') || clean.includes('mobile') || clean.includes('contact')) return 'phone';
  if (clean.includes('prant') || clean.includes('chapter') || clean.includes('zone')) return 'prant';
  if (clean.includes('qualif') || clean.includes('degree') || clean.includes('education')) return 'qualifications';
  if (clean.includes('refmembership') || clean.includes('referencemembership')) return 'refMembershipNumber';
  if (clean.includes('refpersonphone') || clean.includes('referencephone')) return 'refPersonPhone';
  if (clean.includes('refperson') || clean.includes('referrer') || clean.includes('referenceperson')) return 'refPerson';
  if (clean.includes('registration') || clean.includes('regno') || clean.includes('smc') || clean.includes('gmc')) return 'registrationNumber';
  if (clean.includes('special')) return 'specialization';
  if (clean.includes('secretary')) return 'stateSecretaryEmail';
  if (clean.includes('fee')) return 'applicationFee';
  if (clean.includes('status')) return 'accountStatus';
  return 'ignore';
};

interface MemberDataImportProps {
  initialMode?: ImportMode;
}

export const MemberDataImport: React.FC<MemberDataImportProps> = ({ initialMode = 'add_update' }) => {
  const { users, currentUser, logAudit, createUsersBackup, setUsers, clearNonAdminUsers } = useNMO();

  // Mode Selection
  const [mode, setMode] = useState<ImportMode>(initialMode);

  // Workflow Steps: 'upload' -> 'mapping' -> 'preview' -> 'committing' -> 'complete'
  const [currentStep, setCurrentStep] = useState<'upload' | 'mapping' | 'preview' | 'committing' | 'complete'>('upload');

  // Clear Non-Admin Members Modal State
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearInputText, setClearInputText] = useState('');
  const [isClearingUsers, setIsClearingUsers] = useState(false);
  const [clearFeedback, setClearFeedback] = useState<string | null>(null);

  // File & Raw Data State
  const [file, setFile] = useState<File | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [isReadingFile, setIsReadingFile] = useState(false);

  // Column Mapping State: rawHeader -> targetField
  const [columnMapping, setColumnMapping] = useState<Record<string, keyof NMOUserRecord | 'ignore'>>({});
  const [savedMappingFeedback, setSavedMappingFeedback] = useState<string | null>(null);

  // Computed Analysis State
  const [recordDiffs, setRecordDiffs] = useState<RecordDiff[]>([]);
  const [duplicateFileRecords, setDuplicateFileRecords] = useState<{ membershipNumber: string; rows: number[] }[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationErrorItem[]>([]);
  const [missingFromFirestore, setMissingFromFirestore] = useState<NMOUserRecord[]>([]);

  // Batch Write Progress
  const [progress, setProgress] = useState<{ processed: number; total: number }>({ processed: 0, total: 0 });
  const [commitResult, setCommitResult] = useState<{
    added: number;
    updated: number;
    unchanged: number;
    deactivated: number;
    duplicates: number;
    invalid: number;
    success: boolean;
    error?: string;
  } | null>(null);

  // Filter & Inspection State
  const [previewTab, setPreviewTab] = useState<'all' | 'new' | 'updated' | 'unchanged' | 'missing' | 'duplicates' | 'errors'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Safety Confirmation Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmInputText, setConfirmInputText] = useState('');
  const [backupDownloadedNotice, setBackupDownloadedNotice] = useState(false);

  // Role permissions
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isPrantAdmin = currentUser?.role === 'prant_admin';
  const assignedPrant = currentUser?.prant;

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  // Handle File Upload (CSV or XLSX)
  const handleFileUpload = (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsReadingFile(true);
    setRecordDiffs([]);
    setValidationErrors([]);
    setDuplicateFileRecords([]);
    setCommitResult(null);

    const reader = new FileReader();

    if (uploadedFile.name.endsWith('.xlsx') || uploadedFile.name.endsWith('.xls')) {
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
          handleParsedRawRows(json, uploadedFile.name);
        } catch (err: any) {
          alert('Error parsing Excel: ' + err.message);
          setIsReadingFile(false);
        }
      };
      reader.readAsArrayBuffer(uploadedFile);
    } else {
      // CSV
      Papa.parse(uploadedFile, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          handleParsedRawRows(results.data, uploadedFile.name);
        },
        error: (err) => {
          alert('Error parsing CSV: ' + err.message);
          setIsReadingFile(false);
        }
      });
    }
  };

  const handleParsedRawRows = (rows: any[], filename: string) => {
    setIsReadingFile(false);
    if (!rows || rows.length === 0) {
      alert('The uploaded file does not contain any readable data rows.');
      return;
    }

    const detectedHeaders = Object.keys(rows[0]);
    setRawHeaders(detectedHeaders);
    setRawRows(rows);

    // Load saved mapping from localStorage
    let savedMapping: Record<string, keyof NMOUserRecord | 'ignore'> = {};
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_MAPPING_KEY);
      if (saved) savedMapping = JSON.parse(saved);
    } catch {}

    const initialMapping: Record<string, keyof NMOUserRecord | 'ignore'> = {};
    detectedHeaders.forEach((header) => {
      if (savedMapping[header]) {
        initialMapping[header] = savedMapping[header];
      } else {
        initialMapping[header] = autoDetectField(header);
      }
    });

    setColumnMapping(initialMapping);
    setCurrentStep('mapping');
  };

  const handleSaveDefaultMapping = () => {
    try {
      localStorage.setItem(LOCAL_STORAGE_MAPPING_KEY, JSON.stringify(columnMapping));
      setSavedMappingFeedback('Column mapping saved as default for future uploads!');
      setTimeout(() => setSavedMappingFeedback(null), 3000);
    } catch {}
  };

  const handleResetMapping = () => {
    const reset: Record<string, keyof NMOUserRecord | 'ignore'> = {};
    rawHeaders.forEach((h) => {
      reset[h] = autoDetectField(h);
    });
    setColumnMapping(reset);
  };

  // Step 2 -> Step 3: Run Validation & Diff Analysis
  const runValidationAndDiffAnalysis = () => {
    const hasMembershipKey = Object.values(columnMapping).includes('membershipNumber');
    const hasNameKey = Object.values(columnMapping).includes('name');

    if (!hasMembershipKey) {
      alert('Error: You must map a column to "Membership Number (Document ID)" as the required unique key.');
      return;
    }
    if (!hasNameKey) {
      alert('Error: You must map a column to "Member Name".');
      return;
    }

    // 1. Detect Duplicate Membership Numbers within file
    const fileNumberMap = new Map<string, number[]>();
    const errors: ValidationErrorItem[] = [];

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const mappedRecord: any = {};

      Object.entries(columnMapping).forEach(([rawHeader, targetKey]) => {
        if (targetKey !== 'ignore') {
          mappedRecord[targetKey] = String(row[rawHeader] ?? '').trim();
        }
      });

      const membershipNumber = mappedRecord.membershipNumber || '';
      const name = mappedRecord.name || '';

      if (!membershipNumber) {
        errors.push({
          rowNumber: rowNum,
          membershipNumber: '(Missing)',
          field: 'Membership Number',
          invalidValue: '(empty)',
          error: 'Missing required primary business identifier',
          suggestedAction: 'Add a valid unique Membership Number'
        });
      } else {
        const cleanNo = membershipNumber.trim().toUpperCase();
        const existingRows = fileNumberMap.get(cleanNo) || [];
        existingRows.push(rowNum);
        fileNumberMap.set(cleanNo, existingRows);
      }

      if (!name) {
        errors.push({
          rowNumber: rowNum,
          membershipNumber: membershipNumber || `Row-${rowNum}`,
          field: 'Name',
          invalidValue: '(empty)',
          error: 'Missing member name',
          suggestedAction: 'Enter the member full name'
        });
      }

      if (mappedRecord.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(mappedRecord.email)) {
          errors.push({
            rowNumber: rowNum,
            membershipNumber: membershipNumber || `Row-${rowNum}`,
            field: 'Email',
            invalidValue: mappedRecord.email,
            error: 'Invalid email address format',
            suggestedAction: 'Correct email format (e.g. name@domain.com)'
          });
        }
      }

      if (mappedRecord.phone) {
        const digits = mappedRecord.phone.replace(/[^0-9]/g, '');
        if (digits.length < 8) {
          errors.push({
            rowNumber: rowNum,
            membershipNumber: membershipNumber || `Row-${rowNum}`,
            field: 'Phone',
            invalidValue: mappedRecord.phone,
            error: 'Phone number format appears invalid',
            suggestedAction: 'Provide a valid 10-digit mobile number'
          });
        }
      }

      if (mappedRecord.prant) {
        const pLower = mappedRecord.prant.toLowerCase();
        if (pLower.includes('saurashtra')) {
          mappedRecord.prant = 'Saurashtra';
        } else if (pLower.includes('gujarat')) {
          mappedRecord.prant = 'Gujarat';
        } else {
          errors.push({
            rowNumber: rowNum,
            membershipNumber: membershipNumber || `Row-${rowNum}`,
            field: 'Prant',
            invalidValue: mappedRecord.prant,
            error: 'Unrecognized Prant (must be Gujarat or Saurashtra)',
            suggestedAction: 'Set Prant to either "Gujarat" or "Saurashtra"'
          });
        }

        if (isPrantAdmin && assignedPrant !== 'All' && mappedRecord.prant !== assignedPrant) {
          errors.push({
            rowNumber: rowNum,
            membershipNumber: membershipNumber || `Row-${rowNum}`,
            field: 'Prant Scope Permission',
            invalidValue: mappedRecord.prant,
            error: `Access Denied: You are only authorized to manage members in "${assignedPrant}" Prant.`,
            suggestedAction: 'Remove out-of-scope records or contact Super Admin'
          });
        }
      }
    });

    const fileDuplicates: { membershipNumber: string; rows: number[] }[] = [];
    fileNumberMap.forEach((rowsList, memNo) => {
      if (rowsList.length > 1) {
        fileDuplicates.push({ membershipNumber: memNo, rows: rowsList });
        rowsList.slice(1).forEach((r) => {
          errors.push({
            rowNumber: r,
            membershipNumber: memNo,
            field: 'Membership Number',
            invalidValue: memNo,
            error: `Duplicate Membership Number in file (rows: ${rowsList.join(', ')})`,
            suggestedAction: 'Ensure Membership Numbers are strictly unique'
          });
        });
      }
    });

    setDuplicateFileRecords(fileDuplicates);
    setValidationErrors(errors);

    // 2. Compare with Firestore Users collection
    const firestoreMap = new Map(users.map((u) => [u.membershipNumber.toUpperCase(), u]));
    const processedDiffs: RecordDiff[] = [];
    const seenInFile = new Set<string>();

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const mappedRecord: any = {};

      Object.entries(columnMapping).forEach(([rawHeader, targetKey]) => {
        if (targetKey !== 'ignore') {
          mappedRecord[targetKey] = String(row[rawHeader] ?? '').trim();
        }
      });

      const memNo = mappedRecord.membershipNumber || '';
      const cleanNo = memNo.trim().toUpperCase();

      const rowErrors = errors.filter((e) => e.rowNumber === rowNum).map((e) => `${e.field}: ${e.error}`);
      const isDuplicate = fileDuplicates.some((d) => d.membershipNumber === cleanNo && d.rows.indexOf(rowNum) > 0);

      if (isDuplicate) {
        processedDiffs.push({
          membershipNumber: memNo,
          name: mappedRecord.name || '(Unnamed)',
          status: 'duplicate',
          rowNumber: rowNum,
          data: mappedRecord,
          diffs: [],
          errors: ['Duplicate Membership Number within file']
        });
        return;
      }

      if (rowErrors.length > 0) {
        processedDiffs.push({
          membershipNumber: memNo || `Row-${rowNum}`,
          name: mappedRecord.name || '(Unnamed)',
          status: 'invalid',
          rowNumber: rowNum,
          data: mappedRecord,
          diffs: [],
          errors: rowErrors
        });
        return;
      }

      seenInFile.add(cleanNo);

      const existingRecord = firestoreMap.get(cleanNo);

      if (!existingRecord) {
        // NEW Record: Document Users/{cleanNo} will be created
        processedDiffs.push({
          membershipNumber: memNo,
          name: mappedRecord.name,
          status: 'new',
          rowNumber: rowNum,
          data: mappedRecord,
          diffs: [],
          errors: []
        });
      } else {
        // Field-level comparison
        const diffs: FieldDiff[] = [];
        const checkKeys: (keyof NMOUserRecord)[] = [
          'name',
          'bloodGroup',
          'medicalCollege',
          'dob',
          'email',
          'gender',
          'memberOn',
          'studentMembershipValidTill',
          'address',
          'pincode',
          'nmoState',
          'phone',
          'prant',
          'qualifications',
          'refMembershipNumber',
          'refPerson',
          'refPersonPhone',
          'registrationNumber',
          'specialization',
          'stateSecretaryEmail',
          'applicationFee'
        ];

        checkKeys.forEach((key) => {
          if (Object.values(columnMapping).includes(key)) {
            const oldVal = String((existingRecord as any)[key] ?? '').trim();
            const newVal = String(mappedRecord[key] ?? '').trim();
            if (oldVal !== newVal) {
              const def = MASTER_FIELDS.find((f) => f.key === key);
              diffs.push({
                field: key,
                fieldLabel: def ? def.label : key,
                oldValue: oldVal || '(empty)',
                newValue: newVal || '(empty)'
              });
            }
          }
        });

        if (diffs.length > 0) {
          processedDiffs.push({
            membershipNumber: memNo,
            name: mappedRecord.name,
            status: 'updated',
            rowNumber: rowNum,
            data: mappedRecord,
            diffs,
            errors: []
          });
        } else {
          processedDiffs.push({
            membershipNumber: memNo,
            name: mappedRecord.name,
            status: 'unchanged',
            rowNumber: rowNum,
            data: mappedRecord,
            diffs: [],
            errors: []
          });
        }
      }
    });

    const missingMembers: NMOUserRecord[] = [];
    firestoreMap.forEach((user, key) => {
      if (!seenInFile.has(key)) {
        if (isPrantAdmin && assignedPrant !== 'All' && user.prant !== assignedPrant) {
          // Out of Prant scope
        } else {
          missingMembers.push(user);
        }
      }
    });

    setMissingFromFirestore(missingMembers);
    setRecordDiffs(processedDiffs);
    setCurrentStep('preview');
  };

  const summaryMetrics = useMemo(() => {
    const totalRows = rawRows.length;
    const newCount = recordDiffs.filter((r) => r.status === 'new').length;
    const updatedCount = recordDiffs.filter((r) => r.status === 'updated').length;
    const unchangedCount = recordDiffs.filter((r) => r.status === 'unchanged').length;
    const duplicateCount = recordDiffs.filter((r) => r.status === 'duplicate').length;
    const invalidCount = recordDiffs.filter((r) => r.status === 'invalid').length;
    const missingCount = missingFromFirestore.length;

    return {
      totalRows,
      newCount,
      updatedCount,
      unchangedCount,
      duplicateCount,
      invalidCount,
      missingCount
    };
  }, [recordDiffs, rawRows, missingFromFirestore]);

  const displayedDiffs = useMemo(() => {
    return recordDiffs.filter((r) => {
      if (previewTab !== 'all' && r.status !== previewTab) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          r.membershipNumber.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.data.phone && r.data.phone.includes(q)) ||
          (r.data.email && r.data.email.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [recordDiffs, previewTab, searchQuery]);

  const handleDownloadErrorReport = () => {
    if (validationErrors.length === 0) return;

    const headers = ['Row Number', 'Membership Number', 'Field', 'Invalid Value', 'Error Description', 'Suggested Action'];
    const rows = validationErrors.map((e) => [
      e.rowNumber,
      `"${e.membershipNumber}"`,
      `"${e.field}"`,
      `"${(e.invalidValue || '').replace(/"/g, '""')}"`,
      `"${(e.error || '').replace(/"/g, '""')}"`,
      `"${(e.suggestedAction || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `NMO_Error_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadBackup = () => {
    createUsersBackup();
    setBackupDownloadedNotice(true);
  };

  // DIRECT FIRESTORE WRITE WITH MEMBERSHIP NUMBER AS DOCUMENT ID
  const handleCommitToFirestore = async () => {
    setShowConfirmModal(false);
    setCurrentStep('committing');

    const validNewAndUpdated = recordDiffs
      .filter((r) => r.status === 'new' || r.status === 'updated')
      .map((r) => r.data as NMOUserRecord);

    const filename = file?.name || 'master_members.csv';

    // If Dry Run Validation Mode
    if (mode === 'validate_only') {
      await logAudit(
        'CSV_VALIDATION',
        'USERS',
        `VAL-${Date.now()}`,
        `Validated ${validNewAndUpdated.length} records from ${filename}. Dry run complete with 0 database writes.`
      );

      setCommitResult({
        added: 0,
        updated: 0,
        unchanged: summaryMetrics.unchangedCount,
        deactivated: 0,
        duplicates: summaryMetrics.duplicateCount,
        invalid: summaryMetrics.invalidCount,
        success: true
      });
      setCurrentStep('complete');
      return;
    }

    // In Replace Mode, create backup before applying changes
    if (mode === 'replace_sync') {
      createUsersBackup();
    }

    let added = 0;
    let updated = 0;
    let deactivated = 0;

    const existingMap = new Map(users.map((u) => [u.membershipNumber.toUpperCase(), u]));
    const nextList = [...users];

    // Build write operations using Membership Number as Document ID
    interface BatchOp {
      docId: string;
      data: NMOUserRecord;
    }
    const operations: BatchOp[] = [];

    for (const item of validNewAndUpdated) {
      // Direct Firestore Document ID: Membership Number
      const docId = item.membershipNumber.trim().toUpperCase();
      const existing = existingMap.get(docId);

      // Preserve protected fields: uid, role, createdAt, lastLogin
      const sanitizedRecord: NMOUserRecord = {
        ...item,
        membershipNumber: docId,
        role: existing?.role || item.role || 'member',
        accountStatus: existing?.accountStatus || item.accountStatus || 'Active',
        createdAt: existing?.createdAt || item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const finalUid = existing?.uid || item.uid;
      if (finalUid && typeof finalUid === 'string' && finalUid.trim() !== '') {
        sanitizedRecord.uid = finalUid.trim();
      } else {
        delete (sanitizedRecord as any).uid;
      }

      const finalLastLogin = existing?.lastLogin || item.lastLogin;
      if (finalLastLogin) sanitizedRecord.lastLogin = finalLastLogin;

      const finalProfilePhoto = existing?.profilePhoto || item.profilePhoto;
      if (finalProfilePhoto) sanitizedRecord.profilePhoto = finalProfilePhoto;

      // Strip any undefined or null keys so Firestore never rejects with "Unsupported field value: undefined"
      const cleanRecord: Record<string, any> = {};
      Object.entries(sanitizedRecord).forEach(([k, v]) => {
        if (v !== undefined && v !== null && k !== 'undefined') {
          if (typeof v === 'string') {
            const trimmed = v.trim();
            if (k === 'uid' && trimmed === '') return;
            cleanRecord[k] = trimmed;
          } else {
            cleanRecord[k] = v;
          }
        }
      });
      if (!cleanRecord.uid || typeof cleanRecord.uid !== 'string' || cleanRecord.uid.trim() === '') {
        delete cleanRecord.uid;
      }

      if (existing) {
        const idx = nextList.findIndex((u) => u.membershipNumber.toUpperCase() === docId);
        if (idx >= 0) {
          nextList[idx] = { ...existing, ...cleanRecord };
          updated++;
        }
      } else {
        nextList.push(cleanRecord as NMOUserRecord);
        existingMap.set(docId, cleanRecord as NMOUserRecord);
        added++;
      }

      // Add to operations list targeting doc(db, 'Users', docId)
      operations.push({ docId, data: cleanRecord as NMOUserRecord });
    }

    // If Replace mode, mark missing members as Inactive
    if (mode === 'replace_sync') {
      for (const missing of missingFromFirestore) {
        const docId = missing.membershipNumber.trim().toUpperCase();
        const existing = existingMap.get(docId);
        if (existing) {
          const deactivatedRecord: NMOUserRecord = {
            ...existing,
            accountStatus: 'Inactive',
            updatedAt: new Date().toISOString()
          };
          const cleanDeactivated: Record<string, any> = {};
          Object.entries(deactivatedRecord).forEach(([k, v]) => {
            if (v !== undefined && v !== null && k !== 'undefined') {
              cleanDeactivated[k] = v;
            }
          });
          if (!cleanDeactivated.uid || typeof cleanDeactivated.uid !== 'string' || cleanDeactivated.uid.trim() === '') {
            delete cleanDeactivated.uid;
          }
          const idx = nextList.findIndex((u) => u.membershipNumber.toUpperCase() === docId);
          if (idx >= 0) {
            nextList[idx] = cleanDeactivated as NMOUserRecord;
          }
          operations.push({ docId, data: cleanDeactivated as NMOUserRecord });
          deactivated++;
        }
      }
    }

    // Update local state immediately
    setUsers(nextList);

    // Commit writes in safe batches of 400 operations to Firestore
    const CHUNK_SIZE = 400;
    const totalOps = operations.length;
    let processedOps = 0;

    try {
      for (let i = 0; i < totalOps; i += CHUNK_SIZE) {
        const chunk = operations.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const op of chunk) {
          // DIRECT DOCUMENT ID ASSIGNMENT: Users/{membershipNumber}
          const ref = doc(db, 'Users', op.docId);
          const safeData: Record<string, any> = {};
          Object.entries(op.data).forEach(([k, v]) => {
            if (v !== undefined && v !== null && k !== 'undefined') {
              safeData[k] = v;
            }
          });
          if (!safeData.uid || typeof safeData.uid !== 'string' || safeData.uid.trim() === '') {
            delete safeData.uid;
          }
          batch.set(ref, safeData, { merge: true });
        }

        await batch.commit();
        processedOps += chunk.length;
        setProgress({ processed: processedOps, total: totalOps });
      }

      await logAudit(
        mode === 'replace_sync' ? 'REPLACE_SYNC_CSV' : 'CSV_IMPORT',
        'USERS',
        `BATCH-${Date.now()}`,
        `Batch synchronized ${operations.length} documents into Users collection using Membership Number as Document ID. Added: ${added}, Updated: ${updated}, Deactivated: ${deactivated}`
      );

      setCommitResult({
        added,
        updated,
        unchanged: summaryMetrics.unchangedCount,
        deactivated,
        duplicates: summaryMetrics.duplicateCount,
        invalid: summaryMetrics.invalidCount,
        success: true
      });
      setCurrentStep('complete');
    } catch (err: any) {
      console.warn('Batch write error:', err);
      setCommitResult({
        added,
        updated,
        unchanged: summaryMetrics.unchangedCount,
        deactivated,
        duplicates: summaryMetrics.duplicateCount,
        invalid: summaryMetrics.invalidCount,
        success: false,
        error: err.message || 'Firestore batch write failed halfway'
      });
      setCurrentStep('complete');
    }
  };

  const handleResetWizard = () => {
    setFile(null);
    setRawHeaders([]);
    setRawRows([]);
    setRecordDiffs([]);
    setValidationErrors([]);
    setDuplicateFileRecords([]);
    setCommitResult(null);
    setCurrentStep('upload');
  };

  const nonAdminCount = useMemo(() => {
    return users.filter((u) => !isProtectedAdminUser(u, currentUser)).length;
  }, [users, currentUser]);

  const handleExecuteClearNonAdmin = async () => {
    setIsClearingUsers(true);
    setClearFeedback(null);
    try {
      const res = await clearNonAdminUsers();
      if (res.success) {
        setClearFeedback(
          `Successfully cleared ${res.deletedCount} member records from Cloud Firestore. All ${res.preservedCount} administrator accounts preserved.`
        );
        setShowClearModal(false);
        setClearInputText('');
        if (currentStep === 'preview') {
          runValidationAndDiffAnalysis();
        }
      } else {
        alert('Failed to clear users: ' + (res.error || 'Unknown error'));
      }
    } catch (e: any) {
      alert('Error during user clearance: ' + e.message);
    } finally {
      setIsClearingUsers(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Header and Mode Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-red-100 text-red-700 rounded-lg">
              <Database className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-black text-slate-900">
              Member Data Import & Firestore Synchronization
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <Fingerprint className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              Direct Document Key Mapping: Firestore documents are created at{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-red-700 font-bold">
                Users/{'{membershipNumber}'}
              </code>{' '}
              (using Membership IDs directly as primary keys, without random hash IDs).
            </span>
          </p>
        </div>

        {/* Actions & Mode Selector */}
        <div className="flex flex-wrap items-center gap-3">
          {(isSuperAdmin || currentUser?.role === 'state_admin') && (
            <button
              type="button"
              onClick={() => {
                setClearInputText('');
                setShowClearModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer hover:shadow-xs"
              title="Clear all non-admin members while strictly keeping admins and superadmin"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Clear Members (Keep Admins)</span>
              {nonAdminCount > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-200 text-rose-800 rounded-full text-[10px] font-mono font-bold">
                  {nonAdminCount}
                </span>
              )}
            </button>
          )}

          {/* Mode Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('add_update');
              if (currentStep === 'preview') runValidationAndDiffAnalysis();
            }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              mode === 'add_update'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Add / Update
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('replace_sync');
              if (currentStep === 'preview') runValidationAndDiffAnalysis();
            }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              mode === 'replace_sync'
                ? 'bg-amber-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Replace / Synchronize
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('validate_only');
              if (currentStep === 'preview') runValidationAndDiffAnalysis();
            }}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              mode === 'validate_only'
                ? 'bg-blue-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Validate File (Dry Run)
          </button>
        </div>
      </div>
      </div>

      {/* Direct Key Notice */}
      <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Unique Business Key:</strong> Every member is written to Firestore using their exact{' '}
            <span className="font-mono font-bold">Membership Number</span> as the Document Identifier (e.g.{' '}
            <code className="bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded font-mono">
              /Users/NMO-GUJ-2026-008
            </code>
            ). Random characters and hashes are never generated.
          </span>
        </div>
      </div>

      {/* Clear Feedback Notification */}
      {clearFeedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{clearFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setClearFeedback(null)}
            className="text-slate-400 hover:text-slate-600 font-bold px-2 py-0.5 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center justify-between bg-white px-6 py-3 rounded-xl border border-slate-200 text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
              currentStep === 'upload' ? 'bg-red-700 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            1
          </span>
          <span className={currentStep === 'upload' ? 'font-bold text-slate-900' : 'text-slate-500'}>
            Upload File
          </span>
        </div>

        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />

        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
              currentStep === 'mapping'
                ? 'bg-red-700 text-white'
                : currentStep === 'preview' || currentStep === 'committing' || currentStep === 'complete'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            2
          </span>
          <span className={currentStep === 'mapping' ? 'font-bold text-slate-900' : 'text-slate-500'}>
            Field Mapping
          </span>
        </div>

        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />

        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
              currentStep === 'preview'
                ? 'bg-red-700 text-white'
                : currentStep === 'committing' || currentStep === 'complete'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            3
          </span>
          <span className={currentStep === 'preview' ? 'font-bold text-slate-900' : 'text-slate-500'}>
            Validation & Preview
          </span>
        </div>

        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />

        <div className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
              currentStep === 'complete' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-400'
            }`}
          >
            4
          </span>
          <span className={currentStep === 'complete' ? 'font-bold text-emerald-700' : 'text-slate-500'}>
            Commit to Firestore
          </span>
        </div>
      </div>

      {/* STEP 1: Upload CSV/XLSX */}
      {currentStep === 'upload' && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="max-w-xl mx-auto text-center space-y-2">
            <h3 className="text-lg font-black text-slate-900">
              Select Member Master Data File
            </h3>
            <p className="text-xs text-slate-500">
              Upload member database in <span className="font-semibold text-slate-700">.CSV</span>, <span className="font-semibold text-slate-700">.XLSX</span>, or <span className="font-semibold text-slate-700">.XLS</span> format.
            </p>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileUpload(f);
            }}
            className="border-2 border-dashed border-slate-300 hover:border-red-500 rounded-2xl p-10 text-center transition-all bg-slate-50/60 hover:bg-red-50/20 cursor-pointer flex flex-col items-center justify-center space-y-4"
          >
            <div className="p-4 bg-white rounded-2xl shadow-xs border border-slate-200">
              <Upload className="w-8 h-8 text-red-600 animate-pulse" />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-800">
                Drag and drop your member CSV or Excel file here
              </p>
              <p className="text-xs text-slate-400">
                Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
              </p>
            </div>

            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-md transition-colors cursor-pointer">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Browse File</span>
              <input
                type="file"
                accept=".csv, .xlsx, .xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
            </label>
          </div>

          {isReadingFile && (
            <div className="p-4 bg-slate-100 rounded-xl flex items-center justify-center gap-3 text-xs text-slate-700 font-semibold animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-red-600" />
              <span>Reading and parsing file records...</span>
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Firestore Schema Standards
            </span>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Every document will be created at <code className="font-mono bg-white px-1 py-0.5 rounded border text-red-700">/Users/{'{membershipNumber}'}</code> with clean uppercase formatting. No synthetic IDs or separate collections.
            </p>
          </div>
        </div>
      )}

      {/* STEP 2: Field Mapping */}
      {currentStep === 'mapping' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-black text-slate-900">
                Step 2: Map Columns to "Users" Schema
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                File: <span className="font-bold text-slate-800">{file?.name}</span> ({rawRows.length} rows, {rawHeaders.length} columns).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetMapping}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Auto</span>
              </button>
              <button
                type="button"
                onClick={handleSaveDefaultMapping}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-blue-600" />
                <span>Save as Default</span>
              </button>
            </div>
          </div>

          {savedMappingFeedback && (
            <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{savedMappingFeedback}</span>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Detected Column in File</th>
                  <th className="p-3">Sample Value (Row 1)</th>
                  <th className="p-3">Maps To Firestore "Users" Field</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rawHeaders.map((header) => {
                  const currentMapped = columnMapping[header] || 'ignore';
                  const sampleVal = rawRows[0] ? String(rawRows[0][header] || '') : '';
                  const isPrimaryKey = currentMapped === 'membershipNumber';

                  return (
                    <tr
                      key={header}
                      className={`hover:bg-slate-50 transition-colors ${
                        isPrimaryKey ? 'bg-red-50/40' : ''
                      }`}
                    >
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                        <FileCheck className="w-3.5 h-3.5 text-slate-400" />
                        <span>{header}</span>
                      </td>

                      <td className="p-3 font-mono text-[11px] text-slate-600 max-w-[200px] truncate">
                        {sampleVal || <span className="text-slate-300 italic">(empty)</span>}
                      </td>

                      <td className="p-3">
                        <select
                          value={currentMapped}
                          onChange={(e) => {
                            setColumnMapping({
                              ...columnMapping,
                              [header]: e.target.value as any
                            });
                          }}
                          className={`w-full max-w-xs px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-red-500 cursor-pointer ${
                            isPrimaryKey
                              ? 'border-red-400 bg-red-50 text-red-900 font-bold'
                              : currentMapped === 'ignore'
                              ? 'border-slate-200 text-slate-400 bg-slate-50'
                              : 'border-slate-300 text-slate-800 bg-white'
                          }`}
                        >
                          {MASTER_FIELDS.map((mf) => (
                            <option key={mf.key} value={mf.key}>
                              {mf.label} {mf.required ? '★ (Required Key)' : ''}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-3 text-center">
                        {currentMapped === 'membershipNumber' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                            <Fingerprint className="w-3 h-3 text-red-700" />
                            Document ID
                          </span>
                        ) : currentMapped === 'ignore' ? (
                          <span className="text-[10px] text-slate-400 italic">Ignored</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px] font-semibold">
                            <Check className="w-3.5 h-3.5" /> Mapped
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCurrentStep('upload')}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs rounded-xl cursor-pointer"
            >
              Back to Upload
            </button>

            <button
              type="button"
              onClick={runValidationAndDiffAnalysis}
              className="flex items-center gap-2 px-6 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
            >
              <span>Validate & Preview Differences</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Validation & Preview */}
      {currentStep === 'preview' && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Rows
              </span>
              <span className="text-xl font-black text-slate-900 mt-1 block">
                {summaryMetrics.totalRows}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">
                New Documents
              </span>
              <span className="text-xl font-black text-emerald-700 mt-1 block">
                +{summaryMetrics.newCount}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-blue-200 bg-blue-50/20 shadow-2xs">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">
                Updated
              </span>
              <span className="text-xl font-black text-blue-700 mt-1 block">
                ↻ {summaryMetrics.updatedCount}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Unchanged
              </span>
              <span className="text-xl font-black text-slate-700 mt-1 block">
                = {summaryMetrics.unchangedCount}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/20 shadow-2xs">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                Duplicates
              </span>
              <span className="text-xl font-black text-amber-700 mt-1 block">
                ⚠ {summaryMetrics.duplicateCount}
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/20 shadow-2xs">
              <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
                Invalid
              </span>
              <span className="text-xl font-black text-rose-700 mt-1 block">
                ✖ {summaryMetrics.invalidCount}
              </span>
            </div>

            {mode === 'replace_sync' ? (
              <div className="bg-white p-3.5 rounded-xl border border-purple-200 bg-purple-50/20 shadow-2xs">
                <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">
                  Deactivated
                </span>
                <span className="text-xl font-black text-purple-700 mt-1 block">
                  ✕ {summaryMetrics.missingCount}
                </span>
              </div>
            ) : (
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 opacity-60">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Missing (N/A)
                </span>
                <span className="text-xs font-semibold text-slate-500 mt-2 block">
                  Preserved
                </span>
              </div>
            )}
          </div>

          {/* Duplicates Warning */}
          {summaryMetrics.duplicateCount > 0 && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-xs text-amber-900 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                <h4 className="font-bold text-sm text-amber-950">
                  Duplicate Membership Numbers Detected!
                </h4>
              </div>
              <p className="text-[11px] leading-relaxed">
                Found {duplicateFileRecords.length} duplicate Membership Number(s). In Firestore, Membership Numbers serve as the unique document identifier, so duplicates within the file cannot be written simultaneously.
              </p>
            </div>
          )}

          {/* Invalid Records Notice */}
          {summaryMetrics.invalidCount > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-950">
                    {summaryMetrics.invalidCount} Validation Error(s)
                  </h4>
                  <p className="text-[11px] text-rose-800">
                    Records with missing primary keys, bad email formats, or short phone numbers.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadErrorReport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-bold text-[11px] shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Error Report (CSV)</span>
              </button>
            </div>
          )}

          {/* Action Confirmation Banner */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Document Target Path
              </span>
              <h4 className="text-base font-black text-slate-900 mt-0.5 flex items-center gap-2">
                <code className="font-mono text-red-700 bg-red-50 px-2 py-0.5 rounded text-sm">
                  Users/{'{membershipNumber}'}
                </code>
              </h4>
              <p className="text-xs text-slate-500">
                Ready to commit {summaryMetrics.newCount + summaryMetrics.updatedCount} documents using Membership IDs as document keys.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentStep('mapping')}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold cursor-pointer"
              >
                Adjust Mapping
              </button>

              {mode === 'validate_only' ? (
                <button
                  type="button"
                  onClick={handleCommitToFirestore}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Complete Validation Audit</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  className={`flex items-center gap-2 px-6 py-2.5 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer ${
                    mode === 'replace_sync'
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
                      : 'bg-red-700 hover:bg-red-800 shadow-red-200'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  <span>
                    {mode === 'replace_sync' ? 'Confirm Master Replacement' : 'Confirm Import & Write Documents'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Interactive Inspection Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPreviewTab('all')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    previewTab === 'all' ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  All Rows ({recordDiffs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('new')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    previewTab === 'new' ? 'bg-emerald-700 text-white font-bold' : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  New Documents (+{summaryMetrics.newCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('updated')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    previewTab === 'updated' ? 'bg-blue-700 text-white font-bold' : 'text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  Updated Diff (↻ {summaryMetrics.updatedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('unchanged')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    previewTab === 'unchanged' ? 'bg-slate-700 text-white font-bold' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Unchanged (= {summaryMetrics.unchangedCount})
                </button>
                {mode === 'replace_sync' && (
                  <button
                    type="button"
                    onClick={() => setPreviewTab('missing')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      previewTab === 'missing' ? 'bg-purple-700 text-white font-bold' : 'text-purple-700 hover:bg-purple-50'
                    }`}
                  >
                    Deactivating (✕ {summaryMetrics.missingCount})
                  </button>
                )}
                {summaryMetrics.duplicateCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setPreviewTab('duplicates')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      previewTab === 'duplicates' ? 'bg-amber-600 text-white font-bold' : 'text-amber-700 hover:bg-amber-50'
                    }`}
                  >
                    Duplicates (⚠ {summaryMetrics.duplicateCount})
                  </button>
                )}
                {summaryMetrics.invalidCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setPreviewTab('errors')}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      previewTab === 'errors' ? 'bg-rose-700 text-white font-bold' : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    Errors (✖ {summaryMetrics.invalidCount})
                  </button>
                )}
              </div>

              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            {/* Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-12 text-center">Row</th>
                    <th className="p-3">Firestore Document ID (Path)</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Action Status</th>
                    <th className="p-3">Field Differences / Notes</th>
                    <th className="p-3 text-center">Inspect Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedDiffs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No records match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    displayedDiffs.map((record) => {
                      const isExpanded = !!expandedRows[record.membershipNumber];

                      return (
                        <React.Fragment key={`${record.rowNumber}_${record.membershipNumber}`}>
                          <tr
                            className={`hover:bg-slate-50 transition-colors ${
                              record.status === 'updated'
                                ? 'bg-blue-50/20'
                                : record.status === 'new'
                                ? 'bg-emerald-50/20'
                                : record.status === 'invalid'
                                ? 'bg-rose-50/20'
                                : record.status === 'duplicate'
                                ? 'bg-amber-50/20'
                                : ''
                            }`}
                          >
                            <td className="p-3 text-center font-mono text-slate-400 text-[11px]">
                              {record.rowNumber}
                            </td>

                            <td className="p-3 font-mono font-bold text-slate-900">
                              <span className="text-slate-400 font-normal">Users/</span>
                              <span className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                {record.membershipNumber}
                              </span>
                            </td>

                            <td className="p-3 font-semibold text-slate-800">
                              {record.name}
                            </td>

                            <td className="p-3">
                              {record.status === 'new' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  + NEW DOCUMENT
                                </span>
                              )}
                              {record.status === 'updated' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  ↻ {record.diffs.length} FIELDS CHANGED
                                </span>
                              )}
                              {record.status === 'unchanged' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                  = UNCHANGED
                                </span>
                              )}
                              {record.status === 'duplicate' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  ⚠ DUPLICATE KEY
                                </span>
                              )}
                              {record.status === 'invalid' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  ✖ INVALID
                                </span>
                              )}
                            </td>

                            <td className="p-3 max-w-md">
                              {record.status === 'updated' && (
                                <div className="flex flex-wrap gap-1 text-[10px]">
                                  {record.diffs.map((d) => (
                                    <span
                                      key={d.field}
                                      className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold"
                                    >
                                      {d.fieldLabel}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {record.status === 'new' && (
                                <span className="text-[11px] text-slate-500">
                                  Will create Users/{record.membershipNumber} directly
                                </span>
                              )}
                              {record.status === 'unchanged' && (
                                <span className="text-[11px] text-slate-400">
                                  Identical to current Firestore record
                                </span>
                              )}
                              {record.errors.length > 0 && (
                                <span className="text-[11px] text-rose-600 font-medium">
                                  {record.errors.join('; ')}
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-center">
                              {record.status === 'updated' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedRows({
                                      ...expandedRows,
                                      [record.membershipNumber]: !isExpanded
                                    });
                                  }}
                                  className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                                  title="View Field-Level Diff"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-blue-600" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </button>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </tr>

                          {/* FIELD-LEVEL DIFF ACCORDION */}
                          {isExpanded && record.status === 'updated' && (
                            <tr className="bg-blue-50/40">
                              <td colSpan={6} className="p-4 border-y border-blue-200">
                                <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-2xs space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h5 className="font-bold text-xs text-blue-900 flex items-center gap-1.5">
                                      <ArrowDownUp className="w-3.5 h-3.5 text-blue-600" />
                                      <span>
                                        Field Changes for Users/{record.membershipNumber} ({record.name})
                                      </span>
                                    </h5>
                                    <span className="text-[10px] text-slate-500">
                                      System fields (role, uid, auth) are strictly protected.
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 divide-y divide-slate-100 text-xs">
                                    {record.diffs.map((diff) => (
                                      <div
                                        key={diff.field}
                                        className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                      >
                                        <span className="font-bold text-slate-700 min-w-[160px]">
                                          {diff.fieldLabel}:
                                        </span>
                                        <div className="flex items-center gap-3 flex-1 font-mono text-[11px]">
                                          <div className="flex-1 p-1.5 bg-rose-50 border border-rose-200 rounded text-rose-800">
                                            <span className="text-[9px] font-bold text-rose-500 block uppercase">
                                              Old (Firestore)
                                            </span>
                                            <span>{diff.oldValue}</span>
                                          </div>
                                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                          <div className="flex-1 p-1.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800">
                                            <span className="text-[9px] font-bold text-emerald-600 block uppercase">
                                              New (Uploaded)
                                            </span>
                                            <span className="font-bold">{diff.newValue}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Committing Progress */}
      {currentStep === 'committing' && (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-xs text-center space-y-6 max-w-lg mx-auto">
          <div className="p-4 bg-red-50 text-red-700 rounded-full w-16 h-16 mx-auto flex items-center justify-center animate-pulse">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-black text-slate-900">
              Writing Documents to Cloud Firestore...
            </h3>
            <p className="text-xs text-slate-500 font-mono">
              Writing directly to Users/{'{membershipNumber}'} in 400-op atomic batches.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono font-bold text-slate-700">
              <span>Progress:</span>
              <span>
                {progress.processed} / {progress.total || summaryMetrics.newCount + summaryMetrics.updatedCount}
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
              <div
                className="bg-red-700 h-full transition-all duration-300"
                style={{
                  width: `${
                    progress.total > 0
                      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
                      : 50
                  }%`
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: Complete & Final Report */}
      {currentStep === 'complete' && commitResult && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6 max-w-2xl mx-auto">
          <div className="text-center space-y-2">
            <div className="p-4 bg-emerald-100 text-emerald-700 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900">
              {mode === 'validate_only'
                ? 'File Integrity Validation Complete'
                : 'Documents Written Directly to Firestore Users Collection'}
            </h3>
            <p className="text-xs text-slate-500">
              {mode === 'validate_only'
                ? 'All syntax, uniqueness, and schema checks passed without writing changes.'
                : 'All member records committed with Membership IDs directly as Firestore Document IDs.'}
            </p>
          </div>

          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
              Execution Breakdown
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block">NEW DOCUMENTS</span>
                <span className="text-lg font-black text-emerald-700">+{commitResult.added}</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block">UPDATED</span>
                <span className="text-lg font-black text-blue-700">↻ {commitResult.updated}</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block">UNCHANGED</span>
                <span className="text-lg font-black text-slate-700">= {commitResult.unchanged}</span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block">DEACTIVATED</span>
                <span className="text-lg font-black text-purple-700">✕ {commitResult.deactivated}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleResetWizard}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
            >
              Import / Validate Another File
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 border border-slate-200 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  mode === 'replace_sync' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                }`}
              >
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div>
                <h4 className="text-lg font-black text-slate-900">
                  {mode === 'replace_sync'
                    ? 'Confirm Master Data Replacement'
                    : 'Confirm Batch Firestore Write'}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Documents will be written at <code className="font-mono text-red-700 font-bold">Users/{'{membershipNumber}'}</code> directly.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2 font-mono">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600 font-sans">New Documents:</span>
                <span className="font-bold text-emerald-700">+{summaryMetrics.newCount}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600 font-sans">Updated Documents:</span>
                <span className="font-bold text-blue-700">↻ {summaryMetrics.updatedCount}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600 font-sans">Unchanged Documents:</span>
                <span className="font-bold text-slate-700">= {summaryMetrics.unchangedCount}</span>
              </div>
              {mode === 'replace_sync' && (
                <div className="flex justify-between py-1 text-purple-800 font-bold">
                  <span className="font-sans">Deactivated (Missing from file):</span>
                  <span>✕ {summaryMetrics.missingCount}</span>
                </div>
              )}
            </div>

            {mode === 'replace_sync' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
                <span className="font-bold text-amber-950 block">Pre-Replacement Backup</span>
                <p className="text-[11px] text-amber-800">
                  Download a recoverable snapshot backup of the current database before replacing.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Backup (JSON)</span>
                </button>
                {backupDownloadedNotice && (
                  <span className="text-emerald-700 font-bold text-[10px] block">
                    ✓ Backup created and downloaded successfully!
                  </span>
                )}
              </div>
            )}

            {mode === 'replace_sync' && (
              <div className="space-y-1.5 text-xs">
                <label className="font-bold text-slate-800">
                  Type <span className="font-mono text-red-700">CONFIRM REPLACE</span> to execute:
                </label>
                <input
                  type="text"
                  placeholder="CONFIRM REPLACE"
                  value={confirmInputText}
                  onChange={(e) => setConfirmInputText(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={mode === 'replace_sync' && confirmInputText !== 'CONFIRM REPLACE'}
                onClick={handleCommitToFirestore}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-md transition-all cursor-pointer ${
                  mode === 'replace_sync'
                    ? confirmInputText === 'CONFIRM REPLACE'
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-red-700 hover:bg-red-800 shadow-red-200'
                }`}
              >
                CONFIRM IMPORT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR NON-ADMIN USERS CONFIRMATION MODAL */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-rose-100 text-rose-800 shrink-0">
                <Trash2 className="w-6 h-6 text-rose-700" />
              </div>

              <div>
                <h4 className="text-lg font-black text-slate-900">
                  Clear Non-Admin Member Records
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Permanently deletes standard member records from Cloud Firestore while preserving all Super Admin and Administrator accounts.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2.5">
              <div className="flex justify-between py-1 border-b border-slate-200 font-mono">
                <span className="text-slate-600 font-sans">Member Records to Delete:</span>
                <span className="font-bold text-rose-700">{nonAdminCount} members</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200 font-mono">
                <span className="text-slate-600 font-sans">Protected Admin Accounts (Preserved):</span>
                <span className="font-bold text-emerald-700">
                  {users.length - nonAdminCount} accounts (Super Admin, State Admin, Prant Admins)
                </span>
              </div>
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  A JSON backup of the current database will be automatically created before deleting.
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-slate-800">
                Type <span className="font-mono text-red-700">CLEAR</span> or <span className="font-mono text-red-700">CLEAR MEMBERS</span> to confirm deletion:
              </label>
              <input
                type="text"
                placeholder="Type CLEAR"
                value={clearInputText}
                onChange={(e) => setClearInputText(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-red-500 uppercase"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearingUsers}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={(!['CLEAR', 'CLEAR MEMBERS'].includes(clearInputText.trim().toUpperCase())) || isClearingUsers}
                onClick={handleExecuteClearNonAdmin}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-md transition-all cursor-pointer ${
                  ['CLEAR', 'CLEAR MEMBERS'].includes(clearInputText.trim().toUpperCase()) && !isClearingUsers
                    ? 'bg-rose-700 hover:bg-rose-800 shadow-rose-200'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                {isClearingUsers ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Purging from Firestore...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Purge Non-Admin Users</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
