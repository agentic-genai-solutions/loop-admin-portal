'use client';

import { ConfirmDialog, FeedbackToast } from '@/components/Feedback';
import { useEffect, useMemo, useState } from 'react';
import MasterDataWorkspace from '@/components/master-data/MasterDataWorkspace';
import { AdminDialog } from '@/components/admin/AdminWorkspace';
import admin from '@/components/admin/admin.module.css';
import master from '@/components/master-data/master-data.module.css';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';
import { getFieldBorder, inlineFieldErrorStyle } from '@/lib/form-ui';
import { useCallback, useRef } from 'react';

type LeaveCategoryRecord = {
  _id: string;
  code: string;
  name: string;
  staffCategory: string;
  storeId?: string | null;
  annualAllowanceDays: number;
  carryForwardAllowed: boolean;
  maxCarryForwardDays: number;
  allowHalfDay: boolean;
  isActive: boolean;
};

type DesignationOption = {
  value: string;
  label: string;
};

type StoreOption = {
  value: string;
  label: string;
};

type LeaveCategoryFormErrors = {
  name?: string;
  staffCategory?: string;
  annualAllowanceDays?: string;
  maxCarryForwardDays?: string;
};

const emptyForm = {
  name: 'Casual Leave',
  staffCategory: '',
  storeId: '',
  annualAllowanceDays: 6,
  carryForwardAllowed: false,
  maxCarryForwardDays: 0,
  allowHalfDay: false,
};

const iconButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 999,
  border: '1px solid rgba(148,163,184,0.3)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 120ms ease',
};

