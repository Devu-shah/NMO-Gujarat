import React, { useState, useEffect, useMemo } from 'react';
import { useNMO } from '../../context/NMOContext';
import { NmoLogo } from '../NmoLogo';
import { AdminDashboardOverview } from './AdminDashboardOverview';
import { AdminMemberDataTable } from './AdminMemberDataTable';
import { MemberDataImport } from './MemberDataImport';
import { AdminCsvImport } from './AdminCsvImport';
import { AdminCsvReplace } from './AdminCsvReplace';
import { AdminCsvExport } from './AdminCsvExport';
import { AdminEventsManager } from './AdminEventsManager';
import { AdminRegistrationsManager } from './AdminRegistrationsManager';
import { AdminEmailCenter } from './AdminEmailCenter';
import { AdminAuditLogs } from './AdminAuditLogs';
import { AdminDataValidation } from './AdminDataValidation';
import { AdminImportHistory } from './AdminImportHistory';
import { AdminAnnouncementsManager } from './AdminAnnouncementsManager';
import { AdminUsersManager } from './AdminUsersManager';
import { AdminAdministratorsManager } from './AdminAdministratorsManager';
import { AdminCertificatesManager } from './AdminCertificatesManager';
import { AdminSettings } from './AdminSettings';
import { AdminGalleryShowcaseManager } from './AdminGalleryShowcaseManager';
import { AdminQRScannerModal } from './AdminQRScannerModal';
import { AdminInquiriesManager } from './AdminInquiriesManager';
import {
  LayoutDashboard,
  Database,
  Inbox,
  FileSpreadsheet,
  RefreshCw,
  Download,
  Sparkles,
  History,
  ShieldCheck,
  Images,
  Users,
  Shield,
  Calendar,
  CheckSquare,
  Award,
  Bell,
  Mail,
  FileText,
  Settings,
  ChevronDown,
  ChevronRight,
  LogOut,
  ArrowLeft,
  Activity,
  Sliders,
  ScanLine
} from 'lucide-react';

