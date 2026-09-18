'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminWorkspace from '@/components/admin/AdminWorkspace';
import styles from '@/components/admin/admin.module.css';
import AttendancePolicyEditor from '@/components/AttendancePolicyEditor';
import { apiFetchWithRetry } from '@/lib/api';
import { isDirectorRole, isSuperAdminRole, normalizeRole } from '@/lib/utils';

type Employee = { _id: string; employeeCode: string; firstName: string; lastName: string; email: string; role: string; department: string; storeId: string; isActive: boolean };
type Store = { _id: string; name: string };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [allStores, setAllStores] = useState(false);
  const [store, setStore] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const user = JSON.parse(window.sessionStorage.getItem('loop_admin_user') || '{}');
      const roles = (Array.isArray(user.role) ? user.role : [user.role]).filter(Boolean);
      const [roleData, storeData] = await Promise.all([
        apiFetchWithRetry<{ roleCode: string; featureAccessIds?: string[] }[]>('/master-data/roles'),
        apiFetchWithRetry<Store[]>('/stores'),
      ]);
      const canViewAll = isSuperAdminRole(user.role) || isDirectorRole(user.role) || roleData.some(item => roles.includes(item.roleCode) && item.featureAccessIds?.includes('feature-view-storewise-employees'));
      setAllStores(canViewAll); setStores(storeData);
      if (!canViewAll && !user.storeId) throw new Error('Your account has no assigned store. Ask an administrator to assign one.');
      const rows = await apiFetchWithRetry<Employee[]>(canViewAll ? '/employees' : `/employees/store/${encodeURIComponent(user.storeId)}`);
      setEmployees(rows);
      if (!canViewAll) setStore(user.storeId);
    } catch (failure) { setError(failure instanceof Error && failure.message.startsWith('Your account') ? failure.message : 'Unable to load employees and stores. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const storeNames = useMemo(() => new Map(stores.map(item => [item._id, item.name])), [stores]);
  const visible = useMemo(() => employees.filter(item => (!store || item.storeId === store) && (status === 'all' || (item.isActive !== false ? 'active' : 'inactive') === status) && `${item.firstName} ${item.lastName} ${item.employeeCode} ${item.email}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)), [employees, store, status, query]);
  return <AdminWorkspace actions={<button className={styles.secondary} disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Refresh'}</button>}>
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Employee directory</h2><p>Find your team, check store assignments and manage attendance limits.</p></div></div>
      <div className={styles.filters}><input aria-label="Search employees" placeholder="Search name, employee ID or email…" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Filter employees by store" value={store} disabled={!allStores} onChange={event => setStore(event.target.value)}>{allStores && <option value="">All stores</option>}{stores.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select><select aria-label="Filter employees by status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      {loading ? <p className={styles.empty} role="status">Loading employees…</p> : error ? <p className={styles.error} role="alert">{error} <button className={styles.link} onClick={load}>Try again</button></p> : <><p className={styles.count}>{visible.length} of {employees.length} employees</p><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Employee</th><th>Role / department</th><th>Store</th><th>Status</th><th>Attendance</th></tr></thead><tbody>{visible.map(item => <tr key={item._id}><td><strong>{`${item.firstName} ${item.lastName}`.trim() || item.employeeCode}</strong><small>{item.employeeCode} · {item.email}</small></td><td>{normalizeRole(item.role)}<small>{item.department || 'Unassigned'}</small></td><td>{storeNames.get(item.storeId) || item.storeId || 'Unassigned'}</td><td><span className={styles.badge} data-status={item.isActive !== false ? 'Active' : 'Inactive'}>{item.isActive !== false ? 'Active' : 'Inactive'}</span></td><td><AttendancePolicyEditor scope="employee" profileId={item.employeeCode} name={`${item.firstName} ${item.lastName}`} /></td></tr>)}{!visible.length && <tr><td colSpan={5} className={styles.empty}>No employees match your filters.</td></tr>}</tbody></table></div></>}
    </section>
  </AdminWorkspace>;
}
