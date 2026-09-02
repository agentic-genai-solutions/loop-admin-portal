'use client';

import { ConfirmDialog, FeedbackToast } from '@/components/Feedback';
import { apiFetchWithRetry } from '@/lib/api';
import { getFieldBorder, inlineFieldErrorStyle } from '@/lib/form-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ScheduleBreak = {
  label: string;
  startTime: string;
  endTime: string;
  isPaid?: boolean;
};

type ScheduleBreakForm = {
  label: string;
  startTime: string;
  endTime: string;
};

type DesignationOption = {
  value: string;
  label: string;
};

type StoreOption = {
  value: string;
  label: string;
};

type ScheduleRecord = {
  _id: string;
  name: string;
  staffCategory: string;
  storeId?: string | null;
  startTime: string;
  endTime: string;
  shiftDurationMinutes: number;
  breaks: ScheduleBreak[];
  totalBreakMinutes: number;
  isActive: boolean;
};

type ScheduleFormState = {
  name: string;
  staffCategory: string;
  storeId: string;
  startTime: string;
  endTime: string;
  breaks: ScheduleBreakForm[];
};

type ScheduleSortField = 'name' | 'staffCategory' | 'shiftStart' | 'netMinutes' | 'status';

type ScheduleBreakFormErrors = {
  label?: string;
  startTime?: string;
  endTime?: string;
};

type ScheduleFormErrors = {
  name?: string;
  staffCategory?: string;
  startTime?: string;
  endTime?: string;
  breaks?: string;
  breakRows?: ScheduleBreakFormErrors[];
};

const createDefaultBreak = (): ScheduleBreakForm => ({
  label: 'Lunch',
  startTime: '13:00',
  endTime: '14:00',
});

const createEmptyForm = (): ScheduleFormState => ({
  name: '',
  staffCategory: '',
  storeId: '',
  startTime: '09:00',
  endTime: '18:00',
  breaks: [createDefaultBreak()],
});

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