export default function LeaveCategoriesMasterDataPage() {
  const mutationLock = useRef(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [busy, setBusy] = useState(false);
  const runMutation = async (operation: () => Promise<void>) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true); setFeedbackError('');
    try { await operation(); } finally { mutationLock.current = false; setBusy(false); }
  };

  const leaveCategoryNameInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [records, setRecords] = useState<LeaveCategoryRecord[]>([]);
  const [designationOptions, setDesignationOptions] = useState<DesignationOption[]>([]);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [assignedStoreId, setAssignedStoreId] = useState('');
  const [isContextReady, setIsContextReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; description: string; type: 'success' | 'error' } | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<LeaveCategoryRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<LeaveCategoryFormErrors>({});

  const selectedStoreLabel = useMemo(
    () => storeOptions.find((item) => item.value === assignedStoreId)?.label ?? '',
    [assignedStoreId, storeOptions],
  );

  const designationLabelById = useMemo(
    () => new Map(designationOptions.map((item) => [item.value, item.label])),
    [designationOptions],
  );

  const showToast = useCallback((description: string, type: 'success' | 'error' = 'success', title?: string) => {
    setFeedbackError(type === 'error' ? description : '');
    setToast({
      title: title ?? (type === 'success' ? 'Success' : 'Error'),
      description,
      type,
    });
  }, []);

  const getApiErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (!(error instanceof Error) || !error.message) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(error.message) as { message?: string | string[] };
      if (Array.isArray(parsed?.message)) {
        const joinedMessage = parsed.message.filter(Boolean).join(', ');
        return joinedMessage || fallback;
      }

      if (typeof parsed?.message === 'string' && parsed.message.trim()) {
        return parsed.message;
      }
    } catch {
      return error.message;
    }

    return fallback;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedUser = window.sessionStorage.getItem('loop_admin_user');

    if (!storedUser) {
      setAssignedStoreId('');
      setIsContextReady(true);
      return;
    }

    try {
      const parsed = JSON.parse(storedUser);
      setAssignedStoreId(String(parsed?.storeId ?? '').trim());
    } catch {
      setAssignedStoreId('');
    } finally {
      setIsContextReady(true);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!isContextReady) {
      return;
    }

    setFeedbackError('');
    setIsLoading(true);

    try {
      const leaveCategoryQuery = assignedStoreId
        ? `/admin/leave-categories?storeId=${encodeURIComponent(assignedStoreId)}`
        : '/admin/leave-categories';

      const [leaveCategoryData, designationData, storesData] = await Promise.all([
        apiFetchWithRetry<LeaveCategoryRecord[]>(leaveCategoryQuery),
        apiFetchWithRetry<Array<{ _id?: string; code?: string; label?: string }>>('/master-data/designations'),
        apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores'),
      ]);

      const normalizedDesignations = (Array.isArray(designationData) ? designationData : [])
        .map((entry) => ({
          value: String(entry?._id ?? '').trim(),
          label: String(entry?.label ?? '').trim(),
        }))
        .filter((entry) => entry.value && entry.label)
        .sort((first, second) => first.label.localeCompare(second.label, undefined, { sensitivity: 'base' }));

      const normalizedStores = (Array.isArray(storesData) ? storesData : [])
        .map((store) => ({
          value: String(store?._id ?? store?.id ?? '').trim(),
          label: String(store?.name ?? '').trim(),
        }))
        .filter((entry) => entry.value && entry.label)
        .sort((first, second) => first.label.localeCompare(second.label, undefined, { sensitivity: 'base' }));

      setDesignationOptions(normalizedDesignations);
      setStoreOptions(normalizedStores);
      setRecords(Array.isArray(leaveCategoryData) ? leaveCategoryData : []);

      if (assignedStoreId) {
        setForm((current) => {
          if (current.storeId.trim()) {
            return current;
          }

          return {
            ...current,
            storeId: assignedStoreId,
          };
        });
      }
    } catch {
      showToast('Unable to load leave categories.', 'error', 'Load failed');
    } finally {
      setIsLoading(false);
    }
  }, [assignedStoreId, isContextReady, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetForm = () => {
    setFeedbackError('');
    const nextForm = { ...emptyForm, storeId: assignedStoreId || '' };
    setForm(nextForm);
    setFormErrors({});
    setEditingId(null);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const saveRecord = () => runMutation(() => saveRecordRequest());
  const saveRecordRequest = async () => {
    const nextErrors: LeaveCategoryFormErrors = {};
    const normalizedName = form.name.trim();
    const normalizedStaffCategory = form.staffCategory.trim();
    const allowance = Number(form.annualAllowanceDays);
    const carryForwardDays = Number(form.maxCarryForwardDays);

    if (!normalizedName) {
      nextErrors.name = 'Leave name is required.';
    }

    if (!normalizedStaffCategory) {
      nextErrors.staffCategory = 'Staff category is required.';
    }

    if (!Number.isFinite(allowance) || allowance < 0 || allowance > 366) {
      nextErrors.annualAllowanceDays = 'Allowance must be between 0 and 366.';
    }

    if (!Number.isFinite(carryForwardDays) || carryForwardDays < 0 || carryForwardDays > 366) {
      nextErrors.maxCarryForwardDays = 'Carry forward must be between 0 and 366.';
    }

    if (!form.carryForwardAllowed && carryForwardDays > 0) {
      nextErrors.maxCarryForwardDays = 'Set this to 0 when carry forward is disabled.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});

    try {
      const payload = {
        name: normalizedName,
        staffCategory: normalizedStaffCategory,
        storeId: form.storeId.trim() || undefined,
        annualAllowanceDays: allowance,
        carryForwardAllowed: Boolean(form.carryForwardAllowed),
        maxCarryForwardDays: carryForwardDays,
        allowHalfDay: Boolean(form.allowHalfDay),
      };

      if (editingId) {
        await apiFetch(`/admin/leave-categories/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/admin/leave-categories', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      closeForm();
      await loadData();
      showToast(editingId ? 'Leave category updated successfully.' : 'Leave category created successfully.');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Unable to save leave category.'), 'error', 'Save failed');
    }
  };

  const toggleStatus = (record: LeaveCategoryRecord) => runMutation(() => toggleStatusRequest(record));
  const toggleStatusRequest = async (record: LeaveCategoryRecord) => {
    try {
      await apiFetch(`/admin/leave-categories/${record._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !record.isActive }),
      });
      await loadData();
      showToast(`Leave category ${record.isActive ? 'deactivated' : 'activated'} successfully.`);
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Unable to update leave category status.'), 'error', 'Update failed');
    }
  };

  const deleteRecord = (id: string) => runMutation(() => deleteRecordRequest(id));
  const deleteRecordRequest = async (id: string) => {
    try {
      await apiFetch(`/admin/leave-categories/${id}`, {
        method: 'DELETE',
      });

      if (editingId === id) {
        closeForm();
      }

      await loadData();
      showToast('Leave category deleted successfully.', 'success', 'Deleted');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Unable to delete leave category.'), 'error', 'Delete failed');
    }
  };

  const confirmDelete = async () => {
    if (!deleteCandidate) {
      return;
    }

    const targetId = deleteCandidate._id;
    setDeleteCandidate(null);
    await deleteRecord(targetId);
  };

  const editRecord = (record: LeaveCategoryRecord) => {
    setEditingId(record._id);
    setForm({
      name: record.name,
      staffCategory: record.staffCategory,
      storeId: assignedStoreId || String(record.storeId ?? ''),
      annualAllowanceDays: Number(record.annualAllowanceDays),
      carryForwardAllowed: Boolean(record.carryForwardAllowed),
      maxCarryForwardDays: Number(record.maxCarryForwardDays),
      allowHalfDay: Boolean(record.allowHalfDay),
    });
    setIsFormOpen(true);
  };

  const applySeedValues = (seedCode: 'CASUAL' | 'SICK' | 'PRIVILEGE') => {
    if (seedCode === 'CASUAL') {
      setForm((current) => ({ ...current, name: 'Casual Leave', annualAllowanceDays: 6 }));
      return;
    }

    if (seedCode === 'SICK') {
      setForm((current) => ({ ...current, name: 'Sick Leave', annualAllowanceDays: 10 }));
      return;
    }

    setForm((current) => ({ ...current, name: 'Privilege Leave', annualAllowanceDays: 18 }));
  };

  const filteredRecords = records.filter(record =>
    `${record.name} ${record.code} ${designationLabelById.get(record.staffCategory) || ''}`.toLowerCase().includes(search.toLowerCase()) &&
    (status === 'all' || Boolean(record.isActive) === (status === 'active'))
  );
  return (
    <MasterDataWorkspace actions={<><button className={admin.secondary} disabled={isLoading || busy} onClick={() => void loadData()}>Refresh</button><button className={admin.primary} disabled={isLoading || busy} onClick={() => { resetForm(); setIsFormOpen(true); }}>+ Add leave category</button></>}>
      {feedbackError && !isFormOpen && <p className={admin.error} role="alert">{feedbackError}</p>}
      {toast && (
        <FeedbackToast
          title={toast.title}
          description={toast.description}
          type={toast.type}
          onClose={() => setToast(null)}
          durationMs={3400}
        />
      )}

      <ConfirmDialog
        isProcessing={busy}
        open={Boolean(deleteCandidate)}
        title="Delete leave category"
        description={`Are you sure you want to delete ${deleteCandidate?.name ?? 'this leave category'}? This action cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void confirmDelete()}
      />

      {isFormOpen && (
        <AdminDialog title="Leave categories" busy={busy} onClose={closeForm}>
            <div className={admin.dialogHeader}>
              <div>
                <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.03em' }}>{editingId ? 'Edit leave category' : 'Create leave category'}</h2>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Configure leave category policy by staff category.</p>
              </div>
              <button type="button" disabled={busy} aria-label="Close dialog" title="Close dialog" onClick={closeForm} style={{ border: 'none', background: 'transparent', fontSize: 28, cursor: 'pointer', color: '#475569', lineHeight: 1, padding: 0 }}>×</button>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void saveRecord(); }} className={master.form}><fieldset disabled={busy}>
{feedbackError && <p className={admin.error} role="alert">{feedbackError}</p>}
              <div className={master.formGrid}>
                <label style={{display: 'grid', gap: 8}}><span>Leave category name</span><input ref={leaveCategoryNameInputRef} placeholder="Name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.name)) }} />
                  {formErrors.name && <small style={inlineFieldErrorStyle}>{formErrors.name}</small>}</label>
                <label style={{display: 'grid', gap: 8}}><span>Designation</span><select
                  value={form.staffCategory}
                  onChange={(event) => setForm((current) => ({ ...current, staffCategory: event.target.value }))}
                  style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.staffCategory)), background: '#fff' }}
                >
                  <option value="">Select Designation</option>
                  {designationOptions.map((designation) => (
                    <option key={designation.value} value={designation.value}>{designation.label}</option>
                  ))}
                </select></label>
                <label style={{display: 'grid', gap: 8}}><span>Store</span><select
                  value={form.storeId}
                  onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))}
                  disabled={Boolean(assignedStoreId)}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)', background: assignedStoreId ? 'rgba(241,245,249,0.9)' : '#fff' }}
                >
                  <option value="">All stores / locations</option>
                  {storeOptions.map((store) => (
                    <option key={store.value} value={store.value}>{store.label}</option>
                  ))}
                </select></label>
                <label style={{display: 'grid', gap: 8}}><span>Annual allowance (days)</span><input type="number" min={0} max={366} value={form.annualAllowanceDays} onChange={(event) => setForm((current) => ({ ...current, annualAllowanceDays: Number(event.target.value) }))} style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.annualAllowanceDays)) }} />
                  {formErrors.annualAllowanceDays && <small style={inlineFieldErrorStyle}>{formErrors.annualAllowanceDays}</small>}</label>
                <label style={{display: 'grid', gap: 8}}><span>Maximum carry-forward (days)</span><input disabled={!form.carryForwardAllowed} type="number" min={0} max={366} value={form.maxCarryForwardDays} onChange={(event) => setForm((current) => ({ ...current, maxCarryForwardDays: Number(event.target.value) }))} style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.maxCarryForwardDays)) }} />
                  {formErrors.maxCarryForwardDays && <small style={inlineFieldErrorStyle}>{formErrors.maxCarryForwardDays}</small>}</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#334155' }}>
                  <input type="checkbox" checked={form.carryForwardAllowed} onChange={(event) => setForm((current) => ({ ...current, carryForwardAllowed: event.target.checked }))} />
                  Carry forward allowed
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#334155' }}>
                  <input type="checkbox" checked={form.allowHalfDay} onChange={(event) => setForm((current) => ({ ...current, allowHalfDay: event.target.checked }))} />
                  Allow half-day leave
                </label>
              </div>

              {formErrors.staffCategory && <small style={inlineFieldErrorStyle}>{formErrors.staffCategory}</small>}

              {assignedStoreId && (
                <p style={{ margin: '10px 0 0', color: '#64748b', fontSize: 13 }}>
                  Showing leave categories for assigned store: {selectedStoreLabel || assignedStoreId}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button type="button" onClick={() => applySeedValues('CASUAL')} style={{ borderRadius: 999, border: '1px solid rgba(148,163,184,.35)', background: '#fff', padding: '6px 10px', cursor: 'pointer' }}>Casual</button>
                <button type="button" onClick={() => applySeedValues('SICK')} style={{ borderRadius: 999, border: '1px solid rgba(148,163,184,.35)', background: '#fff', padding: '6px 10px', cursor: 'pointer' }}>Sick</button>
                <button type="button" onClick={() => applySeedValues('PRIVILEGE')} style={{ borderRadius: 999, border: '1px solid rgba(148,163,184,.35)', background: '#fff', padding: '6px 10px', cursor: 'pointer' }}>Privilege</button>
              </div>

              <div className={master.formFooter}>
                <button type="button" onClick={closeForm} className={admin.secondary}>Cancel</button>
                <button type="submit" className={admin.primary}>{editingId ? 'Update Leave Category' : 'Create Leave Category'}</button>
              </div>
            </fieldset></form>
        </AdminDialog>
      )}

      <div className={master.tablePanel}>
<div className={admin.panelHeader}><div><h2>Leave categories</h2><p>Manage leave allowances, carry-forward limits, and eligibility.</p></div></div>
        <div className={admin.filters}><input aria-label="Search leave categories" placeholder="Search name, code, or designation" value={search} onChange={e => setSearch(e.target.value)} /><label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
        <p className={admin.count}>{filteredRecords.length} of {records.length} categories shown</p>
        {isLoading ? (
          <div style={{ padding: 20, color: '#64748b' }}>Loading leave categories...</div>
        ) : (
          <table className={admin.table} style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Staff Category</th>
                <th>Allowance</th>
                <th>Carry Forward</th>
                <th>Half Day</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length > 0 ? filteredRecords.map((record) => (
                <tr key={record._id}>
                  <td>{record.name}</td>
                  <td>{designationLabelById.get(record.staffCategory) ?? record.staffCategory}</td>
                  <td>{record.annualAllowanceDays} days</td>
                  <td>{record.carryForwardAllowed ? `Yes (${record.maxCarryForwardDays})` : 'No'}</td>
                  <td>{record.allowHalfDay ? 'Yes' : 'No'}</td>
                  <td>{record.isActive ? 'Active' : 'Inactive'}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      aria-label={`Edit ${record.name}`}
                      title="Edit leave category"
                      onClick={() => editRecord(record)}
                      style={{ ...iconButtonStyle, background: '#dbeafe', color: '#1d4ed8' }}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={record.isActive ? `Deactivate ${record.name}` : `Activate ${record.name}`}
                      title={record.isActive ? 'Deactivate leave category' : 'Activate leave category'}
                      onClick={() => void toggleStatus(record)}
                      style={{
                        ...iconButtonStyle,
                        background: record.isActive ? '#fef3c7' : '#e2e8f0',
                        color: record.isActive ? '#92400e' : '#334155',
                      }}
                    >
                      {record.isActive ? (
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M8 12h8" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M5 12h14" />
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${record.name}`}
                      title="Delete leave category"
                      onClick={() => setDeleteCandidate(record)}
                      style={{ ...iconButtonStyle, background: '#fee2e2', color: '#991b1b', borderColor: 'rgba(239,68,68,0.35)' }}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: '20px 12px' }}>No leave categories found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </MasterDataWorkspace>
  );
}
