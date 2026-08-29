'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, FeedbackToast } from '@/components/Feedback';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { fetchStores } from '@/lib/admin-data';
import { apiFetchWithRetry } from '@/lib/api';
import { hasITAdminAccess } from '@/lib/utils';

type Store = {
  id: string | number;
  name: string;
  city: string;
  locality: string;
  district: string;
  pinCode: string;
  localBody: string;
  type: string;
  status: string;
  isDeleted: boolean;
};
type SelectOption = { id: string; value: string; label: string };
type StoreOptionInput = string | SelectOption | null | undefined;
type StoreFormState = {
  name: string;
  locality: string;
  city: string;
  district: string;
  pinCode: string;
  localBody: string;
  type: SelectOption;
  status: SelectOption;
};
type StoreFormErrors = Partial<Record<keyof StoreFormState, string>>;

const EMPTY_SELECT_OPTION: SelectOption = { id: '', value: '', label: '' };

const toSelectOption = (options: SelectOption[], value: StoreOptionInput, fallback?: SelectOption): SelectOption => {
  if (typeof value === 'object' && value) {
    const objectValue = value.value ?? value.label ?? '';
    return options.find((option) => option.value === objectValue) ?? fallback ?? options[0] ?? { id: '', value: '', label: '' };
  }

  const stringValue = String(value ?? '').trim();
  return options.find((option) => option.value === stringValue) ?? fallback ?? options[0] ?? { id: '', value: '', label: '' };
};

const initialStores: Store[] = [];

const storeTypeOptions: SelectOption[] = [
  { id: 'corporate', value: 'Corporate', label: 'Corporate' },
  { id: 'retail', value: 'Retail', label: 'Retail' },
  { id: 'warehouse', value: 'Warehouse', label: 'Warehouse' },
  { id: 'distribution', value: 'Distribution', label: 'Distribution' },
];

const storeStatusOptions: SelectOption[] = [
  { id: 'new-setup', value: 'New Setup', label: 'New Setup' },
  { id: 'operational', value: 'Operational', label: 'Operational' },
  { id: 'maintenance', value: 'Maintenance', label: 'Maintenance' },
  { id: 'closed', value: 'Closed', label: 'Closed' },
];

const emptyStoreForm: StoreFormState = {
  name: '',
  locality: '',
  city: '',
  district: '',
  pinCode: '',
  localBody: '',
  type: EMPTY_SELECT_OPTION,
  status: EMPTY_SELECT_OPTION,
};

const validateStoreForm = (values: StoreFormState): StoreFormErrors => {
  const errors: StoreFormErrors = {};

  if (!values.name.trim()) errors.name = 'Store name is required.';
  if (!values.locality.trim()) errors.locality = 'Locality is required.';
  if (!values.city.trim()) errors.city = 'City is required.';
  if (!values.district.trim()) errors.district = 'District is required.';
  if (!values.pinCode.trim()) {
    errors.pinCode = 'PIN code is required.';
  } else if (!/^\d{6}$/.test(values.pinCode.trim())) {
    errors.pinCode = 'PIN code must be 6 digits.';
  }
  if (!values.localBody.trim()) errors.localBody = 'Local body is required.';
  if (!values.type?.value?.trim()) errors.type = 'Store type is required.';
  if (!values.status?.value?.trim()) errors.status = 'Status is required.';

  return errors;
};

const resolveOption = (options: SelectOption[], value: string | undefined, fallback?: SelectOption) =>
  options.find((option) => option.value === value) ?? fallback ?? options[0] ?? { id: '', value: '', label: '' };

const iconButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

