'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog, FeedbackToast } from '@/components/Feedback';
import MasterDataWorkspace from '@/components/master-data/MasterDataWorkspace';
import { AdminDialog } from '@/components/admin/AdminWorkspace';
import admin from '@/components/admin/admin.module.css';
import master from '@/components/master-data/master-data.module.css';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';
import { getFieldBorder, inlineFieldErrorStyle } from '@/lib/form-ui';
import { hasITAdminAccess } from '@/lib/utils';

const typeOptions = [
  { id: '0c4ac6d7-2ec2-4c6a-9d8d-2e0a8d06a111', code: 'board_level', label: 'Board Level' },
  { id: '1d57e3be-32f2-4fae-a0a3-fc5f2dd90d22', code: 'management', label: 'Management' },
  { id: '2d43b2d1-9d62-4ccd-b7e9-9f8a6efc6f33', code: 'store_level', label: 'Store Level' },
  { id: '3e4c1e8a-b3d0-4f5f-8d6d-34c0f5da84aa', code: 'operations', label: 'Operations' },
  { id: '4f411c47-7a02-4dbd-9a0e-dfbe4a723344', code: 'finance', label: 'Finance' },
  { id: '5af74fd4-1d21-4061-a1dc-15383f2a7222', code: 'support', label: 'Support' },
  { id: '6bbe868e-1938-48fa-8f90-a71d3f6a2f1b', code: 'procurement', label: 'Procurement' },
  { id: '7ca1d532-8d11-4b28-a4a0-63b1d8ff2a7c', code: 'information_technology', label: 'Information technology' },
  { id: '8d2d0fad-652d-4a5a-93e8-eae41687a9f8', code: 'visual_media', label: 'Visual Media' },
  { id: '9e166d2e-9148-4ff0-a74b-40e9c06e4e0d', code: 'design', label: 'Design' },
  { id: 'af62d0ef-9f31-4af0-baf7-c2a0d9a0ca4e', code: 'advertisemnt', label: 'Advertisemnt' },
  { id: 'bf43ca30-8375-4f4d-9af5-1d50d0a224fb', code: 'member', label: 'Member' },
];

const accessLevelOptions = [
  { id: 'a1978dad-03f8-4d4d-8d16-592b4d786700', code: 'full_access', label: 'Full Access' },
  { id: 'b2a65ed9-109b-4895-9e9d-81d9d4a103b8', code: 'high', label: 'High' },
  { id: 'c3d9a8ac-3f1b-4b17-bf31-6f7c4c4efba1', code: 'medium', label: 'Medium' },
  { id: 'd4b2b71b-2b35-4317-9362-86f8358db864', code: 'limited', label: 'Limited' },
  { id: 'e5f5b0c4-1b60-4c53-9f34-a8167ee7d0f8', code: 'read_only', label: 'Read Only' },
];

const scopeOptions = [
  { id: 'a6f4fcb7-0b51-4567-94c7-9b8be3b2ca81', code: 'all_stores', label: 'All Stores' },
  { id: 'b7ecf0ea-f8c4-4b5b-8c92-d5f0a4ec58d1', code: 'specific_store', label: 'Specific Store' },
  { id: 'c8d5b876-1328-47cf-b816-d0f5d8b70b32', code: 'central_inventory', label: 'Central Inventory' },
  { id: 'd93efea2-0a18-4c0e-a2d1-03a6d0d07b42', code: 'all_locations', label: 'All Locations' },
];

