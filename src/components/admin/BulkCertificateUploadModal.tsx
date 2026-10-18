import React, { useState, useMemo } from 'react';
import {
  Upload,
  X,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Sparkles,
  RefreshCw,
  Trash2,
  UserCheck,
  FileQuestion,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { uploadCertificateToDrive, DriveFolderInfo } from '../../lib/googleDrive';
import { NMOEvent, NMOMember } from '../../types/nmo';

interface BulkFileItem {
  id: string;
  file: File;
  originalName: string;
  extractedId: string;
  matchedMember: {
    membershipNumber: string;
    name: string;
    email?: string;
    college?: string;
  } | null;
  status: 'matched' | 'duplicate_conflict' | 'unmatched_exception';
  manuallyAssigned: boolean;
  uploadStatus?: 'pending' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
  existingFileId?: string;
}

interface BulkCertificateUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: NMOEvent;
  eventFolder: DriveFolderInfo;
  participants: Array<{
    membershipNumber: string;
    name: string;
    email?: string;
    medicalCollege?: string;
  }>;
  allMembers: NMOMember[];
  existingFiles: Array<{
    id: string;
    name: string;
    membershipNumber: string;
  }>;
  onUploadComplete: () => void;
}

export const BulkCertificateUploadModal: React.FC<BulkCertificateUploadModalProps> = ({
  isOpen,
  onClose,
  event,
  eventFolder,
  participants,
  allMembers,
  existingFiles,
  onUploadComplete
}) => {
  const [fileItems, setFileItems] = useState<BulkFileItem[]>([]);
  const [overwriteDuplicates, setOverwriteDuplicates] = useState<boolean>(false);
  const [isProcessingUpload, setIsProcessingUpload] = useState<boolean>(false);
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number>(-1);
  const [uploadSummary, setUploadSummary] = useState<{
    total: number;
    success: number;
    failed: number;
    overwritten: number;
  } | null>(null);

  // Map of existing files by membership ID
  const existingFilesMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    existingFiles.forEach((f) => {
      const cleanNo = String(f.membershipNumber || '').trim().toUpperCase();
      if (cleanNo) map.set(cleanNo, { id: f.id, name: f.name });
    });
    return map;
  }, [existingFiles]);

  if (!isOpen) return null;

  // Process selected files
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: BulkFileItem[] = [];

    Array.from(files).forEach((file, index) => {
      const originalName = file.name;
      const parts = originalName.split('.');
      const baseName = parts.length > 1 ? parts.slice(0, -1).join('.') : originalName;
      // Exact membership ID string, preserving leading zeros
      const extractedId = String(baseName).trim().toUpperCase();

      // Check against event participants first, then all members
      let matched = participants.find(
        (p) => String(p.membershipNumber).trim().toUpperCase() === extractedId
      );

      if (!matched) {
        const foundUser = allMembers.find(
          (u) => String(u.membershipNumber).trim().toUpperCase() === extractedId
        );
        if (foundUser) {
          matched = {
            membershipNumber: foundUser.membershipNumber,
            name: foundUser.name,
            email: foundUser.email,
            medicalCollege: foundUser.medicalCollege
          };
        }
      }

      const existingInDrive = existingFilesMap.get(extractedId);

      let status: 'matched' | 'duplicate_conflict' | 'unmatched_exception' = 'unmatched_exception';
      if (matched) {
        if (existingInDrive) {
          status = 'duplicate_conflict';
        } else {
          status = 'matched';
        }
      }

      newItems.push({
        id: `${file.name}-${index}-${Date.now()}`,
        file,
        originalName,
        extractedId,
        matchedMember: matched || null,
        status,
        manuallyAssigned: false,
        existingFileId: existingInDrive?.id
      });
    });

    setFileItems((prev) => [...prev, ...newItems]);
    setUploadSummary(null);
  };

  const handleManualAssign = (itemId: string, selectedMemNo: string) => {
    const member =
      participants.find((p) => p.membershipNumber === selectedMemNo) ||
      allMembers.find((m) => m.membershipNumber === selectedMemNo);

    if (!member) return;

    const cleanNo = String(member.membershipNumber).trim().toUpperCase();
    const existingInDrive = existingFilesMap.get(cleanNo);

    setFileItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            extractedId: cleanNo,
            matchedMember: {
              membershipNumber: member.membershipNumber,
              name: member.name,
              email: member.email,
              college: (member as any).medicalCollege
            },
            status: existingInDrive ? 'duplicate_conflict' : 'matched',
            manuallyAssigned: true,
            existingFileId: existingInDrive?.id
          };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setFileItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleClearAll = () => {
    setFileItems([]);
    setUploadSummary(null);
    setCurrentUploadIndex(-1);
  };

  const readyItems = fileItems.filter(
    (item) => item.status === 'matched' || (item.status === 'duplicate_conflict' && overwriteDuplicates)
  );

  const conflictItems = fileItems.filter((item) => item.status === 'duplicate_conflict' && !overwriteDuplicates);
  const exceptionItems = fileItems.filter((item) => item.status === 'unmatched_exception');

  const executeBulkUpload = async () => {
    if (readyItems.length === 0) return;

    setIsProcessingUpload(true);
    let successCount = 0;
    let failCount = 0;
    let overwriteCount = 0;

    for (let i = 0; i < fileItems.length; i++) {
      const item = fileItems[i];
      if (item.status === 'unmatched_exception') continue;
      if (item.status === 'duplicate_conflict' && !overwriteDuplicates) continue;

      setCurrentUploadIndex(i);

      // Update item status to uploading
      setFileItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, uploadStatus: 'uploading' } : it))
      );

      try {
        await uploadCertificateToDrive(item.file, {
          membershipNumber: item.extractedId,
          memberName: item.matchedMember?.name || 'NMO Member',
          eventId: event.eventId,
          eventTitle: event.title,
          targetFolderId: eventFolder.id,
          uploadSource: 'admin',
          uploadedBy: 'admin',
          approvalStatus: 'not_required',
          overwriteExisting: overwriteDuplicates,
          existingFileId: item.existingFileId,
          assignedAttendance: true
        });

        if (item.status === 'duplicate_conflict') {
          overwriteCount++;
        }
        successCount++;

        setFileItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, uploadStatus: 'success' } : it))
        );
      } catch (err: any) {
        failCount++;
        setFileItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, uploadStatus: 'error', errorMessage: err.message || 'Upload failed' } : it
          )
        );
      }
    }

    setIsProcessingUpload(false);
    setCurrentUploadIndex(-1);
    setUploadSummary({
      total: readyItems.length,
      success: successCount,
      failed: failCount,
      overwritten: overwriteCount
    });

    onUploadComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base sm:text-lg flex items-center gap-2">
                <span>Bulk Certificate Upload & Member Auto-Match</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  Admin Direct Mode
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>Target:</span>
                <span className="font-semibold text-slate-800">{event.title}</span>
                <span>↳ Destination Folder:</span>
                <span className="font-mono text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  NMO Gujarat / Events / {eventFolder.name}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessingUpload}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {/* Instructions Capsule */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-slate-900 block">Filename Convention & Safe Matching:</span>
              <p>
                Name certificate files using the member's exact Membership ID (e.g. <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-300 font-bold text-slate-800">001.pdf</code>, <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-300 font-bold text-slate-800">002.jpg</code>, <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-300 font-bold text-slate-800">231112001791.pdf</code>). Leading zeros are preserved as strings.
              </p>
              <p className="text-[11px] text-slate-500">
                • Admin uploads are written directly to Google Drive with status <span className="font-semibold text-emerald-700">"not_required"</span> and never enter the approval queue.
                <br />
                • Unmatched files are placed into the <strong>Exception List</strong> below so you can manually associate or discard them.
              </p>
            </div>
          </div>

          {/* Drag & Drop File Picker */}
          <div className="border-2 border-dashed border-slate-300 hover:border-red-600 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-red-50/20 transition-colors">
            <input
              type="file"
              id="bulk-cert-files"
              multiple
              accept=".pdf,application/pdf,image/jpeg,image/png,image/jpg"
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="hidden"
              disabled={isProcessingUpload}
            />
            <label htmlFor="bulk-cert-files" className="cursor-pointer flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-white shadow-xs text-red-700 flex items-center justify-center mb-2 border border-slate-200">
                <Upload className="w-6 h-6" />
              </div>
              <span className="font-bold text-slate-800 text-sm">
                Click to Select Multiple Certificate Files or Drag & Drop
              </span>
              <span className="text-xs text-slate-500 mt-1">
                Supports batch selection of PDF, JPG, and PNG files up to 15MB each
              </span>
            </label>
          </div>

          {/* Upload Summary Feedback if completed */}
          {uploadSummary && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-sm mb-1 text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Bulk Upload Operation Finished</span>
              </div>
              <p>
                Successfully uploaded <strong>{uploadSummary.success}</strong> of {uploadSummary.total} matched certificate(s) directly into <em>{eventFolder.name}</em> on Google Drive.
                {uploadSummary.overwritten > 0 && ` (${uploadSummary.overwritten} existing files overwritten).`}
                {uploadSummary.failed > 0 && ` ${uploadSummary.failed} file(s) failed.`}
              </p>
            </div>
          )}

          {/* Stats Bar */}
          {fileItems.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Selected Files</span>
                <span className="text-base font-bold text-slate-900">{fileItems.length}</span>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
                <span className="block text-[11px] font-semibold">Matched & Ready</span>
                <span className="text-base font-bold text-emerald-800">{readyItems.length}</span>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                <span className="block text-[11px] font-semibold">Duplicate Conflicts</span>
                <span className="text-base font-bold text-amber-800">{conflictItems.length}</span>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-900">
                <span className="block text-[11px] font-semibold">Exceptions (Unmatched)</span>
                <span className="text-base font-bold text-rose-800">{exceptionItems.length}</span>
              </div>
            </div>
          )}

          {/* Duplicate Overwrite Option */}
          {fileItems.some((i) => i.status === 'duplicate_conflict') && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-950">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Duplicate Conflict Resolution:</strong> Some files already have existing certificates in Drive for their Membership ID.
                </span>
              </div>
              <label className="flex items-center gap-2 font-bold cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={overwriteDuplicates}
                  onChange={(e) => setOverwriteDuplicates(e.target.checked)}
                  className="rounded text-amber-700 focus:ring-amber-500"
                />
                <span>Allow Overwrite for Duplicates</span>
              </label>
            </div>
          )}

          {/* Items Table */}
          {fileItems.length > 0 && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                <span>File Queue & Member Association</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={isProcessingUpload}
                  className="text-red-700 hover:text-red-900 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Clear Queue
                </button>
              </div>

              <div className="overflow-x-auto max-h-[320px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3">File Name</th>
                      <th className="p-3">Detected ID</th>
                      <th className="p-3">Matched Member Details</th>
                      <th className="p-3">Match Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fileItems.map((item, index) => {
                      const isUploadingCurrent = currentUploadIndex === index;

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            item.status === 'unmatched_exception' ? 'bg-rose-50/30' : ''
                          }`}
                        >
                          <td className="p-3">
                            <span className="font-semibold text-slate-900 block truncate max-w-[200px]" title={item.originalName}>
                              {item.originalName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                            </span>
                          </td>

                          <td className="p-3">
                            <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300">
                              {item.extractedId}
                            </span>
                          </td>

                          <td className="p-3">
                            {item.matchedMember ? (
                              <div>
                                <span className="font-bold text-slate-900 block">
                                  {item.matchedMember.name}
                                </span>
                                {item.matchedMember.college && (
                                  <span className="text-[10px] text-slate-500 block">
                                    {item.matchedMember.college}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <select
                                  onChange={(e) => handleManualAssign(item.id, e.target.value)}
                                  className="text-xs px-2 py-1 border border-slate-300 rounded-lg bg-white"
                                  defaultValue=""
                                >
                                  <option value="" disabled>
                                    Assign to participant...
                                  </option>
                                  {participants.map((p) => (
                                    <option key={p.membershipNumber} value={p.membershipNumber}>
                                      {p.name} ({p.membershipNumber})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </td>

                          <td className="p-3">
                            {item.uploadStatus === 'uploading' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">
                                <RefreshCw className="w-3 h-3 animate-spin text-amber-700" />
                                <span>Uploading...</span>
                              </span>
                            ) : item.uploadStatus === 'success' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Uploaded to Drive</span>
                              </span>
                            ) : item.uploadStatus === 'error' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-900" title={item.errorMessage}>
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                <span>Error: {item.errorMessage || 'Failed'}</span>
                              </span>
                            ) : item.status === 'matched' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900">
                                <UserCheck className="w-3 h-3 text-emerald-700" />
                                <span>Ready to Upload</span>
                              </span>
                            ) : item.status === 'duplicate_conflict' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">
                                <AlertTriangle className="w-3 h-3 text-amber-700" />
                                <span>{overwriteDuplicates ? 'Will Overwrite' : 'Duplicate File'}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-900">
                                <FileQuestion className="w-3 h-3 text-rose-700" />
                                <span>Exception (Unmatched)</span>
                              </span>
                            )}
                          </td>

                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              disabled={isProcessingUpload}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                              title="Remove from queue"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {readyItems.length > 0 ? (
              <span>
                <strong>{readyItems.length}</strong> certificate(s) will be uploaded into event folder{' '}
                <strong>{eventFolder.name}</strong>.
              </span>
            ) : (
              <span>Select files matching participant IDs to begin bulk upload.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessingUpload}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={executeBulkUpload}
              disabled={isProcessingUpload || readyItems.length === 0}
              className="px-5 py-2.5 bg-red-700 hover:bg-red-800 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              {isProcessingUpload ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Uploading ({currentUploadIndex + 1}/{readyItems.length})...
                  </span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload {readyItems.length} Matched Certificates</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
