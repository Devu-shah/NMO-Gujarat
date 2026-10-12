export type PrantType = 'Gujarat' | 'Saurashtra' | 'All';

export type UserRole = 'member' | 'city_admin' | 'prant_admin' | 'state_admin' | 'super_admin';

export type EventTier = 'City' | 'Branch' | 'State' | 'National';

export type AccountStatus = 'Active' | 'Inactive' | 'Pending';
export type MemberStatus = AccountStatus;

/**
 * Top-level Collection: "Users"
 * Document ID: {membershipNumber}
 */
export interface NMOUserRecord {
  membershipNumber: string; // Document ID: e.g. "NMO-GUJ-2024-001"
  name: string;
  bloodGroup?: string;
  medicalCollege?: string;
  dob?: string;
  email: string;
  gender?: string;
  memberOn?: string;
  studentMembershipValidTill?: string;
  address?: string;
  pincode?: string;
  nmoState?: string;
  phone?: string;
  prant: PrantType;
  city?: string;
  qualifications?: string;
  refMembershipNumber?: string;
  refPerson?: string;
  refPersonPhone?: string;
  registrationNumber?: string;
  specialization?: string;
  stateSecretaryEmail?: string;
  applicationFee?: string;

  // System & RBAC fields
  uid?: string;
  role: UserRole;
  accountStatus: AccountStatus;
  profilePhoto?: string;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
  hasCustomPassword?: boolean;
  customPassword?: string;

  // Compatibility helper
  status?: AccountStatus;
  photoUrl?: string;
  displayName?: string;
}

// Aliases for compatibility
export type NMOMember = NMOUserRecord;
export type NMOUser = NMOUserRecord;

export type EventStatus =
  | 'Draft'
  | 'Published'
  | 'Registration Open'
  | 'Registration Closed'
  | 'Completed'
  | 'Cancelled';

export type EventFieldType =
  | 'Registered/Not Registered'
  | 'Approved/Rejected'
  | 'Attended/Not Attended'
  | 'Yes/No'
  | 'Text'
  | 'Number'
  | 'Date';

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export type AttendanceStatus = 'Attended' | 'Not Attended' | 'Pending';
export type RegistrationStatus = ApprovalStatus;

export interface EventParticipant {
  membershipNumber: string;
  uid?: string;
  name: string;
  email: string;
  phone?: string;
  medicalCollege?: string;
  prant: PrantType;
  registrationDate: string;
  registeredAt?: string;
  approvalStatus: ApprovalStatus;
  attendanceStatus: AttendanceStatus;
  approvedBy?: string;
  approvedAt?: string;
  attendanceMarkedBy?: string;
  attendanceMarkedAt?: string;
}

/**
 * Top-level Collection: "Events"
 * Document ID: {eventId}
 */
export interface NMOEvent {
  eventId: string;
  title: string;
  description: string;
  eventImage?: string;
  image?: string; // Compatibility
  date: string;
  startTime?: string;
  endTime?: string;
  venue: string;
  city: string;
  state: string;
  prant: PrantType;
  tier?: EventTier;
  branch?: string;
  registrationStart?: string;
  registrationEnd?: string;
  maximumParticipants?: number;
  registrationRequired: boolean;
  status: EventStatus;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;

  // Google Drive folder integration
  driveFolderId?: string;
  driveFolderLink?: string;

  // Embedded participants array
  participants: EventParticipant[];

  // Dynamic column in admin table
  isDynamicMemberField?: boolean;
  fieldDisplayName?: string;
  fieldType?: string;
}

export interface NMOEventRegistration extends EventParticipant {
  registrationId: string;
  eventId: string;
  registrationStatus: ApprovalStatus;
  customFieldValue?: string;
}

export interface NMOAnnouncement {
  id: string;
  title: string;
  message: string;
  image?: string;
  targetAudience: 'All' | 'Members' | 'Admins';
  prant: PrantType;
  active: boolean;
  expiryDate?: string;
  createdAt: string;
}

export interface NMOImportLog {
  id: string;
  filename: string;
  totalRecords: number;
  newRecords: number;
  updatedRecords: number;
  unchangedRecords?: number;
  duplicateRecords: number;
  invalidRecords: number;
  deactivatedRecords?: number;
  importedBy: string;
  importedAt: string;
  mode: 'add_update' | 'replace_sync' | 'validate_only' | 'import' | 'replace';
  result?: 'Success' | 'Completed with warnings' | 'Failed' | 'Validated';
  reportDetails?: string;
}

export interface NMOAuditLog {
  id: string;
  action: string;
  performedBy: string;
  targetType: string;
  targetId: string;
  details: string;
  timestamp: string;
}
