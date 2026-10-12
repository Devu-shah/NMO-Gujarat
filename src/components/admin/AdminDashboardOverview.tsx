import React from 'react';
import { useNMO } from '../../context/NMOContext';
import {
  Users,
  UserCheck,
  GraduationCap,
  Stethoscope,
  Building,
  Calendar,
  CheckCircle,
  Clock,
  PieChart as PieChartIcon,
  BarChart3,
  TrendingUp,
  MapPin
} from 'lucide-react';

export const AdminDashboardOverview: React.FC = () => {
  const { members, events, eventRegistrations, currentUser } = useNMO();

  // Role filtering if Prant Admin
  const isCityAdmin = currentUser?.role === 'city_admin';
  const assignedCity = currentUser?.city;
  const isPrantAdmin = currentUser?.role === 'prant_admin';
  const assignedPrant = currentUser?.prant;

  const scopedMembers = isCityAdmin && assignedCity
    ? members.filter((m) => m.city?.toLowerCase() === assignedCity.toLowerCase() || m.address?.toLowerCase().includes(assignedCity.toLowerCase()))
    : isPrantAdmin
    ? members.filter((m) => m.prant === assignedPrant)
    : members;

  const scopedEvents = isCityAdmin && assignedCity
    ? events.filter((e) => !e.city || e.city.toLowerCase() === assignedCity.toLowerCase())
    : isPrantAdmin
    ? events.filter((e) => e.prant === assignedPrant || e.prant === 'All')
    : events;

  // Key Metric Calculations
  const totalMembers = scopedMembers.length;
  const activeMembers = scopedMembers.filter((m) => m.status === 'Active').length;
  
  const doctorsCount = scopedMembers.filter((m) => {
    const q = (m.qualifications || '').toLowerCase();
    const s = (m.specialization || '').toLowerCase();
    return !q.includes('student') && !s.includes('student') && !q.includes('intern');
  }).length;

  const studentsCount = totalMembers - doctorsCount;

  const gujaratMembers = scopedMembers.filter((m) => m.prant === 'Gujarat').length;
  const saurashtraMembers = scopedMembers.filter((m) => m.prant === 'Saurashtra').length;

  const upcomingEvents = scopedEvents.filter(
    (e) => e.status === 'Registration Open' || e.status === 'Published'
  ).length;

  const totalRegistrations = eventRegistrations.length;
  const pendingApprovals = eventRegistrations.filter((r) => r.registrationStatus === 'Pending' || r.registrationStatus === 'Registered').length;
  const attendedCount = eventRegistrations.filter((r) => r.attendanceStatus === 'Attended').length;

  // Chart 1: Members by Qualification aggregation
  const qualificationMap: Record<string, number> = {};
  scopedMembers.forEach((m) => {
    const q = m.qualifications || 'MBBS';
    const key = q.includes('MD')
      ? 'MD'
      : q.includes('MS')
      ? 'MS'
      : q.includes('Student')
      ? 'MBBS Student'
      : 'MBBS';
    qualificationMap[key] = (qualificationMap[key] || 0) + 1;
  });

  // Chart 2: Members by Top Medical Colleges
  const collegeMap: Record<string, number> = {};
  scopedMembers.forEach((m) => {
    const c = m.medicalCollege || 'Other College';
    // Shorten known names for clean chart presentation
    let shortName = c;
    if (c.includes('B.J.')) shortName = 'BJMC Ahmedabad';
    else if (c.includes('Baroda')) shortName = 'BMC Vadodara';
    else if (c.includes('P.D.U.') || c.includes('Rajkot')) shortName = 'PDU Rajkot';
    else if (c.includes('M.P. Shah') || c.includes('Jamnagar')) shortName = 'MP Shah Jamnagar';
    else if (c.includes('Surat')) shortName = 'GMC Surat';
    else if (c.includes('Gandhinagar')) shortName = 'GMERS Gandhinagar';

    collegeMap[shortName] = (collegeMap[shortName] || 0) + 1;
  });

  const topColleges = Object.entries(collegeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxCollegeCount = Math.max(...topColleges.map((c) => c[1]), 1);

  return (
    <div className="space-y-8">
      {/* Scope banner if Prant Admin */}
      {isPrantAdmin && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <span>Viewing data strictly scoped to <strong>{assignedPrant} Prant</strong> (Prant Admin permissions active)</span>
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Members</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-black text-slate-900">{totalMembers}</div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5" />
            <span>{activeMembers} Active in Database</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Doctors vs Students</span>
            <Stethoscope className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {doctorsCount} <span className="text-xs font-normal text-slate-400">/</span> {studentsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {doctorsCount} Consultants · {studentsCount} UG Medicos
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Prant Division</span>
            <MapPin className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            <span className="text-red-700">{gujaratMembers}</span>
            <span className="text-xs font-normal text-slate-400 mx-1.5">/</span>
            <span className="text-blue-700">{saurashtraMembers}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Gujarat: {gujaratMembers} · Saurashtra: {saurashtraMembers}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Event Registrations</span>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-black text-slate-900">{totalRegistrations}</div>
          <div className="text-[11px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>{pendingApprovals} Pending Approval</span>
          </div>
        </div>
      </div>

      {/* Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart 1: Members by Medical College */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Members by Medical College
              </h3>
              <p className="text-xs text-slate-500">
                Representation across prominent state teaching institutes
              </p>
            </div>
            <Building className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-4">
            {topColleges.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No member records in database. Import your master member CSV to see college distribution.
              </div>
            ) : (
              topColleges.map(([collegeName, count]) => {
                const pct = Math.round((count / maxCollegeCount) * 100);
                return (
                  <div key={collegeName} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-700 truncate max-w-[70%]">{collegeName}</span>
                      <span className="text-slate-900 font-bold">{count} medicos</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-red-700 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chart 2: Qualifications Breakdown */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Members by Qualification
              </h3>
              <p className="text-xs text-slate-500">
                Distribution across clinical degrees and medical training
              </p>
            </div>
            <BarChart3 className="w-4 h-4 text-slate-400" />
          </div>

          <div className="pt-2">
            {Object.keys(qualificationMap).length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No member qualification data in database.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(qualificationMap).map(([qual, count]) => (
                  <div key={qual} className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center">
                    <span className="text-2xl font-black text-slate-900 block">{count}</span>
                    <span className="text-xs font-semibold text-slate-600 mt-1 block truncate">
                      {qual}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {totalMembers > 0 ? Math.round((count / totalMembers) * 100) : 0}% of total
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attendance Funnel Mini Bar */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <span className="text-slate-700">Participation Attendance Rate</span>
              <span className="text-emerald-700 font-bold">
                {totalRegistrations > 0 ? Math.round((attendedCount / totalRegistrations) * 100) : 0}% Attended
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 flex overflow-hidden">
              <div
                className="bg-emerald-600 h-full"
                style={{
                  width: `${totalRegistrations > 0 ? (attendedCount / totalRegistrations) * 100 : 0}%`
                }}
                title="Attended"
              />
              <div
                className="bg-amber-400 h-full"
                style={{
                  width: `${
                    totalRegistrations > 0
                      ? ((totalRegistrations - attendedCount) / totalRegistrations) * 100
                      : 0
                  }%`
                }}
                title="Pending / Registered"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>{attendedCount} Confirmed Attended</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>{totalRegistrations - attendedCount} Registered / In-Progress</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