const categoryOptions = [
  { id: 'e1bb5af4-f4bb-4658-9887-8036eb0b94bd', code: 'leadership', label: 'Leadership' },
  { id: 'f2c0df9d-8d4e-45db-b134-067bdbaa9b8d', code: 'management', label: 'Management' },
  { id: 'g3f1df8f-0c34-45a0-a69b-2d9d4d9b9c01', code: 'operations', label: 'Operations' },
  { id: 'h4d8124a-7420-49d8-b2e8-198728f3d71c', code: 'finance', label: 'Finance' },
  { id: 'i5e2137e-d62d-4f3a-8de9-9942c92a5c28', code: 'support', label: 'Support' },
  { id: 'j6f6ed27-a87b-4382-98ea-1658a3d960b9', code: 'procurement', label: 'Procurement' },
  { id: 'k7c2e41d-0ec8-4d9c-a649-b6ec4819d59e', code: 'information_technology', label: 'Information technology' },
  { id: 'l8aa6d42-1e5d-47d1-bf42-71f3b1b85d5a', code: 'visual_media', label: 'Visual Media' },
  { id: 'm9cf2f4a-303a-4d53-8182-3d6e0c5020de', code: 'design', label: 'Design' },
  { id: 'n1af1054-987d-4a82-a924-e9f6b7a4c465', code: 'advertisemnt', label: 'Advertisemnt' },
  { id: 'o2d41b6a-672c-4f0c-9737-b9d1d4d4a7c2', code: 'member', label: 'Member' },
  { id: 'p3ef1c2b-9c0f-44da-9980-a14c7b021a90', code: 'contractor', label: 'Contractor' },
];

const normalizeOptionCode = (value: string | undefined, options: Array<{ code: string; label: string }>) => {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const byCode = options.find((option) => option.code === trimmed);
  if (byCode) {
    return byCode.code;
  }

  const byLabel = options.find((option) => option.label.toLowerCase() === trimmed.toLowerCase());
  if (byLabel) {
    return byLabel.code;
  }

  return trimmed;
};

const emptyRoleForm = {
  roleCode: '',
  label: '',
  description: '',
  type: '',
  accessLevel: '',
  scope: '',
  category: '',
  includeInRoleAccessMatrix: true,
};

type RoleRecord = {
  _id?: string;
  roleCode: string;
  label: string;
  description?: string;
  type?: string;
  accessLevel: string;
  scope: string;
  category: string;
  isActive?: boolean;
  includeInRoleAccessMatrix?: boolean;
};

type RoleFormErrors = {
  label?: string;
  type?: string;
  accessLevel?: string;
  scope?: string;
  category?: string;
};

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

