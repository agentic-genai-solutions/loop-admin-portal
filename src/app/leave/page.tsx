'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetchWithRetry } from '@/lib/api';

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
      setSelectedStoreId(currentStoreId);
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
      const [directorPayload, storeAdminPayload, usersPayload, storesPayload] = await Promise.allSettled([
        apiFetchWithRetry<LeaveRequestRecord[]>('/director/leave'),
        apiFetchWithRetry<LeaveRequestRecord[]>('/store-admin/leave'),
        apiFetchWithRetry<UserDirectoryRecord[]>('/users'),
        apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores'),
      ]);

      const directorData = directorPayload.status === 'fulfilled' && Array.isArray(directorPayload.value)
        ? directorPayload.value
        : [];
      const storeAdminData = storeAdminPayload.status === 'fulfilled' && Array.isArray(storeAdminPayload.value)
        ? storeAdminPayload.value
        : [];
      const users = usersPayload.status === 'fulfilled' && Array.isArray(usersPayload.value)
        ? usersPayload.value
        : [];
      const stores = storesPayload.status === 'fulfilled' && Array.isArray(storesPayload.value)
        ? storesPayload.value
        : [];

      const merged = [...directorData, ...storeAdminData];
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

      if (normalized.length === 0 && directorPayload.status === 'rejected' && storeAdminPayload.status === 'rejected') {
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
  }, [endDateFilter, isStoreLocked, records, selectedStoreId, startDateFilter, statusFilter, viewerStoreId]);

  const pendingCount = useMemo(
    () => records.filter((item) => item.status === 'pending').length,
    [records],
  );

  const updateStatus = async (leaveId: string, status: 'approved' | 'rejected') => {
    setIsSaving(true);
    setErrorMessage('');

    const payload = {
      status,
      approvedBy: viewerId || 'admin',
    };

    try {
      await apiFetchWithRetry(`/director/leave/${leaveId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } catch {
      try {
        await apiFetchWithRetry(`/store-admin/leave/${leaveId}/status`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } catch {
        setErrorMessage(`Unable to ${status} leave request.`);
      }
    } finally {
      setIsSaving(false);
      await loadLeaveRequests();
    }
  };

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 800 }}>Approvals</div>
            <h2 style={{ margin: '4px 0 0', fontSize: 24 }}>Leave Requests</h2>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              Store
              <select
                value={(isStoreLocked ? viewerStoreId : selectedStoreId) || ''}
                onChange={(event) => setSelectedStoreId(event.target.value)}
                disabled={isStoreLocked}
                style={{ minWidth: 180, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: isStoreLocked ? 'rgba(241,245,249,0.9)' : '#fff' }}
              >
                <option value="">All stores</option>
                {storeOptions.map((store) => (
                  <option key={store.value} value={store.value}>{store.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              From
              <input
                type="date"
                value={startDateFilter}
                onChange={(event) => setStartDateFilter(event.target.value)}
                style={{ minWidth: 160, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              To
              <input
                type="date"
                value={endDateFilter}
                onChange={(event) => setEndDateFilter(event.target.value)}
                style={{ minWidth: 160, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as LeaveFilter)}
                style={{ minWidth: 180, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="all">All ({records.length})</option>
                <option value="pending">Pending ({pendingCount})</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 20, color: '#64748b', fontWeight: 600 }}>Loading leave requests...</div>
        ) : errorMessage ? (
          <div style={{ padding: 20, color: '#b91c1c', fontWeight: 600 }}>{errorMessage}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Store</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length > 0 ? (
                  filteredRecords.map((record) => {
                    const isPending = record.status === 'pending';
                    const isHalfDay = Number(record.days) === 0.5;
                    const statusClass = record.status === 'approved'
                      ? 'success'
                      : record.status === 'pending'
                        ? 'warning'
                        : record.status === 'withdrawn'
                          ? 'info'
                          : 'danger';
                    const storeText = storeLabelById[String(record.storeId ?? '').trim()] || String(record.storeId ?? '').trim() || 'All stores';

                    return (
                      <tr key={record._id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>{employeeNameById[record.employeeId] || record.employeeId || '—'}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{record.employeeId || '—'}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{record.leaveRequestId || record._id}</div>
                        </td>
                        <td>{storeText}</td>
                        <td>
                          <div>{toTitle(record.type)}</div>
                          {record.leaveType ? <div style={{ fontSize: 12, color: '#64748b' }}>{toTitle(record.leaveType)}</div> : null}
                        </td>
                        <td>{formatDate(record.startDate)} - {formatDate(record.endDate)}</td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{formatLeaveDays(Number(record.days))}</div>
                          {isHalfDay ? (
                            <span className="badge warning" style={{ display: 'inline-block', padding: '6px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, marginTop: 6 }}>
                              Half Day Applied
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <span className={`badge ${statusClass}`} style={{ display: 'inline-block', padding: '6px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                            {String(record.status).replace(/_/g, ' ').toUpperCase()}
                          </span>
                          {record.approvedAt ? (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                              {formatDate(record.approvedAt)}
                            </div>
                          ) : null}
                        </td>
                        <td style={{ maxWidth: 280, color: '#475569' }}>{record.reason || '—'}</td>
                        <td>
                          {isPending && canManageStatuses ? (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px' }}
                                disabled={isSaving}
                                onClick={() => void updateStatus(record._id, 'rejected')}
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '6px 10px' }}
                                disabled={isSaving}
                                onClick={() => void updateStatus(record._id, 'approved')}
                              >
                                Approve
                              </button>
                            </div>
                          ) : isPending ? (
                            <span style={{ color: '#64748b', fontSize: 12 }}>Awaiting approval</span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: 12 }}>Completed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '24px 16px', color: '#64748b', fontWeight: 600 }}>
                      No leave requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