export default function SchedulesMasterDataPage() {
  const scheduleNameInputRef = useRef<HTMLInputElement | null>(null);
  const [records, setRecords] = useState<ScheduleRecord[]>([]);
  const [designationOptions, setDesignationOptions] = useState<DesignationOption[]>([]);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [assignedStoreId, setAssignedStoreId] = useState('');
  const [isContextReady, setIsContextReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [toast, setToast] = useState<{ title: string; description: string; type: 'success' | 'error' } | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ScheduleRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(createEmptyForm());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [designationFilter, setDesignationFilter] = useState('all');
  const [sortField, setSortField] = useState<ScheduleSortField>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [formErrors, setFormErrors] = useState<ScheduleFormErrors>({});

  const showToast = useCallback((description: string, type: 'success' | 'error' = 'success', title?: string) => {
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

  const selectedStoreLabel = useMemo(
    () => storeOptions.find((item) => item.value === assignedStoreId)?.label ?? '',
    [assignedStoreId, storeOptions],
  );

  const designationLabelById = useMemo(
    () => new Map(designationOptions.map((item) => [item.value, item.label])),
    [designationOptions],
  );

  const storeLabelById = useMemo(
    () => new Map(storeOptions.map((item) => [item.value, item.label])),
    [storeOptions],
  );

  const formatMinutesAsHoursMinutes = useCallback((minutes: number) => {
    const safeMinutes = Math.max(Math.floor(Number(minutes) || 0), 0);
    const hours = Math.floor(safeMinutes / 60);
    const remainingMinutes = safeMinutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }, []);

  const parseTimeToMinutes = useCallback((value: string) => {
    const [hourPart, minutePart] = String(value ?? '').split(':');
    const hours = Number(hourPart);
    const minutes = Number(minutePart);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return 0;
    }

    return (hours * 60) + minutes;
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

    setIsLoading(true);

    try {
      const scheduleQuery = assignedStoreId
        ? `/admin/schedules?storeId=${encodeURIComponent(assignedStoreId)}`
        : '/admin/schedules';

      const [schedulesData, designationData, storesData] = await Promise.all([
        apiFetchWithRetry<ScheduleRecord[]>(scheduleQuery),
        apiFetchWithRetry<Array<{ _id?: string; code?: string; label?: string }>>('/master-data/designations').catch(() => []),
        apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores').catch(() => []),
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
      setRecords(Array.isArray(schedulesData) ? schedulesData : []);

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
      showToast('Unable to load schedules.', 'error', 'Load failed');
    } finally {
      setIsLoading(false);
    }
  }, [assignedStoreId, isContextReady, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isFormOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      scheduleNameInputRef.current?.focus();
      scheduleNameInputRef.current?.select();
    });
  }, [isFormOpen]);

  const resetForm = () => {
    const nextForm = createEmptyForm();
    if (assignedStoreId) {
      nextForm.storeId = assignedStoreId;
    }
    setForm(nextForm);
    setFormErrors({});
    setEditingId(null);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const breakPayload = useMemo(() => {
    return form.breaks
      .map((item) => ({
        label: item.label.trim(),
        startTime: item.startTime.trim(),
        endTime: item.endTime.trim(),
      }))
      .filter((item) => item.label && item.startTime && item.endTime);
  }, [form.breaks]);

  const addBreak = () => {
    setForm((current) => ({
      ...current,
      breaks: [...current.breaks, { label: '', startTime: '', endTime: '' }],
    }));
  };

  const updateBreak = (index: number, field: keyof ScheduleBreakForm, value: string) => {
    setForm((current) => ({
      ...current,
      breaks: current.breaks.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }));
  };

  const removeBreak = (index: number) => {
    setForm((current) => {
      const nextBreaks = current.breaks.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...current,
        breaks: nextBreaks.length > 0 ? nextBreaks : [createDefaultBreak()],
      };
    });
  };

  const saveRecord = async () => {
    const nextErrors: ScheduleFormErrors = {};
    const breakRowErrors: ScheduleBreakFormErrors[] = [];

    const normalizedName = form.name.trim();
    const normalizedStaffCategory = form.staffCategory.trim();
    const normalizedShiftStart = form.startTime.trim();
    const normalizedShiftEnd = form.endTime.trim();

    if (!normalizedName) {
      nextErrors.name = 'Schedule name is required.';
    }

    if (!normalizedStaffCategory) {
      nextErrors.staffCategory = 'Staff category is required.';
    }

    if (!normalizedShiftStart) {
      nextErrors.startTime = 'Shift start time is required.';
    }

    if (!normalizedShiftEnd) {
      nextErrors.endTime = 'Shift end time is required.';
    }

    const shiftStartMinutes = parseTimeToMinutes(normalizedShiftStart);
    const shiftEndMinutes = parseTimeToMinutes(normalizedShiftEnd);

    if (normalizedShiftStart && normalizedShiftEnd && shiftEndMinutes <= shiftStartMinutes) {
      nextErrors.endTime = 'Shift end time must be after start time.';
    }

    const completedBreaks: Array<{ index: number; start: number; end: number }> = [];
    let totalBreakMinutes = 0;

    form.breaks.forEach((breakItem, index) => {
      const label = breakItem.label.trim();
      const startTime = breakItem.startTime.trim();
      const endTime = breakItem.endTime.trim();
      const hasAnyValue = Boolean(label || startTime || endTime);

      if (!hasAnyValue) {
        breakRowErrors[index] = {};
        return;
      }

      const rowErrors: ScheduleBreakFormErrors = {};

      if (!label) {
        rowErrors.label = 'Break label is required.';
      }
      if (!startTime) {
        rowErrors.startTime = 'Break start time is required.';
      }
      if (!endTime) {
        rowErrors.endTime = 'Break end time is required.';
      }

      if (startTime && endTime) {
        const breakStartMinutes = parseTimeToMinutes(startTime);
        const breakEndMinutes = parseTimeToMinutes(endTime);

        if (breakEndMinutes <= breakStartMinutes) {
          rowErrors.endTime = 'Break end must be after start.';
        }

        if (normalizedShiftStart && normalizedShiftEnd) {
          if (breakStartMinutes < shiftStartMinutes || breakEndMinutes > shiftEndMinutes) {
            rowErrors.endTime = 'Break must be within shift time.';
          }
        }

        if (Object.keys(rowErrors).length === 0) {
          completedBreaks.push({ index, start: breakStartMinutes, end: breakEndMinutes });
          totalBreakMinutes += (breakEndMinutes - breakStartMinutes);
        }
      }

      breakRowErrors[index] = rowErrors;
    });

    const sortedBreaks = [...completedBreaks].sort((first, second) => first.start - second.start);
    for (let index = 1; index < sortedBreaks.length; index += 1) {
      const previous = sortedBreaks[index - 1];
      const current = sortedBreaks[index];
      if (current.start < previous.end) {
        breakRowErrors[current.index] = {
          ...(breakRowErrors[current.index] ?? {}),
          startTime: 'Break overlaps another break.',
        };
        nextErrors.breaks = 'Break timings cannot overlap.';
      }
    }

    if (normalizedShiftStart && normalizedShiftEnd && shiftEndMinutes > shiftStartMinutes && totalBreakMinutes >= (shiftEndMinutes - shiftStartMinutes)) {
      nextErrors.breaks = 'Total break duration must be less than shift duration.';
    }

    if (breakRowErrors.some((row) => row && Object.keys(row).length > 0)) {
      nextErrors.breakRows = breakRowErrors;
      if (!nextErrors.breaks) {
        nextErrors.breaks = 'Please fix break row errors.';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});

    try {
      const payload = {
        name: form.name.trim(),
        staffCategory: form.staffCategory.trim(),
        storeId: form.storeId.trim() || undefined,
        startTime: form.startTime.trim(),
        endTime: form.endTime.trim(),
        breaks: breakPayload,
      };

      if (editingId) {
        await apiFetchWithRetry(`/admin/schedules/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetchWithRetry('/admin/schedules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      closeForm();
      await loadData();
      showToast(editingId ? 'Schedule updated successfully.' : 'Schedule created successfully.');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Unable to save schedule.'), 'error', 'Save failed');
    }
  };

  const toggleStatus = async (record: ScheduleRecord) => {
    try {
      await apiFetchWithRetry(`/admin/schedules/${record._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !record.isActive }),
      });
      await loadData();
      showToast(`Schedule ${record.isActive ? 'deactivated' : 'activated'} successfully.`);
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Unable to update schedule status.'), 'error', 'Update failed');
    }
  };

  const deleteRecord = async (id: string) => {
    try {
      await apiFetchWithRetry(`/admin/schedules/${id}`, {
        method: 'DELETE',
      });

      if (editingId === id) {
        closeForm();
      }

      await loadData();
      showToast('Schedule deleted successfully.', 'success', 'Deleted');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Unable to delete schedule.'), 'error', 'Delete failed');
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

  const editRecord = (record: ScheduleRecord) => {
    setEditingId(record._id);
    setForm({
      name: record.name,
      staffCategory: record.staffCategory,
      storeId: assignedStoreId || String(record.storeId ?? ''),
      startTime: record.startTime,
      endTime: record.endTime,
      breaks:
        record.breaks?.length > 0
          ? record.breaks.map((item) => ({
              label: item.label,
              startTime: item.startTime,
              endTime: item.endTime,
            }))
          : [createDefaultBreak()],
    });
    setIsFormOpen(true);
  };

  const visibleRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filteredRecords = records.filter((record) => {
      if (statusFilter === 'active' && !record.isActive) {
        return false;
      }

      if (statusFilter === 'inactive' && record.isActive) {
        return false;
      }

      if (designationFilter !== 'all' && record.staffCategory !== designationFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const designationLabel = designationLabelById.get(record.staffCategory) ?? record.staffCategory;
      const breakText = (record.breaks ?? [])
        .map((item) => `${item.label} ${item.startTime} ${item.endTime}`)
        .join(' ');
      const storeText = storeLabelById.get(String(record.storeId ?? '').trim()) ?? String(record.storeId ?? '');

      const searchableText = [
        record.name,
        designationLabel,
        record.startTime,
        record.endTime,
        breakText,
        record.isActive ? 'active' : 'inactive',
        storeText,
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });

    return [...filteredRecords].sort((first, second) => {
      let comparison = 0;

      if (sortField === 'name') {
        comparison = first.name.localeCompare(second.name, undefined, { sensitivity: 'base' });
      } else if (sortField === 'staffCategory') {
        const firstLabel = designationLabelById.get(first.staffCategory) ?? first.staffCategory;
        const secondLabel = designationLabelById.get(second.staffCategory) ?? second.staffCategory;
        comparison = firstLabel.localeCompare(secondLabel, undefined, { sensitivity: 'base' });
      } else if (sortField === 'shiftStart') {
        comparison = parseTimeToMinutes(first.startTime) - parseTimeToMinutes(second.startTime);
      } else if (sortField === 'netMinutes') {
        const firstNet = Math.max(first.shiftDurationMinutes - first.totalBreakMinutes, 0);
        const secondNet = Math.max(second.shiftDurationMinutes - second.totalBreakMinutes, 0);
        comparison = firstNet - secondNet;
      } else {
        comparison = Number(first.isActive) - Number(second.isActive);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [designationFilter, designationLabelById, parseTimeToMinutes, records, searchQuery, sortDirection, sortField, statusFilter, storeLabelById]);

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 28, display: 'grid', gap: 20 }}>
      {toast && (
        <FeedbackToast
          title={toast.title}
          description={toast.description}
          type={toast.type}
          onClose={() => setToast(null)}
          durationMs={3000}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        title="Delete schedule"
        description={`Are you sure you want to delete ${deleteCandidate?.name ?? 'this schedule'}? This action cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void confirmDelete()}
      />

      {isFormOpen && (
        <div
          role="presentation"
          onClick={closeForm}
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingId ? 'Edit schedule' : 'Create schedule'}
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(920px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f8fafc', borderRadius: 18, boxShadow: '0 28px 80px rgba(15, 23, 42, 0.28)', border: '1px solid rgba(148,163,184,0.2)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid rgba(148,163,184,0.18)' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.03em' }}>{editingId ? 'Edit schedule' : 'Create schedule'}</h2>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Configure shift duration and break timing for a staff category.</p>
              </div>
              <button type="button" aria-label="Close dialog" title="Close dialog" onClick={closeForm} style={{ border: 'none', background: 'transparent', fontSize: 28, cursor: 'pointer', color: '#475569', lineHeight: 1, padding: 0 }}>×</button>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void saveRecord(); }} style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <input ref={scheduleNameInputRef} placeholder="Schedule Name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.name)) }} />
                  {formErrors.name && <small style={inlineFieldErrorStyle}>{formErrors.name}</small>}
                </div>
                <select
                  value={form.staffCategory}
                  onChange={(event) => setForm((current) => ({ ...current, staffCategory: event.target.value }))}
                  style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.staffCategory)), background: '#fff' }}
                >
                  <option value="">Select Designation</option>
                  {designationOptions.map((designation) => (
                    <option key={designation.value} value={designation.value}>{designation.label}</option>
                  ))}
                </select>
                <select
                  value={form.storeId}
                  onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))}
                  disabled={Boolean(assignedStoreId)}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)', background: assignedStoreId ? 'rgba(241,245,249,0.9)' : '#fff' }}
                >
                  <option value="">All stores / locations</option>
                  {storeOptions.map((store) => (
                    <option key={store.value} value={store.value}>{store.label}</option>
                  ))}
                </select>
                <div style={{ display: 'grid', gap: 4 }}>
                  <input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.startTime)) }} />
                  {formErrors.startTime && <small style={inlineFieldErrorStyle}>{formErrors.startTime}</small>}
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.endTime)) }} />
                  {formErrors.endTime && <small style={inlineFieldErrorStyle}>{formErrors.endTime}</small>}
                </div>
              </div>

              {formErrors.staffCategory && <small style={inlineFieldErrorStyle}>{formErrors.staffCategory}</small>}

              {assignedStoreId && (
                <p style={{ margin: '10px 0 0', color: '#64748b', fontSize: 13 }}>
                  Showing schedules for assigned store: {selectedStoreLabel || assignedStoreId}
                </p>
              )}

              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                {formErrors.breaks && <small style={inlineFieldErrorStyle}>{formErrors.breaks}</small>}
                {form.breaks.map((item, index) => (
                  <div key={`${index}-${item.label}-${item.startTime}-${item.endTime}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr) auto', gap: 10, alignItems: 'center' }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <input
                        placeholder={`Break Label ${index + 1}`}
                        value={item.label}
                        onChange={(event) => updateBreak(index, 'label', event.target.value)}
                        style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.breakRows?.[index]?.label)) }}
                      />
                      {formErrors.breakRows?.[index]?.label && <small style={inlineFieldErrorStyle}>{formErrors.breakRows[index]?.label}</small>}
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <input
                        type="time"
                        value={item.startTime}
                        onChange={(event) => updateBreak(index, 'startTime', event.target.value)}
                        style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.breakRows?.[index]?.startTime)) }}
                      />
                      {formErrors.breakRows?.[index]?.startTime && <small style={inlineFieldErrorStyle}>{formErrors.breakRows[index]?.startTime}</small>}
                    </div>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <input
                        type="time"
                        value={item.endTime}
                        onChange={(event) => updateBreak(index, 'endTime', event.target.value)}
                        style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.breakRows?.[index]?.endTime)) }}
                      />
                      {formErrors.breakRows?.[index]?.endTime && <small style={inlineFieldErrorStyle}>{formErrors.breakRows[index]?.endTime}</small>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBreak(index)}
                      style={{ borderRadius: 8, border: '1px solid rgba(148,163,184,.35)', background: '#fff', padding: '9px 12px', cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <div>
                  <button type="button" onClick={addBreak} className="btn btn-secondary">Add Break</button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="button" onClick={closeForm} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">{editingId ? 'Update Schedule' : 'Create Schedule'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 20, borderBottom: '1px solid rgba(148,163,184,0.18)', display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.2fr) repeat(4, minmax(140px, 1fr)) auto', gap: 10, alignItems: 'center' }}>
            <input
              placeholder="Search schedules"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)' }}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive')}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)', background: '#fff' }}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              value={designationFilter}
              onChange={(event) => setDesignationFilter(event.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)', background: '#fff' }}
            >
              <option value="all">All designations</option>
              {designationOptions.map((designation) => (
                <option key={designation.value} value={designation.value}>{designation.label}</option>
              ))}
            </select>
            <select
              value={sortField}
              onChange={(event) => setSortField(event.target.value as ScheduleSortField)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)', background: '#fff' }}
            >
              <option value="name">Sort: Name</option>
              <option value="staffCategory">Sort: Staff Category</option>
              <option value="shiftStart">Sort: Shift Start</option>
              <option value="netMinutes">Sort: Net Hours</option>
              <option value="status">Sort: Status</option>
            </select>
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,.35)', background: '#fff' }}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
              }}
              className="btn btn-primary"
            >
              Create Schedule
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: 20, color: '#64748b' }}>Loading schedules...</div>
        ) : (
          <table className="table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Staff Category</th>
                <th>Shift</th>
                <th>Breaks</th>
                <th>Net Hours</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRecords.length > 0 ? visibleRecords.map((record) => (
                <tr key={record._id}>
                  <td>{record.name}</td>
                  <td>{designationLabelById.get(record.staffCategory) ?? record.staffCategory}</td>
                  <td>{record.startTime} - {record.endTime}</td>
                  <td>
                    {record.breaks?.length ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {record.breaks.map((item, index) => (
                          <span
                            key={`${record._id}-break-${index}-${item.label}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              width: 'fit-content',
                              borderRadius: 999,
                              padding: '4px 10px',
                              fontSize: 12,
                              fontWeight: 600,
                              background: 'rgba(59,130,246,0.12)',
                              color: '#1e3a8a',
                              border: '1px solid rgba(59,130,246,0.22)',
                            }}
                          >
                            {item.label} ({item.startTime}-{item.endTime})
                          </span>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td>{formatMinutesAsHoursMinutes(Math.max(record.shiftDurationMinutes - record.totalBreakMinutes, 0))}</td>
                  <td>{record.isActive ? 'Active' : 'Inactive'}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      aria-label={`Edit ${record.name}`}
                      title="Edit schedule"
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
                      title={record.isActive ? 'Deactivate schedule' : 'Activate schedule'}
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
                      title="Delete schedule"
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
                  <td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: '20px 12px' }}>
                    {records.length > 0 ? 'No schedules match the current search or filters.' : 'No schedules found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
