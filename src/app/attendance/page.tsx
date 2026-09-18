'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WorkforceWorkspace from '@/components/workforce/WorkforceWorkspace';
import styles from '@/components/admin/admin.module.css';
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
  const attendanceRequest = useRef(0);
  const reportRequest = useRef(0);
  const employeeRequest = useRef(0);
  const [directoryError, setDirectoryError] = useState('');
  const [storeError, setStoreError] = useState('');
  const [search, setSearch] = useState('');
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
      setSelectedStoreId(canViewAllStores ? '' : currentStoreId);
    } catch {
      setAssignedStoreId('');
      setIsStoreLocked(false);
    }
  }, []);

  const loadStoreOptions = useCallback(async () => {
    setStoreError('');
    let storesData: Array<{ _id?: string; id?: string; name?: string }>;
    try { storesData = await apiFetchWithRetry<typeof storesData>('/stores'); }
    catch { setStoreError('Unable to load stores. Use Refresh to try again.'); return; }

    const options = (Array.isArray(storesData) ? storesData : [])
      .map((store) => ({
        value: String(store?._id ?? store?.id ?? '').trim(),
        label: String(store?.name ?? '').trim(),
      }))
      .filter((item) => item.value && item.label)
      .sort((first, second) => first.label.localeCompare(second.label, undefined, { sensitivity: 'base' }));

    setStoreOptions(options);

    if (options.length > 0 && !selectedStoreId && isStoreLocked) {
      const fallbackStoreId = assignedStoreId && options.some((item) => item.value === assignedStoreId)
        ? assignedStoreId
        : options[0].value;
      setSelectedStoreId(fallbackStoreId);
    }
  }, [assignedStoreId, selectedStoreId, isStoreLocked]);

  const loadAttendance = useCallback(async () => {
    const request = ++attendanceRequest.current;
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
      if (request !== attendanceRequest.current) return;
      setAttendance(response);
    } catch (error) {
      if (request !== attendanceRequest.current) return;
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
      if (request === attendanceRequest.current) setIsLoading(false);
    }
  }, [assignedStoreId, isStoreLocked, selectedDate, selectedStoreId]);

  const loadEmployeeOptions = useCallback(async () => {
    const request = ++employeeRequest.current;
    setDirectoryError('');
    try {
      const effectiveStoreId = isStoreLocked ? assignedStoreId : selectedStoreId;
      const params = new URLSearchParams();
      if (effectiveStoreId) {
        params.set('storeId', effectiveStoreId);
      }

      const query = params.toString();
      const response = await apiFetchWithRetry<EmployeeOption[]>(`/accounting/attendance/employees${query ? `?${query}` : ''}`);
      if (request !== employeeRequest.current) return;
      const normalized = Array.isArray(response) ? response : [];
      setEmployeeOptions(normalized);

      if (normalized.length === 0) {
        setSelectedEmployeeId('');
        return;
      }

      setSelectedEmployeeId(current => normalized.some(item => item.employeeId === current) ? current : '');
    } catch {
      if (request !== employeeRequest.current) return;
      setDirectoryError('Unable to load employees. Use Refresh to try again.');
      setEmployeeOptions([]);
      setSelectedEmployeeId('');
    }
  }, [assignedStoreId, isStoreLocked, selectedStoreId]);

  const loadEmployeeReport = useCallback(async () => {
    const request = ++reportRequest.current;
    if (!selectedEmployeeId) {
      setIsReportLoading(false);
      setReportError('');
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

      if (request !== reportRequest.current) return;
      setEmployeeReport(response);
    } catch (error) {
      if (request !== reportRequest.current) return;
      const message = error instanceof Error && error.message ? error.message : 'Unable to load employee report.';
      setReportError(message);
      setEmployeeReport(null);
    } finally {
      if (request === reportRequest.current) setIsReportLoading(false);
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

  const visibleRecords = filteredStoreRecords.filter(record => `${record.employeeName} ${record.employeeId} ${record.designation || ''}`.toLowerCase().includes(search.toLowerCase()));
  const badge = (status: string) => <span className={styles.badge} data-status={status === 'absent' ? 'rejected' : ['late','half_day','on_leave'].includes(status) ? 'pending' : 'approved'}>{status.replace(/_/g, ' ')}</span>;
  return <WorkforceWorkspace actions={<button className={styles.secondary} disabled={isLoading || isReportLoading} onClick={() => { void loadAttendance(); void loadEmployeeReport(); void loadStoreOptions(); void loadEmployeeOptions(); }}>Refresh</button>}>
    {storeError && <p className={styles.error} role="alert">{storeError}</p>}
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Daily attendance</h2><p>See who has checked in and review attendance by store.</p></div></div>
      <div className={styles.filters}>
        <label>Date<input type="date" required value={selectedDate} onChange={e => { if(e.target.value) setSelectedDate(e.target.value); }} /></label>
        <label>Store<select value={(isStoreLocked ? assignedStoreId : selectedStoreId) || ''} disabled={isStoreLocked} onChange={e => setSelectedStoreId(e.target.value)}>{!isStoreLocked && <option value="">All stores</option>}{storeOptions.map(store => <option key={store.value} value={store.value}>{store.label}</option>)}</select></label>
        <label>Status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}>{['all','present','full_day','half_day','on_leave','absent'].map(status => <option key={status} value={status}>{status === 'all' ? 'All statuses' : status.replace(/_/g,' ')}</option>)}</select></label>
        <input aria-label="Search employees" placeholder="Search employee name or ID" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loadError ? <p className={styles.error} role="alert">{loadError}</p> : isLoading ? <p className={styles.empty} role="status">Loading attendance…</p> : <>
        <div className={styles.metrics}>{[['Employees',attendance.totalEmployees],['Checked in',attendance.checkedInCount],['Checked out',attendance.checkedOutCount],['Not marked',attendance.notMarkedCount],['Attendance rate',`${attendanceRate.toFixed(1)}%`]].map(([label,value]) => <div className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <p className={styles.count}>{selectedStoreLabel} · {attendance.fullDayCount} full day · {attendance.halfDayCount} half day · {attendance.onLeaveCount} on leave · {visibleRecords.length} shown</p>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Employee</th><th>Check-in</th><th>Check-out</th><th>Hours worked</th><th>Status</th><th /></tr></thead><tbody>{visibleRecords.map(record => <tr key={record._id}><td><strong>{record.employeeName}</strong><small>{record.employeeId} · {record.designation || 'No designation'}</small></td><td>{formatTime(record.checkInTime)}</td><td>{formatTime(record.checkOutTime)}</td><td>{record.workHours == null ? '—' : `${record.workHours.toFixed(2)}h`}</td><td>{badge(record.status)}</td><td><button className={styles.link} onClick={() => { setSelectedEmployeeId(record.employeeId); document.getElementById('employee-report')?.scrollIntoView({behavior:'smooth'}); }}>View report</button></td></tr>)}{!visibleRecords.length && <tr><td colSpan={6} className={styles.empty}>No attendance matches these filters.</td></tr>}</tbody></table></div>
      </>}
    </section>
    <section id="employee-report" className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Employee report</h2><p>Review an employee’s attendance for the selected date, week, or month.</p></div></div>
      <div className={styles.filters}><label>Employee<select value={selectedEmployeeId} onChange={e => setSelectedEmployeeId(e.target.value)}><option value="">Choose an employee</option>{employeeOptions.map(employee => <option key={employee.employeeId} value={employee.employeeId}>{employee.employeeName} ({employee.employeeId})</option>)}</select></label><label>Period<select value={reportRange} onChange={e => setReportRange(e.target.value as typeof reportRange)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div>
      {directoryError && <p className={styles.error} role="alert">{directoryError}</p>}
      {isReportLoading ? <p className={styles.empty} role="status">Loading report…</p> : reportError ? <p className={styles.error} role="alert">{reportError}</p> : !employeeReport ? <p className={styles.empty}>Choose an employee to view their attendance.</p> : <>
        <p className={styles.count}>{employeeReport.employeeName} · {new Date(employeeReport.startDate).toLocaleDateString()} – {new Date(employeeReport.endDate).toLocaleDateString()} · {employeeReport.summary.totalWorkHours.toFixed(2)}h worked</p>
        <div className={styles.metrics}>{[['Present',employeeReport.summary.presentDays],['Late',employeeReport.summary.lateDays],['Half days',employeeReport.summary.halfDays],['Absent',employeeReport.summary.absentDays]].map(([label,value]) => <div className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Date</th><th>Check-in</th><th>Check-out</th><th>Late minutes</th><th>Hours worked</th><th>Status</th></tr></thead><tbody>{employeeReport.records.map(record => <tr key={record._id}><td>{record.date ? new Date(record.date).toLocaleDateString() : '—'}</td><td>{formatTime(record.checkInTime)}</td><td>{formatTime(record.checkOutTime)}</td><td>{record.lateMinutes ?? 0}</td><td>{record.workHours == null ? '—' : `${record.workHours.toFixed(2)}h`}</td><td>{badge(record.status)}</td></tr>)}{!employeeReport.records.length && <tr><td colSpan={6} className={styles.empty}>No attendance entries in this period.</td></tr>}</tbody></table></div>
      </>}
    </section>
  </WorkforceWorkspace>;
}
