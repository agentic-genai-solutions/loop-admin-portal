'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog, FeedbackToast } from '@/components/Feedback';
import { apiFetchWithRetry } from '@/lib/api';
import { getFieldBorder, inlineFieldErrorStyle } from '@/lib/form-ui';

const emptyDesignationForm = {
  code: '',
  label: '',
  roleIds: [] as string[],
};

type DesignationFormState = {
  code: string;
  label: string;
  roleIds: string[];
};

type DesignationRecord = {
  _id?: string;
  code: string;
  label: string;
  type?: string;
  roleIds?: string[];
  description?: string;
  isActive?: boolean;
};

type RoleRecord = {
  _id?: string;
  roleCode: string;
  label: string;
};

type DesignationFormErrors = {
  label?: string;
  roleIds?: string;
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

export default function DesignationsMasterDataPage() {
  const router = useRouter();
  const designationLabelInputRef = useRef<HTMLInputElement | null>(null);
  const [designations, setDesignations] = useState<DesignationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ title: string; description: string; type: 'success' | 'error' } | null>(null);
  const [designationForm, setDesignationForm] = useState<DesignationFormState>(emptyDesignationForm);
  const [roleOptions, setRoleOptions] = useState<RoleRecord[]>([]);
  const [roleSearch, setRoleSearch] = useState('');
  const [isRoleSearchFocused, setIsRoleSearchFocused] = useState(false);
  const [isRoleListInteracting, setIsRoleListInteracting] = useState(false);
  const [editingDesignationCode, setEditingDesignationCode] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [designationSearch, setDesignationSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'label' | 'roles'>('label');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [pendingDeleteDesignation, setPendingDeleteDesignation] = useState<DesignationRecord | null>(null);
  const [formErrors, setFormErrors] = useState<DesignationFormErrors>({});

  const showToast = useCallback((description: string, type: 'success' | 'error' = 'success', title?: string) => {
    setToast({
      type,
      title: title ?? (type === 'success' ? 'Success' : 'Error'),
      description,
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [designationData, rolesData] = await Promise.all([
        apiFetchWithRetry<DesignationRecord[]>('/master-data/designations'),
        apiFetchWithRetry<RoleRecord[]>('/master-data/roles'),
      ]);
      const normalizedRoles = Array.isArray(rolesData)
        ? rolesData
            .filter((role) => Boolean(role?.roleCode && role?.label))
            .map((role) => ({ _id: role._id, roleCode: role.roleCode, label: role.label }))
        : [];

      const normalizedDesignations = (Array.isArray(designationData) ? designationData : []).map((designation) => {
        const existingRoleIds = Array.isArray(designation.roleIds)
          ? designation.roleIds.map((roleId) => String(roleId).trim()).filter(Boolean)
          : [];

        return {
          ...designation,
          roleIds: existingRoleIds,
        };
      });

      setDesignations(normalizedDesignations);
      setRoleOptions(normalizedRoles);
    } catch {
      setRoleOptions([]);
      showToast('Failed to load designation data or roles from DB.', 'error', 'Load failed');
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
      designationLabelInputRef.current?.focus();
      designationLabelInputRef.current?.select();
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

  const resetDesignationForm = () => {
    setEditingDesignationCode(null);
    setDesignationForm(emptyDesignationForm);
    setRoleSearch('');
    setFormErrors({});
  };

  const closeDesignationForm = () => {
    setIsFormOpen(false);
    resetDesignationForm();
  };

  const saveDesignation = async () => {
    const nextErrors: DesignationFormErrors = {};

    if (!designationForm.label.trim()) {
      nextErrors.label = 'Designation name is required.';
    }

    if (designationForm.roleIds.length === 0) {
      nextErrors.roleIds = 'Select at least one role.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});

    try {
      const selectedRoleIds = designationForm.roleIds.map((roleId) => String(roleId).trim()).filter(Boolean);
      const trimmedCode = designationForm.code.trim();

      const payload = {
        ...(trimmedCode ? { code: trimmedCode } : {}),
        label: designationForm.label,
        roleIds: [...new Set(selectedRoleIds)],
      };

      await apiFetchWithRetry('/master-data/designations', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      closeDesignationForm();
      await loadData();
      showToast(editingDesignationCode ? 'Designation updated successfully.' : 'Designation saved successfully.', 'success');
    } catch {
      showToast('Unable to save designation.', 'error');
    }
  };

  const deleteDesignation = async (code: string) => {
    try {
      await apiFetchWithRetry(`/master-data/designations/${code}`, { method: 'DELETE' });
      if (editingDesignationCode === code) {
        resetDesignationForm();
      }
      await loadData();
      showToast('Designation has been deleted from master data.', 'success', 'Designation deleted');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Unable to delete designation.'), 'error', 'Delete failed');
    }
  };

  const confirmDeleteDesignation = async () => {
    if (!pendingDeleteDesignation) {
      showToast('No designation selected for deletion.', 'error', 'Delete failed');
      return;
    }

    const designationCode = pendingDeleteDesignation.code;
    setPendingDeleteDesignation(null);
    await deleteDesignation(designationCode);
  };

  const openDesignationEditor = (designation: DesignationRecord) => {
    setEditingDesignationCode(designation.code);
    setFormErrors({});
    setDesignationForm({
      code: designation.code,
      label: designation.label,
      roleIds: Array.isArray(designation.roleIds)
        ? designation.roleIds.map((roleId) => String(roleId).trim()).filter(Boolean)
        : [],
    });
    setRoleSearch('');
    setIsFormOpen(true);
  };

  const openCreateDesignation = () => {
    resetDesignationForm();
    setIsFormOpen(true);
  };

  const addRoleId = (roleId: string) => {
    const normalized = roleId.trim();
    if (!normalized) return;

    setDesignationForm((current) => {
      if (current.roleIds.includes(normalized)) return current;
      return { ...current, roleIds: [...current.roleIds, normalized] };
    });
    setRoleSearch('');
  };

  const removeRoleId = (roleId: string) => {
    setDesignationForm((current) => ({
      ...current,
      roleIds: current.roleIds.filter((id) => id !== roleId),
    }));
  };

  const roleLabelById = useMemo(
    () => new Map(roleOptions.filter((role) => role._id).map((role) => [String(role._id), role.label])),
    [roleOptions],
  );
  const roleCodeById = useMemo(
    () => new Map(roleOptions.filter((role) => role._id).map((role) => [String(role._id), role.roleCode])),
    [roleOptions],
  );
  const normalizedRoleSearch = roleSearch.trim().toLowerCase();
  const matchedRoles = roleOptions
    .filter((role) => Boolean(role._id) && !designationForm.roleIds.includes(String(role._id)))
    .filter((role) => {
      if (!normalizedRoleSearch) return true;
      return role.roleCode.toLowerCase().includes(normalizedRoleSearch) || role.label.toLowerCase().includes(normalizedRoleSearch);
    })
    .slice(0, 20);

  const filteredDesignations = useMemo(() => {
    return designations.filter((designation) => {
      const query = designationSearch.trim().toLowerCase();
      const matchesSearch =
        !query ||
        [designation.label, designation.code, ...(designation.roleIds ?? []).map((roleId) => roleLabelById.get(String(roleId)) ?? String(roleId))]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      const matchesRole =
        roleFilter === 'All' ||
        (designation.roleIds ?? []).some((roleId) => roleId === roleFilter);

      return matchesSearch && matchesRole;
    });
  }, [designations, designationSearch, roleFilter, roleLabelById]);

  const sortedDesignations = useMemo(() => {
    return [...filteredDesignations].sort((first, second) => {
      const firstRoles = (first.roleIds ?? [])
        .map((roleId) => roleLabelById.get(String(roleId)) ?? roleCodeById.get(String(roleId)) ?? String(roleId))
        .join(', ');
      const secondRoles = (second.roleIds ?? [])
        .map((roleId) => roleLabelById.get(String(roleId)) ?? roleCodeById.get(String(roleId)) ?? String(roleId))
        .join(', ');

      const comparison = sortBy === 'roles'
        ? firstRoles.localeCompare(secondRoles, undefined, { sensitivity: 'base' })
        : String(first.label).localeCompare(String(second.label), undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredDesignations, sortBy, sortDirection, roleLabelById, roleCodeById]);

  const handleSort = (column: 'label' | 'roles') => {
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection('asc');
  };

  const getSortArrow = (column: 'label' | 'roles') => {
    if (sortBy !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <main className="portal-page">
      {toast && <FeedbackToast title={toast.title} description={toast.description} type={toast.type} onClose={() => setToast(null)} durationMs={3200} />}

      <div style={{ display: 'grid', gap: 20 }}>
        {isFormOpen && (
          <div
            role="presentation"
            onClick={closeDesignationForm}
            style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={editingDesignationCode ? 'Edit designation' : 'Create designation'}
              onClick={(event) => event.stopPropagation()}
              style={{ width: 'min(920px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: '#f8fafc', borderRadius: 18, boxShadow: '0 28px 80px rgba(15, 23, 42, 0.28)', border: '1px solid rgba(148,163,184,0.2)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid rgba(148,163,184,0.18)' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.03em' }}>{editingDesignationCode ? 'Edit designation' : 'Add new designation'}</h2>
                  <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Keep the form in a modal while adding or updating the designation.</p>
                </div>
                <button type="button" aria-label="Close dialog" title="Close dialog" onClick={closeDesignationForm} style={{ border: 'none', background: 'transparent', fontSize: 28, cursor: 'pointer', color: '#475569', lineHeight: 1, padding: 0 }}>×</button>
              </div>

              <form onSubmit={(event) => { event.preventDefault(); void saveDesignation(); }} style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>Designation</span>
                    <input
                      ref={designationLabelInputRef}
                      value={designationForm.label}
                      onChange={(event) => {
                        const nextLabel = event.target.value;
                        setDesignationForm((current) => ({
                          ...current,
                          label: nextLabel,
                        }));
                      }}
                      style={{ padding: '10px 12px', borderRadius: 10, border: getFieldBorder(Boolean(formErrors.label)) }}
                    />
                    {formErrors.label && <small style={inlineFieldErrorStyle}>{formErrors.label}</small>}
                  </label>
                  <label style={{ display: 'grid', gap: 8, gridColumn: '1 / -1' }}>
                    <span style={{ fontWeight: 700 }}>Roles</span>
                    <div style={{ border: getFieldBorder(Boolean(formErrors.roleIds)), borderRadius: 10, background: '#fff', padding: 10, display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 26 }}>
                        {designationForm.roleIds.length > 0 ? (
                          designationForm.roleIds.map((roleId) => (
                            <span key={roleId} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef2ff', color: '#3730a3', borderRadius: 999, padding: '6px 10px', fontWeight: 700, fontSize: 12 }}>
                              {roleLabelById.get(roleId) ?? roleCodeById.get(roleId) ?? 'Unknown role'}
                              <button
                                type="button"
                                aria-label={`Remove ${roleLabelById.get(roleId) ?? roleCodeById.get(roleId) ?? 'Unknown role'}`}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeRoleId(roleId);
                                }}
                                style={{ border: 'none', background: 'transparent', color: '#3730a3', cursor: 'pointer', lineHeight: 1, padding: 0, fontSize: 14, fontWeight: 800 }}
                              >
                                ×
                              </button>
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#64748b', fontSize: 13 }}>No roles</span>
                        )}
                      </div>

                      <div style={{ display: 'grid', gap: 10 }}>
                        <input
                          value={roleSearch}
                          onChange={(event) => setRoleSearch(event.target.value)}
                          onFocus={() => setIsRoleSearchFocused(true)}
                          onBlur={() => {
                            window.setTimeout(() => {
                              if (!isRoleListInteracting) {
                                setIsRoleSearchFocused(false);
                              }
                            }, 120);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && matchedRoles.length > 0) {
                              event.preventDefault();
                              addRoleId(String(matchedRoles[0]._id));
                            }
                          }}
                          placeholder="Type to search roles"
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.35)' }}
                        />
                        <div style={{ border: '1px solid rgba(148,163,184,0.35)', borderRadius: 8, background: '#fff', boxShadow: '0 12px 28px rgba(15,23,42,0.08)', maxHeight: 240, overflowY: 'auto' }}>
                          {matchedRoles.length > 0 ? (
                            matchedRoles.map((role) => (
                              <button
                                key={role._id ?? role.roleCode}
                                type="button"
                                onMouseDown={() => setIsRoleListInteracting(true)}
                                onMouseUp={() => setIsRoleListInteracting(false)}
                                onClick={() => addRoleId(String(role._id))}
                                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 12px', border: 'none', borderBottom: '1px solid rgba(148,163,184,0.16)', background: '#fff', cursor: 'pointer', textAlign: 'left' }}
                              >
                                <span style={{ fontWeight: 700, color: '#0f172a' }}>{role.label}</span>
                                <span style={{ color: '#64748b', fontSize: 12 }}>{role.roleCode}</span>
                              </button>
                            ))
                          ) : (
                            <div style={{ padding: '10px 12px', color: '#64748b', fontSize: 13 }}>
                              No roles found in the role database.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {formErrors.roleIds && <small style={inlineFieldErrorStyle}>{formErrors.roleIds}</small>}
                  </label>
                </div>
                <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button type="submit" style={{ padding: '10px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    {editingDesignationCode ? 'Update designation' : 'Save designation'}
                  </button>
                  <button type="button" onClick={closeDesignationForm} style={{ padding: '10px 16px', background: 'transparent', color: '#0f172a', border: '1px solid rgba(148,163,184,0.5)', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <section className="card" style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15,23,42,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'end', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12, flex: '1 1 640px' }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Designation search</span>
                <input
                  value={designationSearch}
                  onChange={(event) => setDesignationSearch(event.target.value)}
                  placeholder="Search designation, code or role"
                  style={{ height: 42, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Role filter</span>
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  style={{ height: 42, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}
                >
                  <option value="All">All roles</option>
                  {roleOptions.filter((role) => role._id).map((role) => (
                    <option key={role._id ?? role.roleCode} value={role._id ?? role.roleCode}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

            </div>

            <button type="button" onClick={openCreateDesignation} style={{ padding: '10px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, marginLeft: 'auto' }}>
              + Add designation
            </button>
          </div>

          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>
                      <button type="button" onClick={() => handleSort('label')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                        Designation {getSortArrow('label')}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => handleSort('roles')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                        Roles {getSortArrow('roles')}
                      </button>
                    </th>
                    <th style={{ position: 'sticky', right: 0, background: '#fff', zIndex: 2 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDesignations.map((designation) => (
                    <tr key={designation._id || designation.code}>
                      <td>{designation.label}</td>
                      <td>
                        {(designation.roleIds ?? []).length > 0
                          ? (designation.roleIds ?? [])
                              .map((roleId) => roleLabelById.get(String(roleId)) ?? roleCodeById.get(String(roleId)) ?? 'Unknown role')
                              .join(', ')
                          : 'No roles'}
                      </td>
                      <td style={{ position: 'sticky', right: 0, background: '#fff', zIndex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 92 }}>
                          <button
                            type="button"
                            aria-label={`Edit ${designation.label}`}
                            title="Edit designation"
                            onClick={() => openDesignationEditor(designation)}
                            style={{ ...iconButtonStyle, background: '#dbeafe', color: '#1d4ed8' }}
                          >
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${designation.label}`}
                            title="Delete designation"
                            onClick={() => setPendingDeleteDesignation(designation)}
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
                  {sortedDesignations.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '18px 12px', color: '#64748b' }}>
                        No designations match the current search or role filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <ConfirmDialog
          open={Boolean(pendingDeleteDesignation)}
          title="Delete designation?"
          description={pendingDeleteDesignation ? <><strong>{pendingDeleteDesignation.label}</strong> will be removed. This action cannot be undone.</> : ''}
          confirmLabel="Delete designation"
          onCancel={() => setPendingDeleteDesignation(null)}
          onConfirm={() => void confirmDeleteDesignation()}
        />
      </div>
    </main>
  );
}
