'use client';

import AdminWorkspace, { AdminDialog } from '@/components/admin/AdminWorkspace';
import adminStyles from '@/components/admin/admin.module.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';

type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
type LeaveFilter = 'all' | LeaveStatus;

type StoreOption = {
  value: string;
  label: string;
};

type UserDirectoryRecord = {
  _id?: string;
  id?: string;
  employeeId?: string;
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  storeId?: string;
  storeName?: string;
  store?: string;
  department?: string;
};

type LeaveRequestRecord = {
  _id: string;
  leaveRequestId?: string;
  employeeId: string;
  storeId?: string | null;
  type: string;
  leaveType?: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: LeaveStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt?: string;
};

function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }

  const next = new Date(value);
  if (Number.isNaN(next.getTime())) {
    return '—';
  }

  return next.toLocaleDateString();
}

function formatDateInputValue(value?: string | null) {
  if (!value) {
    return '';
  }

  const next = new Date(value);
  if (Number.isNaN(next.getTime())) {
    return '';
  }

  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLeaveDays(value: number) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function toTitle(value?: string) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/_/g, ' ')
    .toLowerCase();

  if (!normalized) {
    return 'Other';
  }

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolveUserName(user?: UserDirectoryRecord) {
  const explicitName = String(user?.name ?? user?.fullName ?? '').trim();
  if (explicitName) {
    return explicitName;
  }

  const firstLast = [user?.firstName, user?.lastName]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ');
  if (firstLast) {
    return firstLast;
  }

  const emailHandle = String(user?.email ?? '').trim().split('@')[0];
  return emailHandle || 'Unknown employee';
}

function normalizeRoleValues(input: unknown): string[] {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  return values.map((entry) => String(entry ?? '').trim().toLowerCase()).filter(Boolean);
}

