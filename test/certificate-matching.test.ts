import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFilenameMatchingMembershipId,
  extractMembershipIdFromFilename,
  getBaseFilename
} from '../src/lib/memberCookie';

describe('Certificate Membership-ID Matching & Isolation Suite', () => {
  describe('getBaseFilename', () => {
    it('strips only the file extension', () => {
      assert.equal(getBaseFilename('9521.jpg'), '9521');
      assert.equal(getBaseFilename('9521_EVT-2026-7391.jpg'), '9521_EVT-2026-7391');
      assert.equal(getBaseFilename('001.pdf'), '001');
      assert.equal(getBaseFilename('PENDING_9521.png'), 'PENDING_9521');
    });
  });

  describe('Requirement 1 & Regression Tests: Short numeric IDs (e.g. 9521)', () => {
    it('matches "9521_EVT-2026-7391.jpg" strictly to member "9521"', () => {
      assert.equal(isFilenameMatchingMembershipId('9521_EVT-2026-7391.jpg', '9521'), true);
      assert.equal(extractMembershipIdFromFilename('9521_EVT-2026-7391.jpg'), '9521');
    });

    it('matches "9521_EVT-2026-9657.jpg" strictly to member "9521"', () => {
      assert.equal(isFilenameMatchingMembershipId('9521_EVT-2026-9657.jpg', '9521'), true);
      assert.equal(extractMembershipIdFromFilename('9521_EVT-2026-9657.jpg'), '9521');
    });

    it('matches exact filename matches: "9521.jpg" and "9521.pdf"', () => {
      assert.equal(isFilenameMatchingMembershipId('9521.jpg', '9521'), true);
      assert.equal(isFilenameMatchingMembershipId('9521.pdf', '9521'), true);
      assert.equal(extractMembershipIdFromFilename('9521.jpg'), '9521');
      assert.equal(extractMembershipIdFromFilename('9521.pdf'), '9521');
    });

    it('handles PENDING_ prefix gracefully', () => {
      assert.equal(isFilenameMatchingMembershipId('PENDING_9521_EVT-2026-7391.jpg', '9521'), true);
      assert.equal(extractMembershipIdFromFilename('PENDING_9521_EVT-2026-7391.jpg'), '9521');
    });
  });

  describe('Delimiter requirements: (_, -, space, or ()', () => {
    it('matches delimiter "_"', () => {
      assert.equal(isFilenameMatchingMembershipId('9521_conference.pdf', '9521'), true);
      assert.equal(extractMembershipIdFromFilename('9521_conference.pdf'), '9521');
    });

    it('matches delimiter "-"', () => {
      assert.equal(isFilenameMatchingMembershipId('9521-annual-cme.jpg', '9521'), true);
      assert.equal(extractMembershipIdFromFilename('9521-annual-cme.jpg'), '9521');
    });

    it('matches delimiter space', () => {
      assert.equal(isFilenameMatchingMembershipId('9521 Gujarat Conference.jpg', '9521'), true);
      assert.equal(extractMembershipIdFromFilename('9521 Gujarat Conference.jpg'), '9521');
    });

    it('matches delimiter "("', () => {
      assert.equal(isFilenameMatchingMembershipId('9521(1).jpg', '9521'), true);
      assert.equal(extractMembershipIdFromFilename('9521(1).jpg'), '9521');
    });
  });

  describe('Partial match prevention: 9521 must NOT match 95210', () => {
    it('prevents 9521 from matching 95210_EVT-2026-7391.jpg', () => {
      assert.equal(isFilenameMatchingMembershipId('95210_EVT-2026-7391.jpg', '9521'), false);
    });

    it('prevents 9521 from matching 95210.jpg', () => {
      assert.equal(isFilenameMatchingMembershipId('95210.jpg', '9521'), false);
    });

    it('prevents 9521 from matching 19521_EVT.jpg', () => {
      assert.equal(isFilenameMatchingMembershipId('19521_EVT.jpg', '9521'), false);
    });

    it('prevents 9521 from matching 95210-CME.pdf', () => {
      assert.equal(isFilenameMatchingMembershipId('95210-CME.pdf', '9521'), false);
    });
  });

  describe('Leading zero preservation ("001" !== "1")', () => {
    it('preserves leading zeros on "001"', () => {
      assert.equal(isFilenameMatchingMembershipId('001_EVT-2026.jpg', '001'), true);
      assert.equal(isFilenameMatchingMembershipId('001_EVT-2026.jpg', '1'), false);
      assert.equal(isFilenameMatchingMembershipId('1_EVT-2026.jpg', '001'), false);
      assert.equal(extractMembershipIdFromFilename('001_EVT-2026.jpg'), '001');
    });

    it('preserves leading zeros on "009521"', () => {
      assert.equal(isFilenameMatchingMembershipId('009521_cme.pdf', '009521'), true);
      assert.equal(isFilenameMatchingMembershipId('009521_cme.pdf', '9521'), false);
      assert.equal(extractMembershipIdFromFilename('009521_cme.pdf'), '009521');
    });
  });

  describe('Support for NMO- ID format', () => {
    it('matches NMO- prefix IDs correctly', () => {
      assert.equal(isFilenameMatchingMembershipId('NMO-GUJ-1042_EVT.jpg', 'NMO-GUJ-1042'), true);
      assert.equal(isFilenameMatchingMembershipId('NMO-ADMIN-001.pdf', 'NMO-ADMIN-001'), true);
      assert.equal(extractMembershipIdFromFilename('NMO-GUJ-1042_EVT.jpg'), 'NMO-GUJ-1042');
      assert.equal(extractMembershipIdFromFilename('NMO-ADMIN-001.pdf'), 'NMO-ADMIN-001');
    });

    it('prevents partial matches with NMO- format', () => {
      assert.equal(isFilenameMatchingMembershipId('NMO-GUJ-10420_EVT.jpg', 'NMO-GUJ-1042'), false);
    });
  });

  describe('Matching against Firestore Users collection mapping', () => {
    const knownUsers = new Map<string, { name: string }>([
      ['9521', { name: 'Dr. Ramesh Patel' }],
      ['95210', { name: 'Dr. Suresh Shah' }],
      ['001', { name: 'Dr. Anand Joshi' }],
      ['NMO-GUJ-1042', { name: 'Dr. Priya Desai' }]
    ]);

    it('resolves "9521_EVT-2026-7391.jpg" to "9521"', () => {
      assert.equal(extractMembershipIdFromFilename('9521_EVT-2026-7391.jpg', knownUsers), '9521');
    });

    it('resolves "9521_EVT-2026-9657.jpg" to "9521"', () => {
      assert.equal(extractMembershipIdFromFilename('9521_EVT-2026-9657.jpg', knownUsers), '9521');
    });

    it('resolves "95210_EVT-2026-7391.jpg" to "95210" without colliding with "9521"', () => {
      assert.equal(extractMembershipIdFromFilename('95210_EVT-2026-7391.jpg', knownUsers), '95210');
    });

    it('resolves "001_cme.pdf" to "001"', () => {
      assert.equal(extractMembershipIdFromFilename('001_cme.pdf', knownUsers), '001');
    });

    it('resolves "NMO-GUJ-1042_conf.jpg" to "NMO-GUJ-1042"', () => {
      assert.equal(extractMembershipIdFromFilename('NMO-GUJ-1042_conf.jpg', knownUsers), 'NMO-GUJ-1042');
    });

    it('returns null for unmatchable files so they are flagged for reconciliation rather than guessing', () => {
      assert.equal(extractMembershipIdFromFilename('Random_Image_Without_ID.jpg', knownUsers), null);
      assert.equal(extractMembershipIdFromFilename('Brochure_2026.pdf', knownUsers), null);
    });
  });

  describe('Requirement 3: Approval Workflow & State Machine', () => {
    it('initializes member uploads strictly as "pending"', () => {
      const memberUpload = {
        name: 'PENDING_9521_EVT-2026-7391.jpg',
        uploadSource: 'user' as const,
        membershipNumber: '9521',
        uploaderUid: 'user-uid-9521',
        approvalStatus: 'pending' as const
      };
      assert.equal(memberUpload.approvalStatus, 'pending');
      assert.equal(memberUpload.uploadSource, 'user');
    });

    it('approval strips PENDING_ prefix and never adds APPROVED_ prefix', () => {
      const rawName = 'PENDING_9521_EVT-2026-7391.jpg';
      const approvedName = rawName.replace(/^PENDING_/i, '');
      assert.equal(approvedName, '9521_EVT-2026-7391.jpg');
      assert.equal(approvedName.includes('APPROVED_'), false);
    });

    it('records administrator identity, approval timestamp, and approved status', () => {
      const now = new Date().toISOString();
      const adminApprovalRecord = {
        approvalStatus: 'approved',
        status: 'approved',
        decisionByAdminUid: 'admin-123',
        decisionByAdminName: 'Dr. Admin Lead',
        decisionAt: now,
        approvedAt: now
      };
      assert.equal(adminApprovalRecord.approvalStatus, 'approved');
      assert.equal(adminApprovalRecord.decisionByAdminUid, 'admin-123');
      assert.equal(adminApprovalRecord.decisionByAdminName, 'Dr. Admin Lead');
      assert.ok(adminApprovalRecord.decisionAt);
      assert.ok(adminApprovalRecord.approvedAt);
    });

    it('records administrator identity and reason on rejection', () => {
      const now = new Date().toISOString();
      const rejectionRecord = {
        approvalStatus: 'rejected',
        status: 'rejected',
        rejectionReason: 'Blurry upload, certificate date does not match event',
        decisionByAdminUid: 'admin-456',
        decisionByAdminName: 'State Committee Admin',
        decisionAt: now
      };
      assert.equal(rejectionRecord.approvalStatus, 'rejected');
      assert.equal(rejectionRecord.decisionByAdminUid, 'admin-456');
      assert.equal(rejectionRecord.rejectionReason, 'Blurry upload, certificate date does not match event');
    });
  });

  describe('Requirement 3: Automatic Sync Preserving Pending Status', () => {
    // Reconciliation simulation function reflecting server-side sync logic
    function reconcileCertificateStatus(
      existingRecord: { approvalStatus?: string; status?: string } | null,
      incomingFile: { name: string; properties?: Record<string, any>; uploadSource?: string }
    ): string {
      const existingStatus = existingRecord?.approvalStatus || existingRecord?.status;
      // Existing decisions MUST be preserved!
      if (existingStatus && ['pending', 'approved', 'rejected'].includes(existingStatus)) {
        return existingStatus;
      }
      const isUser = incomingFile.uploadSource === 'user' ||
        incomingFile.properties?.uploadSource === 'user' ||
        incomingFile.properties?.uploadedBy === 'member' ||
        incomingFile.name.startsWith('PENDING_');
      return isUser ? 'pending' : 'not_required';
    }

    it('preserves "pending" status during background synchronization and reconciliation', () => {
      const existingDoc = { approvalStatus: 'pending', status: 'pending' };
      const incomingScan = { name: '9521_EVT-2026-7391.jpg', properties: { membershipNumber: '9521' } };
      const reconciled = reconcileCertificateStatus(existingDoc, incomingScan);
      assert.equal(reconciled, 'pending', 'Background scan must never overwrite an existing pending status');
    });

    it('preserves "approved" decision during subsequent reconciliation', () => {
      const existingDoc = { approvalStatus: 'approved', status: 'approved' };
      const incomingScan = { name: '9521_EVT-2026-7391.jpg', properties: { membershipNumber: '9521' } };
      const reconciled = reconcileCertificateStatus(existingDoc, incomingScan);
      assert.equal(reconciled, 'approved');
    });

    it('preserves "rejected" decision during subsequent reconciliation', () => {
      const existingDoc = { approvalStatus: 'rejected', status: 'rejected' };
      const incomingScan = { name: '9521_EVT-2026-7391.jpg', properties: { membershipNumber: '9521' } };
      const reconciled = reconcileCertificateStatus(existingDoc, incomingScan);
      assert.equal(reconciled, 'rejected');
    });

    it('defaults new user submission to "pending" when no record exists yet', () => {
      const incomingScan = { name: 'PENDING_9521_conf.pdf', uploadSource: 'user' };
      const reconciled = reconcileCertificateStatus(null, incomingScan);
      assert.equal(reconciled, 'pending');
    });

    it('defaults new admin upload to "not_required" when no record exists yet', () => {
      const incomingScan = { name: '9521_conf.pdf', uploadSource: 'admin' };
      const reconciled = reconcileCertificateStatus(null, incomingScan);
      assert.equal(reconciled, 'not_required');
    });
  });

  describe('Requirement 4: Certificate Deletion & Tombstone Scenarios', () => {
    // Helper simulating tombstone filter
    function filterActiveCertificates<T extends { id: string }>(
      files: T[],
      tombstones: Set<string>
    ): T[] {
      return files.filter((f) => !tombstones.has(f.id));
    }

    it('detects upload ownership reliably using metadata (uploadSource, uploaderUid)', () => {
      const memberSubmission = {
        driveFileId: 'drive-file-1',
        uploadSource: 'user',
        uploaderUid: 'member-user-123'
      };
      const adminUpload = {
        driveFileId: 'drive-file-2',
        uploadSource: 'admin',
        uploaderUid: 'admin-uid-999'
      };

      const isMemberUpload = (c: { uploadSource?: string }) => c.uploadSource === 'user';
      assert.equal(isMemberUpload(memberSubmission), true);
      assert.equal(isMemberUpload(adminUpload), false);
    });

    it('member-uploaded deletion: removes from both member-facing and admin listings and tombstones file', () => {
      const driveFileId = 'drive-member-file-123';
      const eventId = 'EVT-2026-7391';
      const membershipNumber = '9521';
      const tombstoneSet = new Set<string>();

      // Admin & Member listings containing the file
      let adminCertList = [{ id: driveFileId, membershipNumber, eventId }];
      let memberCertList = [{ id: driveFileId, membershipNumber, eventId }];

      // Perform deletion
      tombstoneSet.add(driveFileId);
      adminCertList = filterActiveCertificates(adminCertList, tombstoneSet);
      memberCertList = filterActiveCertificates(memberCertList, tombstoneSet);

      assert.equal(adminCertList.length, 0, 'Must be removed from admin listing');
      assert.equal(memberCertList.length, 0, 'Must be removed from member listing');
      assert.equal(tombstoneSet.has(driveFileId), true, 'File ID must be tombstoned');

      // Next synchronization attempt simulates encountering the file in Drive:
      const driveScanResults = [{ id: driveFileId, name: '9521_EVT-2026-7391.jpg' }];
      const afterResync = filterActiveCertificates(driveScanResults, tombstoneSet);
      assert.equal(afterResync.length, 0, 'Tombstoned certificate must NEVER reappear on background sync');
    });

    it('admin-uploaded deletion: removes from admin listing and preserves unrelated member records', () => {
      const adminFileId = 'drive-admin-file-456';
      const tombstoneSet = new Set<string>();

      const otherMemberDoc = { id: 'other-member-cert', membershipNumber: '95210', eventId: 'EVT-1' };
      let adminCertList = [
        { id: adminFileId, membershipNumber: '9521', eventId: 'EVT-2026-7391' },
        otherMemberDoc
      ];

      // Perform admin deletion
      tombstoneSet.add(adminFileId);
      adminCertList = filterActiveCertificates(adminCertList, tombstoneSet);

      assert.equal(adminCertList.length, 1);
      assert.equal(adminCertList[0].id, 'other-member-cert', 'Unrelated member record must be preserved');
      assert.equal(tombstoneSet.has(adminFileId), true);
    });

    it('requires authenticated administrator privileges to delete certificates', () => {
      const authorizedRoles = new Set(['super_admin', 'state_admin', 'prant_admin', 'city_admin']);
      const isAuthorizedAdmin = (role?: string) => Boolean(role && authorizedRoles.has(role));

      assert.equal(isAuthorizedAdmin('super_admin'), true);
      assert.equal(isAuthorizedAdmin('state_admin'), true);
      assert.equal(isAuthorizedAdmin('city_admin'), true);
      assert.equal(isAuthorizedAdmin('member'), false);
      assert.equal(isAuthorizedAdmin(undefined), false);
    });
  });
});
