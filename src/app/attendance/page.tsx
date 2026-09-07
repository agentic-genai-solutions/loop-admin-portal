'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetchWithRetry } from '@/lib/api';

type StoreOption = {
  value: string;
  label: string;
};

type EmployeeOption = {
  employeeId: string;
  employeeName: string;
  designation?: string;
  storeId?: string | null;
};

type AttendanceRecord = {
  _id: string;
  employeeId: string;
  employeeName: string;
  designation?: string;
  date?: string;
  status: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  workHours?: number;
  lateMinutes?: number;
  leaveType?: string;
};

type StorewiseAttendanceResponse = {
  date: string;
  storeId: string | null;
  totalEmployees: number;
  checkedInCount: number;
  checkedOutCount: number;
  pendingCheckoutCount: number;
  notMarkedCount: number;
  presentCount: number;
  onLeaveCount: number;
  halfDayCount: number;
  fullDayCount: number;
  records: AttendanceRecord[];
};

type EmployeeAttendanceReportResponse = {
  employeeId: string;
  employeeName: string;
  designation?: string;
  range: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  summary: {
    totalPeriodDays: number;
    markedDays: number;
    presentDays: number;
    lateDays: number;
    halfDays: number;
    absentDays: number;
    totalWorkHours: number;
  };
  records: AttendanceRecord[];
};

