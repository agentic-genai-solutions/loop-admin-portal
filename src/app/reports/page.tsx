'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import styles from '@/components/admin/admin.module.css';
import { apiFetchWithRetry } from '@/lib/api';

type Attendance = { totalEmployees: number; present: number; late: number; absent: number; attendanceRate: number; asOf?: string | null };
type Leave = { totalLeaveRequests: number; approved: number; pending: number; rejected: number };
type Payroll = { approved: number; pending: number; paid: number; totalsByCurrency?: { currency: string; totalPayroll: number; totalSundayExtraPay: number }[] };
const money = (value: number, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);
const csvCell = (value: string | number) => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;

export default function ReportsPage() {
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [leave, setLeave] = useState<Leave | null>(null);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setErrors([]);
    const results = await Promise.allSettled([
      apiFetchWithRetry<Attendance>('/director/reports/attendance'),
      apiFetchWithRetry<Leave>('/director/reports/leave'),
      apiFetchWithRetry<Payroll>('/director/reports/payroll'),
    ]);
    setAttendance(results[0].status === 'fulfilled' ? results[0].value : null);
    setLeave(results[1].status === 'fulfilled' ? results[1].value : null);
    setPayroll(results[2].status === 'fulfilled' ? results[2].value : null);
    setErrors(results.flatMap((result, index) => result.status === 'rejected' ? [['Attendance', 'Leave', 'Payroll'][index]] : []));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const attendanceRows: [string, number | string][] = attendance ? [['Active employees', attendance.totalEmployees], ['Present (includes late)', attendance.present], ['Late arrivals', attendance.late], ['Absent', attendance.absent], ['Attendance rate', `${attendance.attendanceRate}%`]] : [];
  const leaveRows: [string, number][] = leave ? [['Total requests', leave.totalLeaveRequests], ['Pending', leave.pending], ['Approved', leave.approved], ['Rejected', leave.rejected], ['Withdrawn / other', Math.max(0, leave.totalLeaveRequests - leave.pending - leave.approved - leave.rejected)]] : [];
  const payrollRows: [string, number | string][] = payroll ? [['Awaiting approval', payroll.pending], ['Approved', payroll.approved], ['Paid', payroll.paid], ...(payroll.totalsByCurrency || []).flatMap((item): [string, string][] => [[`Net payroll (${item.currency})`, money(item.totalPayroll, item.currency)], [`Extra-day pay (${item.currency})`, money(item.totalSundayExtraPay, item.currency)]])] : [];
  const exportCsv = () => {
    const rows = [['Report', 'Metric', 'Value', 'Period'], ...attendanceRows.map(row => ['Attendance', ...row, attendance?.asOf || 'No attendance date']), ...leaveRows.map(row => ['Leave', ...row, 'All time']), ...payrollRows.map(row => ['Payroll', ...row, 'All time'])];
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'loop-admin-reports.csv'; link.click(); URL.revokeObjectURL(url);
  };
  const renderSummary = (rows: [string, number | string][]) => <dl className={styles.summary}>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
  return <AdminWorkspace actions={<><button className={styles.secondary} disabled={loading} onClick={load}>Refresh</button><button className={styles.primary} disabled={loading || (!attendance && !leave && !payroll)} onClick={exportCsv}>Export CSV</button><button className={styles.secondary} disabled={loading || (!attendance && !leave && !payroll)} onClick={() => window.print()}>Print / Save PDF</button></>}>
    {loading ? <p className={styles.empty} role="status">Loading reports…</p> : <>
      {!!errors.length && <p className={styles.error} role="alert">{errors.join(', ')} reports could not be loaded. Check your access or try again. <button className={styles.link} onClick={load}>Retry</button></p>}
      <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Attendance</h2><p>{attendance?.asOf ? `Latest recorded date: ${new Date(attendance.asOf).toLocaleDateString('en-IN')}` : 'Latest available attendance records'}</p></div><Link className={styles.link} href="/attendance">View attendance →</Link></div>{attendance ? renderSummary(attendanceRows) : <p className={styles.hint}>Attendance summary unavailable.</p>}</section>
      <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Leave requests</h2><p>All-time request totals</p></div><Link className={styles.link} href="/leave">Review leave →</Link></div>{leave ? renderSummary(leaveRows) : <p className={styles.hint}>Leave summary unavailable.</p>}</section>
      <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Payroll</h2><p>All periods · totals shown separately for each currency</p></div><Link className={styles.link} href="/finance">Open finance →</Link></div>{payroll ? <>{renderSummary(payrollRows)}{payroll.totalsByCurrency === undefined && <p className={styles.hint}>Currency totals are currently unavailable.</p>}</> : <p className={styles.hint}>Payroll summary unavailable.</p>}</section>
    </>}
  </AdminWorkspace>;
}