interface AdminPortalProps {
  onBackToSite: () => void;
  portalScope?: 'super' | 'state' | 'prant/gujarat' | 'prant/saurashtra' | 'city';
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onBackToSite, portalScope }) => {
  const { currentUser, logout, eventRegistrations } = useNMO();

  // Read URL query parameters for deep linking (e.g. ?section=events&eventId=...)
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const paramSection = urlParams ? urlParams.get('section') : null;
  const paramEventId = urlParams ? urlParams.get('eventId') : null;

  const [activeSection, setActiveSection] = useState<string>(() => {
    return paramSection || 'dashboard';
  });
  const [selectedTargetEventId, setSelectedTargetEventId] = useState<string | null>(() => {
    return paramEventId || null;
  });
  const [dataMenuOpen, setDataMenuOpen] = useState(true);
  const [showQRScannerModal, setShowQRScannerModal] = useState<boolean>(false);

  // Sync state if URL query params update via back/forward navigation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sec = params.get('section');
    const evtId = params.get('eventId');
    if (sec) setActiveSection(sec);
    if (evtId) setSelectedTargetEventId(evtId);
  }, []);

  const pendingRegistrationsCount = useMemo(() => {
    return (eventRegistrations || []).filter(
      (r) => r.registrationStatus === 'Pending' || r.status === 'Pending'
    ).length;
  }, [eventRegistrations]);

  const role = currentUser?.role || 'member';
  const isSuperAdmin = role === 'super_admin';
  const isStateAdmin = role === 'state_admin' || isSuperAdmin;
  const isPrantAdmin = role === 'prant_admin';
  const isCityAdmin = role === 'city_admin' || portalScope === 'city';
  const assignedCity = currentUser?.city || 'Ahmedabad';

  // Determine active Prant scope
  let activePrantScope: 'Gujarat' | 'Saurashtra' | 'All' = 'All';
  if (portalScope === 'prant/gujarat' || (isPrantAdmin && currentUser?.prant === 'Gujarat')) {
    activePrantScope = 'Gujarat';
  } else if (portalScope === 'prant/saurashtra' || (isPrantAdmin && currentUser?.prant === 'Saurashtra')) {
    activePrantScope = 'Saurashtra';
  }

  const getPortalTitle = () => {
    if (isSuperAdmin) return 'Super Admin Console';
    if (isCityAdmin) return `City Admin Portal (${assignedCity})`;
    if (role === 'state_admin') return 'State Admin Portal (Gujarat)';
    if (activePrantScope === 'Saurashtra') return 'Saurashtra Prant Admin';
    return 'Gujarat Prant Admin';
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-800">
      {/* Admin Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-white shrink-0 flex flex-col justify-between border-r border-slate-800">
        <div>
          {/* Brand Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <NmoLogo size="sm" showText={false} />
              <div>
                <span className="text-xs font-bold text-white uppercase tracking-wider block">
                  NMO GUJARAT
                </span>
                <span className="text-[10px] text-amber-300 font-semibold block truncate max-w-[140px]">
                  {getPortalTitle()}
                </span>
              </div>
            </div>
            <button
              onClick={onBackToSite}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Return to public site"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>

          {/* User Info Capsule */}
          <div className="p-3.5 mx-3 my-3 bg-slate-800/80 rounded-xl border border-slate-700/60 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
              {currentUser?.name ? currentUser.name[0] : 'A'}
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="font-bold text-white truncate">
                {currentUser?.name || 'Administrator'}
              </div>
              <div className="text-[10px] text-amber-300 font-mono capitalize">
                {role.replace('_', ' ')}
                {isCityAdmin ? ` (${assignedCity})` : isPrantAdmin ? ` (${currentUser?.prant || activePrantScope})` : ''}
              </div>
            </div>
          </div>

          {/* Navigation Links Partitioned Exactly by Role */}
          <nav className="p-3 space-y-1 text-xs overflow-y-auto max-h-[calc(100vh-220px)]">
            {/* 1. Dashboard */}
            <button
              onClick={() => setActiveSection('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                activeSection === 'dashboard'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            {/* 2. Users / Prant Users */}
            <button
              onClick={() => setActiveSection('users')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                activeSection === 'users'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{isPrantAdmin ? `${activePrantScope} Users` : 'Users'}</span>
            </button>

            {/* 3. Administrators (ONLY for Super Admin) */}
            {isSuperAdmin && (
              <button
                onClick={() => setActiveSection('administrators')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                  activeSection === 'administrators'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Shield className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-amber-300">Administrators</span>
              </button>
            )}

            {/* 4. Events / Prant Events */}
            <button
              onClick={() => setActiveSection('events')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                activeSection === 'events'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>{isPrantAdmin ? `${activePrantScope} Events` : 'Events'}</span>
            </button>

            {/* 5. Participants & 6. Attendance */}
            <button
              onClick={() => {
                setSelectedTargetEventId(null);
                setActiveSection('registrations');
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                activeSection === 'registrations' || activeSection === 'attendance'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CheckSquare className="w-4 h-4" />
                <span>Participants & Attendance</span>
              </div>
              {pendingRegistrationsCount > 0 && (
                <span className="text-[10px] font-black bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded-full shadow-xs">
                  {pendingRegistrationsCount}
                </span>
              )}
            </button>

            {/* Quick QR Attendance Scanner for ID Cards */}
            <button
              onClick={() => setShowQRScannerModal(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg font-bold text-emerald-300 hover:bg-emerald-950/60 hover:text-emerald-200 border border-emerald-700/50 transition-colors cursor-pointer"
              title="Open camera to scan member ID cards and automatically mark attendance"
            >
              <div className="flex items-center gap-2.5">
                <ScanLine className="w-4 h-4 text-emerald-400" />
                <span>Scan ID Cards (QR)</span>
              </div>
              <span className="text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                Live
              </span>
            </button>

            {/* Google Drive Certificates */}
            <button
              onClick={() => setActiveSection('certificates')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                activeSection === 'certificates'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Award className="w-4 h-4 text-amber-400" />
              <span>Drive Certificates</span>
            </button>

            {/* 7. EDIT NMO GUJARAT DATA Tree (Super Admin and State Admin) */}
            {(isSuperAdmin || role === 'state_admin') && (
              <div className="pt-2">
                <button
                  onClick={() => setDataMenuOpen(!dataMenuOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-slate-400 hover:text-white text-[11px] font-bold uppercase tracking-wider select-none cursor-pointer"
                >
                  <span>Edit NMO Gujarat Data</span>
                  {dataMenuOpen ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>

                {dataMenuOpen && (
                  <div className="pl-3 pr-1 py-1 space-y-0.5 border-l border-slate-700 ml-3 mt-1">
                    <button
                      onClick={() => setActiveSection('member-data')}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                        activeSection === 'member-data'
                          ? 'bg-red-700 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>Member Data</span>
                    </button>

                    <button
                      onClick={() => setActiveSection('import-csv')}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                        activeSection === 'import-csv'
                          ? 'bg-red-700 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Import CSV/XLSX</span>
                    </button>

                    <button
                      onClick={() => setActiveSection('replace-csv')}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                        activeSection === 'replace-csv'
                          ? 'bg-red-700 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Replace/Synchronize</span>
                    </button>

                    <button
                      onClick={() => setActiveSection('validate-file')}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                        activeSection === 'validate-file' || activeSection === 'data-validation'
                          ? 'bg-red-700 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Validate File</span>
                    </button>

                    <button
                      onClick={() => setActiveSection('export-csv')}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                        activeSection === 'export-csv'
                          ? 'bg-red-700 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export CSV</span>
                    </button>

                    <button
                      onClick={() => setActiveSection('import-history')}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                        activeSection === 'import-history'
                          ? 'bg-red-700 text-white font-semibold'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Import History</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 8. Announcements */}
            <button
              onClick={() => setActiveSection('announcements')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                activeSection === 'announcements'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Announcements</span>
            </button>

            {/* Inquiries & Support Tickets (All Admins) */}
            <button
              onClick={() => setActiveSection('inquiries')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                activeSection === 'inquiries'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Inbox className="w-4 h-4 text-amber-400" />
                <span>Inquiries & Tickets</span>
              </div>
              <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 px-1.5 py-0.5 rounded">
                Desk
              </span>
            </button>

            {/* 9. Email (Super Admin & State Admin) */}
            {(isSuperAdmin || role === 'state_admin') && (
              <button
                onClick={() => setActiveSection('email')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                  activeSection === 'email'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Mail className="w-4 h-4" />
                <span>Email Communications</span>
              </button>
            )}

            {/* 10. Reports */}
            <button
              onClick={() => setActiveSection('reports')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                activeSection === 'reports'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Reports</span>
            </button>

            {/* 11. Activity Log (Super Admin) */}
            {isSuperAdmin && (
              <button
                onClick={() => setActiveSection('activity-log')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                  activeSection === 'activity-log'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Activity Log</span>
              </button>
            )}

            {/* Gallery Showcase Selector (Super Admin Only) */}
            {isSuperAdmin && (
              <button
                onClick={() => setActiveSection('gallery-showcase')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                  activeSection === 'gallery-showcase'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Images className="w-4 h-4 text-amber-400" />
                <span>Gallery Showcase (Home)</span>
              </button>
            )}

            {/* 12. Settings (Super Admin) */}
            {isSuperAdmin && (
              <button
                onClick={() => setActiveSection('settings')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                  activeSection === 'settings'
                    ? 'bg-red-700 text-white shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Website & System Settings</span>
              </button>
            )}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <button
            onClick={onBackToSite}
            className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Public Site</span>
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 hover:text-red-400 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 sm:p-10 max-w-7xl mx-auto w-full overflow-y-auto">
        {activeSection === 'dashboard' && <AdminDashboardOverview />}
        {activeSection === 'users' && (
          <AdminUsersManager
            prantFilterScope={activePrantScope}
            isReadOnlyRoles={!isSuperAdmin}
          />
        )}
        {activeSection === 'administrators' && isSuperAdmin && (
          <AdminAdministratorsManager />
        )}
        {activeSection === 'member-data' && <AdminMemberDataTable />}
        {activeSection === 'import-csv' && <MemberDataImport initialMode="add_update" />}
        {activeSection === 'replace-csv' && <MemberDataImport initialMode="replace_sync" />}
        {activeSection === 'validate-file' && <MemberDataImport initialMode="validate_only" />}
        {activeSection === 'export-csv' && <AdminCsvExport />}
        {activeSection === 'events' && (
          <AdminEventsManager
            initialEventId={selectedTargetEventId}
            onNavigateToRegistrations={(eventId) => {
              setSelectedTargetEventId(eventId);
              setActiveSection('registrations');
            }}
          />
        )}
        {activeSection === 'certificates' && <AdminCertificatesManager />}
        {activeSection === 'registrations' && (
          <AdminRegistrationsManager initialEventId={selectedTargetEventId} />
        )}
        {activeSection === 'attendance' && (
          <AdminRegistrationsManager initialEventId={selectedTargetEventId} />
        )}
        {activeSection === 'announcements' && <AdminAnnouncementsManager />}
        {activeSection === 'inquiries' && <AdminInquiriesManager />}
        {activeSection === 'email' && <AdminEmailCenter />}
        {activeSection === 'reports' && <AdminAuditLogs />}
        {activeSection === 'activity-log' && <AdminAuditLogs />}
        {activeSection === 'import-history' && <AdminImportHistory />}
        {activeSection === 'data-validation' && <MemberDataImport initialMode="validate_only" />}
        {activeSection === 'gallery-showcase' && isSuperAdmin && <AdminGalleryShowcaseManager />}
        {activeSection === 'settings' && <AdminSettings />}
      </main>

      {/* Admin QR Attendance Scanner Modal */}
      <AdminQRScannerModal
        isOpen={showQRScannerModal}
        onClose={() => setShowQRScannerModal(false)}
      />
    </div>
  );
};