export default function RolesMasterDataPage() {
  const mutationLock = useRef(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [busy, setBusy] = useState(false);
  const runMutation = async (operation: () => Promise<void>) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true); setFeedbackError('');
    try { await operation(); } finally { mutationLock.current = false; setBusy(false); }
  };

  const router = useRouter();
  const roleLabelInputRef = useRef<HTMLInputElement | null>(null);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ title: string; description: string; type: 'success' | 'error' } | null>(null);
  const [roleForm, setRoleForm] = useState(emptyRoleForm);
  const [editingRoleCode, setEditingRoleCode] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<RoleRecord | null>(null);
  const [roleSearch, setRoleSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'label' | 'description' | 'category'>('label');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [formErrors, setFormErrors] = useState<RoleFormErrors>({});

  const showToast = useCallback((description: string, type: 'success' | 'error' = 'success', title?: string) => {
    setFeedbackError(type === 'error' ? description : '');
    setToast({
      type,
      title: title ?? (type === 'success' ? 'Success' : 'Error'),
      description,
    });
  }, []);

  const loadData = useCallback(async () => {
    setFeedbackError('');
    setLoading(true);

    try {
      const roleData = await apiFetchWithRetry<RoleRecord[]>('/master-data/roles');
      setRoles(Array.isArray(roleData) ? roleData : []);
    } catch {
      showToast('Failed to load role master data.', 'error', 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isFormOpen) {
      return;
    }

    window.requestAnimationFrame(() => {
      roleLabelInputRef.current?.focus();
      roleLabelInputRef.current?.select();
    });
  }, [isFormOpen]);

  const getApiErrorMessage = (error: unknown, fallback: string) => {
    if (!(error instanceof Error) || !error.message) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(error.message) as { message?: string | string[] };
      if (Array.isArray(parsed?.message)) {
        const joined = parsed.message.filter(Boolean).join(', ');
        return joined || fallback;
      }

      if (typeof parsed?.message === 'string' && parsed.message.trim()) {
        return parsed.message;
      }
    } catch {
      return error.message;
    }

    return fallback;
  };

  const resetRoleForm = () => {
    setFeedbackError('');
    setEditingRoleCode(null);
    setRoleForm(emptyRoleForm);
    setFormErrors({});
  };

  const closeRoleForm = () => {
    setIsFormOpen(false);
    resetRoleForm();
  };

  const closeDeleteConfirm = () => {
    setDeleteCandidate(null);
  };

  const saveRole = () => runMutation(() => saveRoleRequest());
  const saveRoleRequest = async () => {
    const nextErrors: RoleFormErrors = {};

    if (!roleForm.label.trim()) {
      nextErrors.label = 'Role name is required.';
    }

    if (!roleForm.type.trim()) {
      nextErrors.type = 'Type is required.';
    }

    if (!roleForm.accessLevel.trim()) {
      nextErrors.accessLevel = 'Access level is required.';
    }

    if (!roleForm.scope.trim()) {
      nextErrors.scope = 'Scope is required.';
    }

    if (!roleForm.category.trim()) {
      nextErrors.category = 'Category is required.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});

    try {
      const trimmedRoleCode = roleForm.roleCode.trim();
      const payload = {
        ...(trimmedRoleCode ? { roleCode: trimmedRoleCode } : {}),
        label: roleForm.label,
        description: roleForm.description,
        type: roleForm.type.trim(),
        accessLevel: roleForm.accessLevel.trim(),
        scope: roleForm.scope.trim(),
        category: roleForm.category.trim(),
        includeInRoleAccessMatrix: Boolean(roleForm.includeInRoleAccessMatrix),
      };

      await apiFetch('/master-data/roles', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      closeRoleForm();
      await loadData();
      showToast(editingRoleCode ? 'Role updated successfully.' : 'Role saved successfully.', 'success');
    } catch {
      showToast('Unable to save role.', 'error');
    }
  };

  const deleteRole = (roleCode: string) => runMutation(() => deleteRoleRequest(roleCode));
  const deleteRoleRequest = async (roleCode: string) => {
    try {
      await apiFetch(`/master-data/roles/${roleCode}`, { method: 'DELETE' });
      if (editingRoleCode === roleCode) {
        resetRoleForm();
      }
      await loadData();
      showToast('Role has been deleted from master data.', 'success', 'Role deleted');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Unable to delete role.'), 'error', 'Delete failed');
    }
  };

  const confirmDeleteRole = async () => {
    if (!deleteCandidate) {
      return;
    }

    const { roleCode } = deleteCandidate;
    closeDeleteConfirm();
    await deleteRole(roleCode);
  };

  const openRoleEditor = (role: RoleRecord) => {
    setEditingRoleCode(role.roleCode);
    setFormErrors({});
    setRoleForm({
      roleCode: role.roleCode,
      label: role.label,
      description: role.description ?? '',
      type: normalizeOptionCode(role.type, typeOptions),
      accessLevel: normalizeOptionCode(role.accessLevel, accessLevelOptions),
      scope: normalizeOptionCode(role.scope, scopeOptions),
      category: normalizeOptionCode(role.category, categoryOptions),
      includeInRoleAccessMatrix: Boolean(role.includeInRoleAccessMatrix ?? true),
    });
    setIsFormOpen(true);
  };

  const openCreateRole = () => {
    resetRoleForm();
    setIsFormOpen(true);
  };

  const filteredRoles = useMemo(() => {
    const query = roleSearch.trim().toLowerCase();

    return roles.filter((role) => {
      const matchesCategory = categoryFilter === 'All' || role.category === categoryFilter || role.type === categoryFilter;
      const matchesSearch = !query || [role.label, role.description, role.roleCode, role.category, role.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [roles, categoryFilter, roleSearch]);

  const sortedRoles = useMemo(() => {
    return [...filteredRoles].sort((first, second) => {
      const firstValue = sortBy === 'label' ? first.label : sortBy === 'description' ? (first.description ?? '') : (first.category ?? '');
      const secondValue = sortBy === 'label' ? second.label : sortBy === 'description' ? (second.description ?? '') : (second.category ?? '');
      const comparison = String(firstValue).localeCompare(String(secondValue), undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRoles, sortBy, sortDirection]);

  const handleSort = (column: 'label' | 'description' | 'category') => {
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection('asc');
  };

  const getSortArrow = (column: 'label' | 'description' | 'category') => {
    if (sortBy !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <MasterDataWorkspace actions={<><button className={admin.secondary} disabled={loading || busy} onClick={() => void loadData()}>Refresh</button><button className={admin.primary} disabled={loading || busy} onClick={openCreateRole}>+ Add role</button></>}>
      {feedbackError && !isFormOpen && <p className={admin.error} role="alert">{feedbackError}</p>}
      {toast && <FeedbackToast title={toast.title} description={toast.description} type={toast.type} onClose={() => setToast(null)} durationMs={3200} />}

      <div style={{ display: 'grid', gap: 20 }}>
        {isFormOpen && (
          <AdminDialog title="Roles" busy={busy} onClose={closeRoleForm}>
            <div className={admin.dialogHeader}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.03em' }}>{editingRoleCode ? 'Edit role' : 'Add new role'}</h2>
                  <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Set the role’s purpose, scope, and access level.</p>
                </div>
                <button type="button" disabled={busy} aria-label="Close dialog" title="Close dialog" onClick={closeRoleForm} style={{ border: 'none', background: 'transparent', fontSize: 28, cursor: 'pointer', color: '#475569', lineHeight: 1, padding: 0 }}>×</button>
              </div>

              <form onSubmit={(event) => { event.preventDefault(); void saveRole(); }} className={master.form}><fieldset disabled={busy}>
{feedbackError && <p className={admin.error} role="alert">{feedbackError}</p>}
                <div className={master.formGrid}>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>Role</span>
                    <input
                      ref={roleLabelInputRef}
                      value={roleForm.label}
                      onChange={(event) => {
                        const nextLabel = event.target.value;
                        setRoleForm((current) => ({
                          ...current,
                          label: nextLabel,
                        }));
                      }}
                      style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.label)) }}
                    />
                    {formErrors.label && <small style={inlineFieldErrorStyle}>{formErrors.label}</small>}
                  </label>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>Type</span>
                    <select value={roleForm.type} onChange={(event) => setRoleForm((current) => ({ ...current, type: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.type)) }}>
                      <option value="">Select</option>
                      {typeOptions.map((option) => (
                        <option key={option.id} value={option.code}>{option.label}</option>
                      ))}
                    </select>
                    {formErrors.type && <small style={inlineFieldErrorStyle}>{formErrors.type}</small>}
                  </label>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>Access level</span>
                    <select value={roleForm.accessLevel} onChange={(event) => setRoleForm((current) => ({ ...current, accessLevel: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.accessLevel)) }}>
                      <option value="">Select</option>
                      {accessLevelOptions.map((option) => (
                        <option key={option.id} value={option.code}>{option.label}</option>
                      ))}
                    </select>
                    {formErrors.accessLevel && <small style={inlineFieldErrorStyle}>{formErrors.accessLevel}</small>}
                  </label>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>Scope</span>
                    <select value={roleForm.scope} onChange={(event) => setRoleForm((current) => ({ ...current, scope: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.scope)) }}>
                      <option value="">Select</option>
                      {scopeOptions.map((option) => (
                        <option key={option.id} value={option.code}>{option.label}</option>
                      ))}
                    </select>
                    {formErrors.scope && <small style={inlineFieldErrorStyle}>{formErrors.scope}</small>}
                  </label>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>Category</span>
                    <select value={roleForm.category} onChange={(event) => setRoleForm((current) => ({ ...current, category: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.category)) }}>
                      <option value="">Select</option>
                      {categoryOptions.map((option) => (
                        <option key={option.id} value={option.code}>{option.label}</option>
                      ))}
                    </select>
                    {formErrors.category && <small style={inlineFieldErrorStyle}>{formErrors.category}</small>}
                  </label>
                  <label style={{ display: 'grid', gap: 8, gridColumn: '1 / -1' }}>
                    <span style={{ fontWeight: 700 }}>Description</span>
                    <input
                      value={roleForm.description}
                      onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                    />
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, gridColumn: '1 / -1', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: '#fff' }}>
                    <span style={{ fontWeight: 700 }}>Include in role-based access matrix</span>
                    <input
                      type="checkbox"
                      checked={Boolean(roleForm.includeInRoleAccessMatrix)}
                      onChange={(event) => setRoleForm((current) => ({ ...current, includeInRoleAccessMatrix: event.target.checked }))}
                    />
                  </label>
                </div>
                <div className={master.formFooter}>
                  <button type="submit" style={{ padding: '10px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    {editingRoleCode ? 'Update role' : 'Save role'}
                  </button>
                  <button type="button" onClick={closeRoleForm} style={{ padding: '10px 16px', background: 'transparent', color: '#0f172a', border: '1px solid rgba(148,163,184,0.5)', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    Cancel
                  </button>
                </div>
              </fieldset></form>
        </AdminDialog>
      )}

        <section className={master.panel}>
<div className={admin.panelHeader}><div><h2>Roles</h2><p>Define roles and how they are used across your organization.</p></div></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, flex: '1 1 640px' }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Role search</span>
                <input
                  value={roleSearch}
                  onChange={(event) => setRoleSearch(event.target.value)}
                  placeholder="Search role, description or code"
                  style={{ height: 42, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Category filter</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  style={{ height: 42, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}
                >
                  <option value="All">All categories</option>
                  {Array.from(new Set(roles.map(role => role.category).filter(Boolean))).sort().map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>

            </div>


          </div>

          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className={admin.tableWrap}>
              <table className={admin.table} style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>
                      <button type="button" onClick={() => handleSort('label')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                        Role {getSortArrow('label')}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => handleSort('description')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                        Description {getSortArrow('description')}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => handleSort('category')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                        Category {getSortArrow('category')}
                      </button>
                    </th>
                    <th style={{ position: 'sticky', right: 0, background: '#fff', zIndex: 2 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRoles.map((role) => (
                    <tr key={role._id || role.roleCode}>
                      <td style={{ whiteSpace: 'nowrap' }}>{role.label}</td>
                      <td style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', minWidth: 280 }}>{role.description || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{role.category}</td>
                      <td style={{ position: 'sticky', right: 0, background: '#fff', zIndex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap', minWidth: 86 }}>
                          <button
                            type="button"
                            aria-label={`Edit ${role.label}`}
                            title="Edit role"
                            onClick={() => openRoleEditor(role)}
                            style={{ ...iconButtonStyle, background: '#dbeafe', color: '#1d4ed8' }}
                          >
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${role.label}`}
                            title="Delete role"
                            onClick={() => setDeleteCandidate(role)}
                            style={{ ...iconButtonStyle, background: '#fee2e2', color: '#991b1b', borderColor: 'rgba(239,68,68,0.35)' }}
                          >
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
                  ))}
                  {sortedRoles.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '18px 12px', color: '#64748b' }}>
                        No roles match the current search or category filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <ConfirmDialog
        isProcessing={busy}
          open={Boolean(deleteCandidate)}
          title="Delete role?"
          description={deleteCandidate ? <><strong>{deleteCandidate.label}</strong> will be removed. This role cannot be deleted if it is assigned to any designation.</> : ''}
          confirmLabel="Delete role"
          onCancel={closeDeleteConfirm}
          onConfirm={() => void confirmDeleteRole()}
        />
      </div>
    </MasterDataWorkspace>
  );
}