export default function StoresPage() {
  const [stores, setStores] = useState(initialStores);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'location' | 'type' | 'status'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [pendingDeleteStore, setPendingDeleteStore] = useState<(typeof initialStores)[number] | null>(null);
  const [isDeletingStore, setIsDeletingStore] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [toast, setToast] = useState<{ title: string; description: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState<StoreFormState>({
    ...emptyStoreForm,
  });
  const [formErrors, setFormErrors] = useState<StoreFormErrors>({});

  const currentUserRole = useMemo(() => {
    if (typeof window === 'undefined') return '';

    try {
      const storedUser = JSON.parse(window.sessionStorage.getItem('loop_admin_user') ?? '{}');
      return String(storedUser?.role ?? '');
    } catch {
      return '';
    }
  }, []);

  const canViewDeletedRecords = hasITAdminAccess(currentUserRole);

  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      if (store.isDeleted && !canViewDeletedRecords) {
        return false;
      }

      const matchesQuery =
        query.trim().length === 0 ||
        store.name.toLowerCase().includes(query.toLowerCase()) ||
        store.city.toLowerCase().includes(query.toLowerCase());

      const matchesType = selectedType === 'All' || store.type === selectedType;
      return matchesQuery && matchesType;
    });
  }, [query, selectedType, stores, canViewDeletedRecords]);

  const sortedStores = useMemo(() => {
    const locationLabel = (store: Store) => [store.locality, store.city].filter(Boolean).join(', ') || store.city || '';

    return [...filteredStores].sort((first, second) => {
      const firstValue = sortBy === 'location' ? locationLabel(first) : first[sortBy];
      const secondValue = sortBy === 'location' ? locationLabel(second) : second[sortBy];
      const comparison = String(firstValue ?? '').localeCompare(String(secondValue ?? ''), undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredStores, sortBy, sortDirection]);

  const handleSort = (column: 'name' | 'location' | 'type' | 'status') => {
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection('asc');
  };

  const getSortArrow = (column: 'name' | 'location' | 'type' | 'status') => {
    if (sortBy !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const showToast = useCallback((description: string, type: 'success' | 'error' = 'success', title?: string) => {
    setToast({
      type,
      title: title ?? (type === 'success' ? 'Success' : 'Error'),
      description,
    });
  }, []);

  const loadStores = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const rows = await fetchStores();
      setStores(rows);
    } catch {
      setHasError(true);
      showToast('Failed to load stores after 3 attempts. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const handleSubmit = async () => {
    const nextErrors = validateStoreForm(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      showToast('Please complete all required store fields.', 'error');
      return;
    }

    const nextType = form.type?.value ?? '';
    const nextStatus = form.status?.value ?? '';
    const normalizedStore = {
      name: form.name.trim(),
      locality: form.locality.trim(),
      city: form.city.trim(),
      district: form.district.trim(),
      pinCode: form.pinCode.trim(),
      localBody: form.localBody.trim(),
      type: nextType,
      status: nextStatus,
    };

    setIsSavingStore(true);

    try {
      if (editingId !== null) {
        const storeId = String(editingId ?? '').trim();

        if (!storeId) {
          showToast('Invalid store record. Please refresh and try again.', 'error');
          return;
        }

        await apiFetchWithRetry(`/stores/${encodeURIComponent(storeId)}`, {
          method: 'PATCH',
          body: JSON.stringify(normalizedStore),
        });

        await loadStores();

        showToast('Store updated successfully.', 'success');
      } else {
        await apiFetchWithRetry('/stores', {
          method: 'POST',
          body: JSON.stringify(normalizedStore),
        });

        await loadStores();
        showToast('Store added successfully.', 'success');
      }

      setForm({ ...emptyStoreForm });
      setFormErrors({});
      setEditingId(null);
      setShowStoreModal(false);
    } catch {
      showToast(editingId !== null ? 'Failed to update store. Please try again.' : 'Failed to add store. Please try again.', 'error');
    } finally {
      setIsSavingStore(false);
    }
  };

  const handleEdit = (store: (typeof initialStores)[number]) => {
    setEditingId(store.id);
    setForm({
      name: store.name,
      locality: store.locality ?? '',
      city: store.city,
      district: store.district ?? '',
      pinCode: store.pinCode ?? '',
      localBody: store.localBody ?? '',
      type: toSelectOption(storeTypeOptions, store.type, EMPTY_SELECT_OPTION),
      status: toSelectOption(storeStatusOptions, store.status, EMPTY_SELECT_OPTION),
    });
    setFormErrors({});
    setShowStoreModal(true);
  };

  const handleDelete = (store: (typeof initialStores)[number]) => {
    setPendingDeleteStore(store);
  };

  const confirmDeleteStore = async () => {
    if (!pendingDeleteStore) {
      showToast('No store selected for deletion.', 'error', 'Delete failed');
      return;
    }

    const deletedStoreName = pendingDeleteStore.name;

    setIsDeletingStore(true);

    try {
      const storeId = String(pendingDeleteStore.id ?? '').trim();

      if (!storeId) {
        showToast('Invalid store record. Please refresh and try again.', 'error', 'Delete failed');
        return;
      }

      await apiFetchWithRetry(`/stores/${encodeURIComponent(storeId)}`, {
        method: 'DELETE',
      });

      await loadStores();
      showToast(`${deletedStoreName} has been removed from active store records.`, 'success', 'Store deleted');

      setPendingDeleteStore(null);
    } catch {
      showToast('Failed to delete store. Please try again.', 'error', 'Delete failed');
    } finally {
      setIsDeletingStore(false);
    }
  };

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 28 }}>
      {toast && <FeedbackToast title={toast.title} description={toast.description} type={toast.type} onClose={() => setToast(null)} durationMs={2800} />}
      <ConfirmDialog
        open={Boolean(pendingDeleteStore)}
        title="Delete store?"
        description={pendingDeleteStore ? <>Are you sure you want to delete <strong>{pendingDeleteStore.name}</strong>?</> : ''}
        confirmLabel="Delete store"
        isProcessing={isDeletingStore}
        onCancel={() => setPendingDeleteStore(null)}
        onConfirm={() => void confirmDeleteStore()}
      />

      {showStoreModal && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(760px, 100vw)', zIndex: 60, display: 'flex', flexDirection: 'column', background: '#f8fafc', borderLeft: '1px solid #e2e8f0', boxShadow: '-20px 0 60px rgba(15, 23, 42, 0.16)' }}>
          <div className="card" style={{ width: '100%', height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc', borderRadius: 0, boxShadow: 'none', border: 'none', borderLeft: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px 14px', borderBottom: '1px solid rgba(148,163,184,0.2)', position: 'sticky', top: 0, background: 'rgba(255,255,255,0.96)', zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.03em' }}>{editingId ? 'Edit store' : 'Add new store'}</h2>
              <button type="button" onClick={() => { setShowStoreModal(false); setEditingId(null); setForm({ ...emptyStoreForm }); setFormErrors({}); }} style={{ border: 'none', background: 'transparent', fontSize: 28, cursor: 'pointer', color: '#475569', lineHeight: 1, padding: 0 }}>×</button>
            </div>

            <div style={{ display: 'grid', gap: 14, padding: '24px 24px 0', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Store name
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.name ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.name && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.name}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Locality
                <input value={form.locality} onChange={(event) => setForm((current) => ({ ...current, locality: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.locality ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.locality && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.locality}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                City
                <input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.city ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.city && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.city}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                District
                <input value={form.district} onChange={(event) => setForm((current) => ({ ...current, district: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.district ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.district && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.district}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Pin code
                <input value={form.pinCode} onChange={(event) => setForm((current) => ({ ...current, pinCode: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.pinCode ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.pinCode && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.pinCode}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Municipality / Panchayat / Corporation
                <input value={form.localBody} onChange={(event) => setForm((current) => ({ ...current, localBody: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.localBody ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }} />
                {formErrors.localBody && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.localBody}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Store type
                <select value={form.type?.value ?? ''} onChange={(event) => setForm((current) => ({ ...current, type: toSelectOption(storeTypeOptions, event.target.value, EMPTY_SELECT_OPTION) }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.type ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }}>
                  <option value="">Select</option>
                  {storeTypeOptions.map((type) => (
                    <option key={type.id} value={type.value}>{type.label}</option>
                  ))}
                </select>
                {formErrors.type && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.type}</span>}
              </label>

              <label style={{ display: 'grid', gap: 8, color: '#475569', fontWeight: 700 }}>
                Status
                <select value={form.status?.value ?? ''} onChange={(event) => setForm((current) => ({ ...current, status: toSelectOption(storeStatusOptions, event.target.value, EMPTY_SELECT_OPTION) }))} style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.status ? '#b91c1c' : 'rgba(148,163,184,0.35)'}`, background: 'rgba(255,255,255,0.42)' }}>
                  <option value="">Select</option>
                  {storeStatusOptions.map((status) => (
                    <option key={status.id} value={status.value}>{status.label}</option>
                  ))}
                </select>
                {formErrors.status && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.status}</span>}
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-start', padding: '18px 24px 24px', marginTop: 8, borderTop: '1px solid rgba(148,163,184,0.2)', position: 'sticky', bottom: 0, background: 'rgba(255,255,255,0.96)', zIndex: 1 }}>
              <button type="button" onClick={() => void handleSubmit()} disabled={isSavingStore} style={{ padding: '10px 16px', borderRadius: 10, background: '#111827', color: '#fff', border: 'none', cursor: isSavingStore ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isSavingStore ? 0.7 : 1 }}>
                {isSavingStore ? (editingId ? 'Updating...' : 'Adding...') : (editingId ? 'Update store' : 'Add store')}
              </button>

              <button type="button" onClick={() => { setEditingId(null); setShowStoreModal(false); setForm({ ...emptyStoreForm }); setFormErrors({}); }} style={{ padding: '10px 16px', borderRadius: 10, background: '#e2e8f0', color: '#0f172a', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search store, city or manager"
              style={{ minWidth: 260, height: 42, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)', color: '#0f172a', fontSize: 15 }}
            />

            <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)} style={{ height: 42, minWidth: 160, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)', color: '#0f172a', fontSize: 15 }}>
              <option value="All">All Types</option>
              {storeTypeOptions.map((type) => (
                <option key={type.id} value={type.value}>{type.label}</option>
              ))}
            </select>

          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => void loadStores()} style={{ padding: '10px 16px', background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button type="button" onClick={() => { setEditingId(null); setForm({ ...emptyStoreForm }); setShowStoreModal(true); }} style={{ padding: '10px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
              + Add Store
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {isLoading ? (
            <TableSkeleton columns={5} rows={4} />
          ) : hasError ? (
            <EmptyState variant="error" onRetry={loadStores} />
          ) : (
            <table className="table" style={{ minWidth: 700, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#64748b', padding: '14px 12px' }}>
                    <button type="button" onClick={() => handleSort('name')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Store {getSortArrow('name')}
                    </button>
                  </th>
                  <th style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#64748b', padding: '14px 12px' }}>
                    <button type="button" onClick={() => handleSort('location')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Location {getSortArrow('location')}
                    </button>
                  </th>
                  <th style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#64748b', padding: '14px 12px' }}>
                    <button type="button" onClick={() => handleSort('type')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Type {getSortArrow('type')}
                    </button>
                  </th>
                  <th style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#64748b', padding: '14px 12px' }}>
                    <button type="button" onClick={() => handleSort('status')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Status {getSortArrow('status')}
                    </button>
                  </th>
                  <th style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, color: '#64748b', padding: '14px 12px', position: 'sticky', right: 0, background: '#fff', zIndex: 2 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedStores.length > 0 ? (
                  sortedStores.map((store) => {
                    const location = [store.locality, store.city].filter(Boolean).join(', ') || store.city || '—';

                    return (
                      <tr key={store.id}>
                        <td style={{ padding: '16px 12px', color: '#0f172a', fontWeight: 600 }}>{store.name}</td>
                        <td style={{ padding: '16px 12px', color: '#475569' }}>{location}</td>
                        <td style={{ padding: '16px 12px', color: '#475569' }}>{store.type}</td>
                        <td style={{ padding: '16px 12px' }}><span className={`badge ${store.status === 'Operational' ? 'success' : store.status === 'New Setup' ? 'info' : 'warning'}`}>{store.status}</span></td>
                        <td style={{ padding: '16px 12px', position: 'sticky', right: 0, background: '#fff', zIndex: 1 }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 92 }}>
                            <button type="button" aria-label={`Edit ${store.name}`} title="Edit store" onClick={() => handleEdit(store)} style={{ ...iconButtonStyle, background: '#dbeafe', color: '#1d4ed8' }}>
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                              </svg>
                            </button>
                            <button type="button" aria-label={`Delete ${store.name}`} title="Delete store" onClick={() => handleDelete(store)} style={{ ...iconButtonStyle, background: '#fee2e2', color: '#991b1b', borderColor: 'rgba(239,68,68,0.35)' }}>
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <EmptyState colSpan={5} title="No stores found" description="No stores match the current search or filters." />
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
