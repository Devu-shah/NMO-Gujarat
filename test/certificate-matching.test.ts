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
});