export default function LeaveRequestsPage() {
  const savingRef = useRef(false);
  const [query, setQuery] = useState('');
  const [review, setReview] = useState<LeaveRequestRecord | null>(null);
  const [success, setSuccess] = useState('');
  const [records, setRecords] = useState<LeaveRequestRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<LeaveFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [viewerStoreId, setViewerStoreId] = useState('');
  const [viewerId, setViewerId] = useState('');
  const [isStoreLocked, setIsStoreLocked] = useState(false);
  const [canManageStatuses, setCanManageStatuses] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [employeeNameById, setEmployeeNameById] = useState<Record<string, string>>({});
  const [storeLabelById, setStoreLabelById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const parsed = JSON.parse(window.sessionStorage.getItem('loop_admin_user') ?? '{}');
      const currentStoreId = String(parsed?.storeId ?? '').trim();
      const normalizedRoles = normalizeRoleValues(parsed?.role);
      const canViewAllStores = normalizedRoles.includes('director') || normalizedRoles.includes('super_admin') || normalizedRoles.includes('super_admin_it');
      const canApproveLeave = canViewAllStores || normalizedRoles.includes('store_admin') || normalizedRoles.includes('store_manager');

      setViewerStoreId(currentStoreId);
      setViewerId(String(parsed?._id ?? parsed?.id ?? parsed?.employeeId ?? '').trim());
      setIsStoreLocked(!canViewAllStores && Boolean(currentStoreId));
      setCanManageStatuses(canApproveLeave);
      setSelectedStoreId(canViewAllStores ? '' : currentStoreId);
    } catch {
      setViewerStoreId('');
      setViewerId('');
      setIsStoreLocked(false);
      setCanManageStatuses(false);
      setSelectedStoreId('');
    }
  }, []);

  const loadLeaveRequests = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const [directorPayload, usersPayload, storesPayload] = await Promise.allSettled([
        apiFetchWithRetry<LeaveRequestRecord[]>('/director/leave'),
        apiFetchWithRetry<UserDirectoryRecord[]>('/users'),
        apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores'),
      ]);

      const directorData = directorPayload.status === 'fulfilled' && Array.isArray(directorPayload.value)
        ? directorPayload.value
        : [];
      const users = usersPayload.status === 'fulfilled' && Array.isArray(usersPayload.value)
        ? usersPayload.value
        : [];
      const stores = storesPayload.status === 'fulfilled' && Array.isArray(storesPayload.value)
        ? storesPayload.value
        : [];

      const merged = directorData;
      const deduped = Array.from(new Map(merged.map((item) => [item._id, item])).values());

      const userNameMap = users.reduce<Record<string, string>>((accumulator, user) => {
        const employeeId = String(user?.employeeId ?? '').trim();
        if (employeeId) {
          accumulator[employeeId] = resolveUserName(user);
        }
        return accumulator;
      }, {});

      const normalizedStores = stores
        .map((store) => ({
          value: String(store?._id ?? store?.id ?? '').trim(),
          label: String(store?.name ?? '').trim(),
        }))
        .filter((store) => store.value && store.label)
        .sort((first, second) => first.label.localeCompare(second.label, undefined, { sensitivity: 'base' }));
      const storeMap = normalizedStores.reduce<Record<string, string>>((accumulator, store) => {
        accumulator[store.value] = store.label;
        return accumulator;
      }, {});

      setEmployeeNameById(userNameMap);
      setStoreOptions(normalizedStores);
      setStoreLabelById(storeMap);

      const normalized = deduped
        .filter((item) => item && item._id)
        .sort((a, b) => {
          const left = new Date(a.createdAt ?? a.startDate).getTime();
          const right = new Date(b.createdAt ?? b.startDate).getTime();
          return right - left;
        });

      setRecords(normalized);

      if (normalized.length === 0 && directorPayload.status === 'rejected') {
        setErrorMessage('Unable to load leave requests for current role.');
      }
    } catch {
      setRecords([]);
      setErrorMessage('Unable to load leave requests.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeaveRequests();
  }, [loadLeaveRequests]);

  const filteredRecords = useMemo(() => {
    const effectiveStoreId = isStoreLocked ? viewerStoreId : selectedStoreId;
    const scopedByStore = effectiveStoreId
      ? records.filter((item) => {
          const leaveStoreId = String(item.storeId ?? '').trim();
          return !leaveStoreId || leaveStoreId === effectiveStoreId;
        })
      : records;

    const scopedByDate = scopedByStore.filter((item) => {
      if (!`${employeeNameById[item.employeeId] || ''} ${item.employeeId} ${item.reason || ''}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
      const requestStart = formatDateInputValue(item.startDate);
      const requestEnd = formatDateInputValue(item.endDate);

      if (startDateFilter && requestEnd && requestEnd < startDateFilter) {
        return false;
      }

      if (endDateFilter && requestStart && requestStart > endDateFilter) {
        return false;
      }

      return true;
    });

    if (statusFilter === 'all') {
      return scopedByDate;
    }

    return scopedByDate.filter((item) => item.status === statusFilter);
  }, [endDateFilter, isStoreLocked, records, selectedStoreId, startDateFilter, statusFilter, viewerStoreId, query, employeeNameById]);

  const pendingCount = useMemo(
    () => records.filter((item) => item.status === 'pending').length,
    [records],
  );

  const updateStatus = async (leaveId: string, status: 'approved' | 'rejected') => {
    if (savingRef.current || !canManageStatuses) return;
    savingRef.current = true; setIsSaving(true); setErrorMessage(''); setSuccess('');
    try {
      await apiFetch(`/director/leave/${encodeURIComponent(leaveId)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status, approvedBy: viewerId }),
      });
      setReview(null);
      await loadLeaveRequests();
      setSuccess(`Leave request ${status}.`);
    } catch { setErrorMessage('The decision could not be saved. Refresh the request before trying again.'); }
    finally { savingRef.current = false; setIsSaving(false); }
  };

  return <AdminWorkspace actions={<button className={adminStyles.secondary} disabled={isLoading || isSaving} onClick={loadLeaveRequests}>Refresh</button>}>
    {success && <p className={adminStyles.notice} role="status">{success}</p>}
    {errorMessage && !review && <p className={adminStyles.error} role="alert">{errorMessage} <button className={adminStyles.link} onClick={loadLeaveRequests}>Try again</button></p>}
    <section className={adminStyles.panel}>
      <div className={adminStyles.panelHeader}><div><h2>Leave requests</h2><p>Review dates and reasons before approving or rejecting a request.</p></div></div>
      <div className={adminStyles.filters}>
        <input aria-label="Search leave requests" placeholder="Search employee name or ID…" value={query} onChange={event => setQuery(event.target.value)} />
        <label>Store<select value={(isStoreLocked ? viewerStoreId : selectedStoreId) || ''} disabled={isStoreLocked} onChange={event => setSelectedStoreId(event.target.value)}><option value="">All stores</option>{storeOptions.map(store => <option key={store.value} value={store.value}>{store.label}</option>)}</select></label>
        <label>Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value as LeaveFilter)}><option value="all">All requests</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option></select></label>
        <label>From<input type="date" value={startDateFilter} max={endDateFilter || undefined} onChange={event => setStartDateFilter(event.target.value)} /></label><label>To<input type="date" value={endDateFilter} min={startDateFilter || undefined} onChange={event => setEndDateFilter(event.target.value)} /></label>
        <button className={adminStyles.link} onClick={() => { setQuery(''); setStatusFilter('all'); setStartDateFilter(''); setEndDateFilter(''); if (!isStoreLocked) setSelectedStoreId(''); }}>Clear filters</button>
      </div>
      {isLoading ? <p className={adminStyles.empty} role="status">Loading leave requests…</p> : !errorMessage && <><p className={adminStyles.count}>{filteredRecords.length} requests shown · {filteredRecords.filter(item => item.status === 'pending').length} awaiting review</p><div className={adminStyles.tableWrap}><table className={adminStyles.table}><thead><tr><th>Employee</th><th>Store</th><th>Leave</th><th>Dates</th><th>Status</th><th /></tr></thead><tbody>{filteredRecords.map(record => <tr key={record._id}><td><strong>{employeeNameById[record.employeeId] || record.employeeId}</strong><small>{record.employeeId}</small></td><td>{storeLabelById[record.storeId || ''] || record.storeId || 'Unassigned'}</td><td>{toTitle(record.leaveType || record.type)}<small>{formatLeaveDays(Number(record.days))}</small></td><td>{formatDate(record.startDate)} – {formatDate(record.endDate)}</td><td><span className={adminStyles.badge} data-status={record.status}>{toTitle(record.status)}</span></td><td><button className={adminStyles.link} onClick={() => { setReview(record); setErrorMessage(''); }}>{record.status === 'pending' && canManageStatuses ? 'Review request' : 'View details'}</button></td></tr>)}{!filteredRecords.length && <tr><td colSpan={6} className={adminStyles.empty}>No leave requests match your filters.</td></tr>}</tbody></table></div></>}
    </section>
    {review && <AdminDialog title="Leave request" busy={isSaving} onClose={() => setReview(null)}>
      <header className={adminStyles.dialogHeader}><h2>Leave request</h2><button className={adminStyles.secondary} aria-label="Close leave request" disabled={isSaving} onClick={() => setReview(null)}>×</button></header>
      <div className={adminStyles.dialogBody}>{errorMessage && <p className={adminStyles.error} role="alert">{errorMessage}</p>}<h3>{employeeNameById[review.employeeId] || review.employeeId}</h3><dl className={adminStyles.summary}>{[['Employee ID', review.employeeId], ['Store', storeLabelById[review.storeId || ''] || review.storeId || 'Unassigned'], ['Type', toTitle(review.leaveType || review.type)], ['Dates', `${formatDate(review.startDate)} – ${formatDate(review.endDate)}`], ['Duration', formatLeaveDays(Number(review.days))], ['Status', toTitle(review.status)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><h4>Reason</h4><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{review.reason || 'No reason provided.'}</p></div>
      <footer className={adminStyles.dialogFooter}><button className={adminStyles.secondary} disabled={isSaving} onClick={() => setReview(null)}>Close</button>{review.status === 'pending' && canManageStatuses && <><button className={adminStyles.secondary} disabled={isSaving} onClick={() => updateStatus(review._id, 'rejected')}>Reject</button><button className={adminStyles.primary} disabled={isSaving} onClick={() => updateStatus(review._id, 'approved')}>{isSaving ? 'Saving…' : 'Approve leave'}</button></>}</footer>
    </AdminDialog>}
  </AdminWorkspace>;
}