function formatTime(value?: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getTodayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AttendancePage() {
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedDate, setSelectedDate] = useState(getTodayDateInput);
  const [assignedStoreId, setAssignedStoreId] = useState('');
  const [isStoreLocked, setIsStoreLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [reportRange, setReportRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [employeeReport, setEmployeeReport] = useState<EmployeeAttendanceReportResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent' | 'on_leave' | 'half_day' | 'full_day'>('all');
  const [attendance, setAttendance] = useState<StorewiseAttendanceResponse>({
    date: new Date().toISOString(),
    storeId: null,
    totalEmployees: 0,
    checkedInCount: 0,
    checkedOutCount: 0,
    pendingCheckoutCount: 0,
    notMarkedCount: 0,
    presentCount: 0,
    onLeaveCount: 0,
    halfDayCount: 0,
    fullDayCount: 0,
    records: [],
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const parsedUser = JSON.parse(window.sessionStorage.getItem('loop_admin_user') ?? '{}');
      const roleEntries = Array.isArray(parsedUser?.role)
        ? parsedUser.role
        : parsedUser?.role
          ? [parsedUser.role]
          : [];
      const normalizedRoles = roleEntries.map((entry: unknown) => String(entry ?? '').trim().toLowerCase());
      const canViewAllStores = normalizedRoles.includes('director') || normalizedRoles.includes('super_admin') || normalizedRoles.includes('super_admin_it');
      const currentStoreId = String(parsedUser?.storeId ?? '').trim();

      setAssignedStoreId(currentStoreId);
      setIsStoreLocked(!canViewAllStores && Boolean(currentStoreId));
      setSelectedStoreId(currentStoreId);
    } catch {
      setAssignedStoreId('');
      setIsStoreLocked(false);
    }
  }, []);

  const loadStoreOptions = useCallback(async () => {
    const storesData = await apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores').catch(() => []);

    const options = (Array.isArray(storesData) ? storesData : [])
      .map((store) => ({
        value: String(store?._id ?? store?.id ?? '').trim(),
        label: String(store?.name ?? '').trim(),
      }))
      .filter((item) => item.value && item.label)
      .sort((first, second) => first.label.localeCompare(second.label, undefined, { sensitivity: 'base' }));

    setStoreOptions(options);

    if (options.length > 0 && !selectedStoreId) {
      const fallbackStoreId = assignedStoreId && options.some((item) => item.value === assignedStoreId)
        ? assignedStoreId
        : options[0].value;
      setSelectedStoreId(fallbackStoreId);
    }
  }, [assignedStoreId, selectedStoreId]);

  const loadAttendance = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const effectiveStoreId = isStoreLocked ? assignedStoreId : selectedStoreId;
      const params = new URLSearchParams();
      if (selectedDate) {
        params.set('date', selectedDate);
      }
      if (effectiveStoreId) {
        params.set('storeId', effectiveStoreId);
      }

      const response = await apiFetchWithRetry<StorewiseAttendanceResponse>(`/accounting/attendance/store-wise/list?${params.toString()}`);
      setAttendance(response);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Unable to load attendance records.';
      setLoadError(message);
      setAttendance((current) => ({
        ...current,
        records: [],
        totalEmployees: 0,
        checkedInCount: 0,
        checkedOutCount: 0,
        pendingCheckoutCount: 0,
        notMarkedCount: 0,
        presentCount: 0,
        onLeaveCount: 0,
        halfDayCount: 0,
        fullDayCount: 0,
      }));
    } finally {
      setIsLoading(false);
    }
  }, [assignedStoreId, isStoreLocked, selectedDate, selectedStoreId]);

  const loadEmployeeOptions = useCallback(async () => {
    try {
      const effectiveStoreId = isStoreLocked ? assignedStoreId : selectedStoreId;
      const params = new URLSearchParams();
      if (effectiveStoreId) {
        params.set('storeId', effectiveStoreId);
      }

      const query = params.toString();
      const response = await apiFetchWithRetry<EmployeeOption[]>(`/accounting/attendance/employees${query ? `?${query}` : ''}`).catch(() => []);
      const normalized = Array.isArray(response) ? response : [];
      setEmployeeOptions(normalized);

      if (normalized.length === 0) {
        setSelectedEmployeeId('');
        return;
      }

      if (!normalized.some((item) => item.employeeId === selectedEmployeeId)) {
        setSelectedEmployeeId(normalized[0].employeeId);
      }
    } catch {
      setEmployeeOptions([]);
      setSelectedEmployeeId('');
    }
  }, [assignedStoreId, isStoreLocked, selectedEmployeeId, selectedStoreId]);

  const loadEmployeeReport = useCallback(async () => {
    if (!selectedEmployeeId) {
      setEmployeeReport(null);
      return;
    }

    setIsReportLoading(true);
    setReportError('');

    try {
      const params = new URLSearchParams();
      params.set('range', reportRange);
      params.set('date', selectedDate);

      const response = await apiFetchWithRetry<EmployeeAttendanceReportResponse>(
        `/accounting/attendance/${encodeURIComponent(selectedEmployeeId)}/report?${params.toString()}`,
      );

      setEmployeeReport(response);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Unable to load employee report.';
      setReportError(message);
      setEmployeeReport(null);
    } finally {
      setIsReportLoading(false);
    }
  }, [reportRange, selectedDate, selectedEmployeeId]);

  useEffect(() => {
    void loadStoreOptions();
  }, [loadStoreOptions]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    void loadEmployeeOptions();
  }, [loadEmployeeOptions]);

  useEffect(() => {
    void loadEmployeeReport();
  }, [loadEmployeeReport]);

  const selectedStoreLabel = useMemo(() => {
    const effectiveStoreId = isStoreLocked ? assignedStoreId : selectedStoreId;
    if (!effectiveStoreId) {
      return 'All stores';
    }

    return storeOptions.find((item) => item.value === effectiveStoreId)?.label ?? 'Assigned store';
  }, [assignedStoreId, isStoreLocked, selectedStoreId, storeOptions]);

  const attendanceRate = useMemo(() => {
    if (!attendance.totalEmployees) {
      return 0;
    }

    return (attendance.checkedInCount / attendance.totalEmployees) * 100;
  }, [attendance.checkedInCount, attendance.totalEmployees]);

  const filteredStoreRecords = useMemo(() => {
    if (statusFilter === 'all') {
      return attendance.records;
    }

    return attendance.records.filter((record) => record.status === statusFilter);
  }, [attendance.records, statusFilter]);

  return (
    <main className="portal-page">
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 20, borderBottom: '1px solid rgba(148,163,184,0.18)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', fontWeight: 800 }}>Store Attendance</div>
            <div style={{ fontWeight: 700, color: '#1e293b' }}>{selectedStoreLabel}</div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              Date
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                style={{ minWidth: 170, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              Store
              <select
                value={(isStoreLocked ? assignedStoreId : selectedStoreId) || ''}
                onChange={(event) => setSelectedStoreId(event.target.value)}
                disabled={isStoreLocked}
                style={{ minWidth: 220, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: isStoreLocked ? '#f8fafc' : '#ffffff' }}
              >
                {storeOptions.map((store) => (
                  <option key={store.value} value={store.value}>{store.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | 'present' | 'absent' | 'on_leave' | 'half_day' | 'full_day')}
                style={{ minWidth: 180, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="all">All</option>
                <option value="present">Present</option>
                <option value="full_day">Full Day</option>
                <option value="half_day">Half Day</option>
                <option value="on_leave">On Leave</option>
                <option value="absent">Absent</option>
              </select>
            </label>
          </div>
        </div>

        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 12 }}>
          <div className="card" style={{ padding: 14, border: '1px solid rgba(148,163,184,0.2)' }}><strong>{attendance.totalEmployees}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Total Employees</div></div>
          <div className="card" style={{ padding: 14, border: '1px solid rgba(16,185,129,0.2)' }}><strong>{attendance.checkedInCount}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Checked In</div></div>
          <div className="card" style={{ padding: 14, border: '1px solid rgba(59,130,246,0.2)' }}><strong>{attendance.checkedOutCount}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Checked Out</div></div>
          <div className="card" style={{ padding: 14, border: '1px solid rgba(239,68,68,0.2)' }}><strong>{attendance.notMarkedCount}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Not Marked</div></div>
          <div className="card" style={{ padding: 14, border: '1px solid rgba(14,165,233,0.2)' }}><strong>{attendanceRate.toFixed(1)}%</strong><div style={{ color: '#64748b', fontSize: 12 }}>Attendance Rate</div></div>
        </div>

        <div style={{ padding: '0 20px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 12 }}>
          <div className="card" style={{ padding: 12, border: '1px solid rgba(34,197,94,0.2)' }}><strong>{attendance.fullDayCount}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Full Day</div></div>
          <div className="card" style={{ padding: 12, border: '1px solid rgba(249,115,22,0.2)' }}><strong>{attendance.halfDayCount}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Half Day</div></div>
          <div className="card" style={{ padding: 12, border: '1px solid rgba(168,85,247,0.2)' }}><strong>{attendance.onLeaveCount}</strong><div style={{ color: '#64748b', fontSize: 12 }}>On Leave</div></div>
          <div className="card" style={{ padding: 12, border: '1px solid rgba(239,68,68,0.2)' }}><strong>{attendance.notMarkedCount}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Absent</div></div>
        </div>

        {isLoading ? (
          <div style={{ padding: 24, color: '#64748b', fontWeight: 600 }}>Loading attendance...</div>
        ) : loadError ? (
          <div style={{ padding: 24, color: '#b91c1c', fontWeight: 600 }}>{loadError}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee ID</th>
                  <th>Designation</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Work Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStoreRecords.length > 0 ? (
                  filteredStoreRecords.map((record) => (
                    <tr key={record._id}>
                      <td>{record.employeeName || '—'}</td>
                      <td>{record.employeeId || '—'}</td>
                      <td>{record.designation || '—'}</td>
                      <td>{formatTime(record.checkInTime)}</td>
                      <td>{formatTime(record.checkOutTime)}</td>
                      <td>{record.workHours ? `${record.workHours.toFixed(2)}h` : '—'}</td>
                      <td>
                        <span className={`badge ${record.status === 'absent' ? 'danger' : record.status === 'half_day' || record.status === 'on_leave' ? 'warning' : 'success'}`} style={{ display: 'inline-block', padding: '7px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          {String(record.status || 'absent').replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '22px 16px', color: '#64748b', fontWeight: 600 }}>
                      No attendance records for selected date/store.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 18 }}>
        <div style={{ padding: 20, borderBottom: '1px solid rgba(148,163,184,0.18)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b', fontWeight: 800 }}>Employee Attendance Report</div>
            <div style={{ fontWeight: 700, color: '#1e293b' }}>Daily / Weekly / Monthly</div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              Employee
              <select
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
                style={{ minWidth: 260, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                {employeeOptions.map((employee) => (
                  <option key={employee.employeeId} value={employee.employeeId}>
                    {employee.employeeName} ({employee.employeeId})
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              Report Range
              <select
                value={reportRange}
                onChange={(event) => setReportRange(event.target.value as 'daily' | 'weekly' | 'monthly')}
                style={{ minWidth: 160, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>
        </div>

        {isReportLoading ? (
          <div style={{ padding: 24, color: '#64748b', fontWeight: 600 }}>Loading employee report...</div>
        ) : reportError ? (
          <div style={{ padding: 24, color: '#b91c1c', fontWeight: 600 }}>{reportError}</div>
        ) : !employeeReport ? (
          <div style={{ padding: 24, color: '#64748b', fontWeight: 600 }}>No employee selected.</div>
        ) : (
          <>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 12 }}>
              <div className="card" style={{ padding: 14, border: '1px solid rgba(148,163,184,0.2)' }}><strong>{employeeReport.summary.totalPeriodDays}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Period Days</div></div>
              <div className="card" style={{ padding: 14, border: '1px solid rgba(16,185,129,0.2)' }}><strong>{employeeReport.summary.markedDays}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Marked</div></div>
              <div className="card" style={{ padding: 14, border: '1px solid rgba(34,197,94,0.2)' }}><strong>{employeeReport.summary.presentDays}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Present</div></div>
              <div className="card" style={{ padding: 14, border: '1px solid rgba(245,158,11,0.2)' }}><strong>{employeeReport.summary.lateDays}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Late</div></div>
              <div className="card" style={{ padding: 14, border: '1px solid rgba(249,115,22,0.2)' }}><strong>{employeeReport.summary.halfDays}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Half Days</div></div>
              <div className="card" style={{ padding: 14, border: '1px solid rgba(239,68,68,0.2)' }}><strong>{employeeReport.summary.absentDays}</strong><div style={{ color: '#64748b', fontSize: 12 }}>Absent</div></div>
            </div>

            <div style={{ padding: '0 20px 16px', color: '#475569', fontWeight: 600, fontSize: 13 }}>
              {employeeReport.employeeName} • {employeeReport.employeeId} • {new Date(employeeReport.startDate).toLocaleDateString()} - {new Date(employeeReport.endDate).toLocaleDateString()} • {employeeReport.summary.totalWorkHours.toFixed(2)}h worked
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Late Minutes</th>
                    <th>Work Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeReport.records.length > 0 ? (
                    employeeReport.records.map((record) => (
                      <tr key={record._id}>
                        <td>{record.date ? new Date(record.date).toLocaleDateString() : '—'}</td>
                        <td>{formatTime(record.checkInTime)}</td>
                        <td>{formatTime(record.checkOutTime)}</td>
                        <td>{record.lateMinutes ?? 0}</td>
                        <td>{record.workHours ? `${record.workHours.toFixed(2)}h` : '—'}</td>
                        <td>
                          <span className={`badge ${record.status === 'absent' ? 'danger' : record.status === 'late' ? 'warning' : 'success'}`} style={{ display: 'inline-block', padding: '7px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                            {String(record.status || 'absent').replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '22px 16px', color: '#64748b', fontWeight: 600 }}>
                        No attendance entries found in selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
