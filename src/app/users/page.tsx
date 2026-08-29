'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, FeedbackToast } from '@/components/Feedback';
import { ButtonLoader, EmptyState, TableSkeleton } from '@/components/Loaders';
import { apiFetchWithRetry } from '@/lib/api';
import { DEFAULT_ONBOARDING_STAGES, DEFAULT_STORE_OPTIONS } from '@/lib/constants';
import { isStoreScopedRole, normalizeRole, shouldShowStoreField } from '@/lib/utils';

type UserRow = {
  _id?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  mobile?: string;
  countryCode?: string;
  gender?: string;
  bloodGroup?: string;
  role: string;
  roleCode: string;
  designation?: string;
  designationId?: string;
  store: string;
  storeId?: string;
  department?: string;
  departmentId?: string;
  status: string;
  onboarding: string;
  onboardingId?: string;
  isDeleted: boolean;
  isDeactivated: boolean;
};

type RoleMatrixRecord = {
  roleCode: string;
  label: string;
  canViewDeletedUserRecords?: boolean;
};

type SelectOption = {
  value: string;
  label: string;
};

const getUserDisplayName = (user: Pick<UserRow, 'title' | 'firstName' | 'lastName'>) =>
  [user.title, user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Unnamed user';

const initialUsers: UserRow[] = [];

export default function UsersPage() {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [storeFilter, setStoreFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [onboardingFilter, setOnboardingFilter] = useState('All');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [users, setUsers] = useState(initialUsers);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [designationOptions, setDesignationOptions] = useState<SelectOption[]>([]);
  const [roleMatrix, setRoleMatrix] = useState<RoleMatrixRecord[]>([]);
  const [storeOptions, setStoreOptions] = useState<SelectOption[]>(
    DEFAULT_STORE_OPTIONS.map((store) => ({ value: store, label: store })),
  );
  const [onboardingOptions, setOnboardingOptions] = useState<SelectOption[]>(
    DEFAULT_ONBOARDING_STAGES.map((stage) => ({ value: stage, label: stage })),
  );
  const [pendingDeleteUser, setPendingDeleteUser] = useState<(typeof initialUsers)[number] | null>(null);
  const [editingUser, setEditingUser] = useState<(typeof initialUsers)[number] | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    phoneNumber: '',
    countryCode: '',
    gender: '',
    bloodGroup: '',
    designationId: '',
    storeId: '',
    onboardingId: '',
    isActive: true,
  });
  const [toast, setToast] = useState<{ title: string; description: string; type: 'success' | 'error' } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const countryCodes = ['+91', '+1', '+44', '+61', '+971', '+966', '+92', '+971', '+65', '+971'];

  const [form, setForm] = useState({
    title: '',
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    countryCode: '',
    gender: '',
    bloodGroup: '',
    designationId: '',
    storeId: '',
    onboardingId: '',
  });

  const currentUserRole = useMemo<string[]>(() => {
    if (typeof window === 'undefined') return [];

    try {
      const storedUser = JSON.parse(window.sessionStorage.getItem('loop_admin_user') ?? '{}') as { role?: string | string[] };
      const roleValues = Array.isArray(storedUser?.role) ? storedUser.role : storedUser?.role ? [storedUser.role] : [];
      return [...new Set(roleValues.map((value) => String(value).trim()).filter(Boolean))];
    } catch {
      return [];
    }
  }, []);

  const currentUserRoleCodes = useMemo(() => currentUserRole, [currentUserRole]);

  const canViewDeletedRecords = useMemo(() => {
    if (!currentUserRoleCodes.length || !roleMatrix.length) {
      return false;
    }

    return currentUserRoleCodes.some((roleCode) => roleMatrix.some((role) => role.roleCode === roleCode && role.canViewDeletedUserRecords));
  }, [currentUserRoleCodes, roleMatrix]);
  const shouldDisplayStore = shouldShowStoreField(currentUserRole);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const visibleUsers = users.filter((user) => {
      if (user.isDeleted && !canViewDeletedRecords) {
        return false;
      }

      const roleLabel = normalizeRole(user.role);
      const displayName = getUserDisplayName(user).toLowerCase();
      const matchesQuery =
        normalizedQuery.length === 0 ||
        displayName.includes(normalizedQuery) ||
        user.email.toLowerCase().includes(normalizedQuery) ||
        roleLabel.toLowerCase().includes(normalizedQuery);

      const matchesRole = roleFilter === 'All' || roleLabel === roleFilter;
      const matchesStore = storeFilter === 'All' || user.store === storeFilter;
      const matchesStatus = statusFilter === 'All' || user.status === statusFilter;
      const matchesOnboarding = onboardingFilter === 'All' || user.onboarding === onboardingFilter;

      return matchesQuery && matchesRole && matchesStore && matchesStatus && matchesOnboarding;
    });

    return [...visibleUsers].sort((a, b) => {
      const firstValue = sortBy === 'name' ? getUserDisplayName(a) : String(a[sortBy as keyof typeof a] ?? '');
      const secondValue = sortBy === 'name' ? getUserDisplayName(b) : String(b[sortBy as keyof typeof b] ?? '');
      const comparison = firstValue.localeCompare(secondValue, undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [query, roleFilter, storeFilter, statusFilter, onboardingFilter, sortBy, sortDirection, users, canViewDeletedRecords]);

  const roleFilterOptions = ['All', ...roleOptions];
  const storeFilterOptions = ['All', ...Array.from(new Set(users.map((user) => user.store).filter(Boolean)))];
  const statusOptions = ['All', ...Array.from(new Set(users.map((user) => user.status)))];
  const onboardingFilterOptions = ['All', ...Array.from(new Set(users.map((user) => user.onboarding).filter(Boolean)))];
  const designationLabelMap = useMemo(
    () => new Map(designationOptions.map((designation) => [designation.value, designation.label])),
    [designationOptions],
  );
  const storeLabelMap = useMemo(
    () => new Map(storeOptions.map((store) => [store.value, store.label])),
    [storeOptions],
  );
  const onboardingLabelMap = useMemo(
    () => new Map(onboardingOptions.map((option) => [option.value, option.label])),
    [onboardingOptions],
  );

  const isValidEmail = useCallback((value?: string) => {
    const normalized = (value ?? '').trim();
    if (!normalized) {
      return false;
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  }, []);

  const isValidMobileNumber = useCallback((value?: string) => {
    const normalized = (value ?? '').trim();
    if (!normalized) {
      return false;
    }

    const digits = normalized.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }, []);

  const normalizeMobileValue = useCallback((countryCode?: string, phoneNumber?: string) => {
    const code = (countryCode ?? '+91').trim();
    const rawNumber = (phoneNumber ?? '').trim();
    const numberDigits = rawNumber.replace(/\D/g, '');

    if (!numberDigits) {
      return '';
    }

    const normalizedCode = code.startsWith('+') ? code : `+${code}`;
    const codeDigits = normalizedCode.replace(/\D/g, '');

    if (!codeDigits) {
      return numberDigits;
    }

    const sanitizedPhone = rawNumber.startsWith('+') ? rawNumber.replace(/\D/g, '') : numberDigits;
    const phoneWithoutCode = sanitizedPhone.startsWith(codeDigits) ? sanitizedPhone.slice(codeDigits.length) : sanitizedPhone;

    return `+${codeDigits}${phoneWithoutCode}`;
  }, []);

  const getFormErrors = useCallback(
    (values: { title?: string; firstName: string; lastName: string; email: string; phoneNumber?: string; countryCode?: string; gender?: string; bloodGroup?: string; designationId: string; storeId: string; onboardingId: string }) => {
      const errors: Record<string, string> = {};

      if (!values.title?.trim()) {
        errors.title = 'Title is required.';
      }

      if (!values.gender?.trim()) {
        errors.gender = 'Gender is required.';
      }

      if (!values.bloodGroup?.trim()) {
        errors.bloodGroup = 'Blood group is required.';
      }

      if (!values.firstName.trim()) {
        errors.firstName = 'First name is required.';
      }

      if (!values.lastName.trim()) {
        errors.lastName = 'Last name is required.';
      }

      if (!values.email.trim()) {
        errors.email = 'Email is required.';
      } else if (!isValidEmail(values.email)) {
        errors.email = 'Please provide a valid email address.';
      }

      const mobileValue = normalizeMobileValue(values.countryCode, values.phoneNumber);
      const digitsOnly = (mobileValue || '').replace(/\D/g, '');

      if (!values.phoneNumber?.trim()) {
        errors.phoneNumber = 'Phone number is required.';
      } else if (!digitsOnly || digitsOnly.length < 7 || digitsOnly.length > 15) {
        errors.phoneNumber = 'Please provide a valid mobile number.';
      }

      if (values.gender && !['male', 'female', 'other', 'prefer_not_to_say'].includes(values.gender)) {
        errors.gender = 'Please select a valid gender.';
      }

      if (values.bloodGroup && !/^(A|B|AB|O)[+-]$/i.test(values.bloodGroup.trim())) {
        errors.bloodGroup = 'Please select a valid blood group.';
      }

      if (!values.designationId.trim()) {
        errors.designation = 'Please select a designation.';
      }

      if (!values.storeId.trim()) {
        errors.store = 'Please select a store assignment.';
      }

      if (!values.onboardingId.trim()) {
        errors.onboarding = 'Please select an onboarding stage.';
      }

      return errors;
    },
    [isValidEmail, normalizeMobileValue],
  );

  const validateUserForm = useCallback(
    (values: { title?: string; firstName: string; lastName: string; email: string; phoneNumber?: string; countryCode?: string; gender?: string; bloodGroup?: string; designationId: string; storeId: string; onboardingId: string }) => {
      const errors = getFormErrors(values);
      return Object.values(errors)[0] ?? null;
    },
    [getFormErrors],
  );

  const showToast = useCallback((description: string, type: 'success' | 'error' = 'success', title?: string) => {
    setToast({
      type,
      title: title ?? (type === 'success' ? 'Success' : 'Error'),
      description,
    });
  }, []);

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    setHasLoadError(false);

    try {
      const [userData, designationData, onboardingData, storesData, rolesData] = await Promise.all([
        apiFetchWithRetry<Array<any>>('/users'),
        apiFetchWithRetry<Array<{ _id?: string; code?: string; label?: string }>>('/master-data/designations').catch(() => []),
        apiFetchWithRetry<Array<{ value: string; label: string }>>('/auth/onboarding-stages').catch(() => []),
        apiFetchWithRetry<Array<any>>('/stores').catch(() => []),
        apiFetchWithRetry<Array<{ roleCode?: string; label?: string; canViewDeletedUserRecords?: boolean }>>('/master-data/roles').catch(() => []),
      ]);

      const nextRoleOptions = Array.from(
        new Set(
          rolesData
            .map((role) => normalizeRole(String(role?.label ?? role?.roleCode ?? '').trim()))
            .filter(Boolean),
        ),
      );

      const designationIdMap = new Map<string, string>();
      const nextDesignationOptions = designationData
        .map((entry) => ({
          value: String(entry._id ?? '').trim(),
          label: String(entry.label ?? '').trim(),
          code: String(entry.code ?? '').trim(),
        }))
        .filter((entry) => entry.value && entry.label);
      nextDesignationOptions.forEach((entry) => {
        if (entry.code) {
          designationIdMap.set(entry.code, entry.value);
        }
      });

      const nextStoreOptions = storesData
        .map((store) => ({
          value: String(store?._id ?? store?.id ?? '').trim(),
          label: String(store?.name ?? '').trim(),
        }))
        .filter((store) => store.value && store.label);
      const storeLabelById = new Map(nextStoreOptions.map((store) => [store.value, store.label]));

      const onboardingLabelByValue = new Map<string, string>(
        onboardingData
          .map((entry): [string, string] => [String(entry.value).trim(), String(entry.label).trim()])
          .filter(([value, label]) => Boolean(value && label)),
      );

      const filteredUserData = userData;

      setDesignationOptions(nextDesignationOptions.map(({ value, label }) => ({ value, label })));
      setOnboardingOptions(onboardingData.map((entry) => ({ value: String(entry.value), label: String(entry.label) })));
      setStoreOptions(nextStoreOptions);
      setRoleOptions(nextRoleOptions);
      setRoleMatrix(rolesData.map((role) => ({
        roleCode: String(role?.roleCode ?? '').trim(),
        label: String(role?.label ?? '').trim(),
        canViewDeletedUserRecords: Boolean(role?.canViewDeletedUserRecords),
      })).filter((role) => role.roleCode && role.label));

      const mappedUsers = filteredUserData.map((user) => {
        const firstName = String(user.firstName ?? '').trim();
        const lastName = String(user.lastName ?? '').trim();
        const title = String(user.title ?? '').trim();
        const roleCode = String(user.role ?? '').trim();
        const countryCode = String(user.countryCode ?? '+91').trim();
        const phoneNo = String(user.mobile ?? '').trim();
        const designationId = String(user.designationId ?? '').trim() || designationIdMap.get(String(user.designation ?? '').trim()) || '';
        const designationLabel = designationId
          ? (nextDesignationOptions.find((entry) => entry.value === designationId)?.label ?? String(user.designation ?? '').trim())
          : String(user.designation ?? '').trim();

        const onboardingId = String(user.onboardingId ?? '').trim() || String(user.onboarding ?? '').trim();
        const onboardingLabel = onboardingLabelByValue.get(onboardingId) ?? String(user.onboarding ?? '').trim();

        const resolvedStoreId = String(user.storeId ?? '').trim();
        const resolvedStoreLabel = storeLabelById.get(resolvedStoreId) ?? String(user.storeId ?? user.department ?? 'Unassigned').trim();
        const gender = String(user.gender ?? '').trim();
        const bloodGroup = String(user.bloodGroup ?? '').trim();

        return {
          _id: user._id ?? user.id ?? '',
          title: title || undefined,
          firstName,
          lastName,
          email: user.email ?? '',
          mobile: phoneNo,
          countryCode,
          gender: gender || undefined,
          bloodGroup: bloodGroup || undefined,
          role: normalizeRole(user.role),
          roleCode: roleCode || (user.role ?? ''),
          designation: designationLabel,
          designationId,
          store: resolvedStoreLabel || 'Unassigned',
          storeId: resolvedStoreId,
          departmentId: String(user.departmentId ?? '').trim() || undefined,
          status: user.isActive === false ? 'Inactive' : 'Active',
          onboarding: onboardingLabel || 'Completed',
          onboardingId: onboardingId || undefined,
          isDeleted: user.isDeleted === true || user.isActive === false,
          isDeactivated: user.isActive === false,
        };
      });

      setUsers(mappedUsers);
      setIsApiLoaded(true);
    } catch {
      setHasLoadError(true);
      showToast('Failed to load users after 3 attempts. Please try again.', 'error');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection('asc');
  };

  const handleDeactivate = (email: string) => {
    const targetUser = users.find((user) => user.email === email);
    if (!targetUser) {
      showToast('User not found.', 'error');
      return;
    }

    const nextStatus = targetUser.isDeactivated ? 'Active' : 'Inactive';
    setUsers((current) =>
      current.map((user) =>
        user.email === email ? { ...user, isDeactivated: !user.isDeactivated, status: nextStatus } : user,
      ),
    );
    showToast(`${getUserDisplayName(targetUser)} was marked ${nextStatus.toLowerCase()}.`, 'success');
  };

  const handleEditUser = (user: (typeof initialUsers)[number]) => {
    const rawMobile = String(user.mobile ?? '').trim();
    const detectedCode = String(user.countryCode ?? '+91').trim() || '+91';
    const phoneNumber = rawMobile;
    const firstName = String(user.firstName ?? '').trim();
    const lastName = String(user.lastName ?? '').trim();
    const storeValue = String(user.storeId ?? '').trim();
    const designationValue = String((user as any).designationId ?? '').trim();
    const onboardingValue = String(user.onboardingId ?? '').trim();

    setEditingUser(user);
    setEditForm({
      title: user.title || '',
      firstName,
      lastName,
      email: user.email,
      mobile: rawMobile,
      phoneNumber: phoneNumber,
      countryCode: detectedCode,
      gender: (user as any)?.gender ?? '',
      bloodGroup: (user as any)?.bloodGroup ?? '',
      designationId: designationValue,
      storeId: storeValue,
      onboardingId: onboardingValue,
      isActive: !user.isDeactivated,
    });
  };

  const validateCurrentModalForm = useCallback(() => {
    const values = editingUser ? editForm : form;
    const nextErrors = getFormErrors(values);
    setFormErrors(nextErrors);
    return nextErrors;
  }, [editForm, form, getFormErrors, editingUser]);

  const handleUpdateUser = async () => {
    if (!editingUser?._id) {
      showToast('User record ID is missing.', 'error');
      return;
    }

    const errors = validateCurrentModalForm();
    if (Object.keys(errors).length > 0) {
      showToast(Object.values(errors)[0], 'error');
      return;
    }

    const normalizedMobile = normalizeMobileValue(editForm.countryCode, editForm.phoneNumber);

    try {
      const payload = {
        title: editForm.title || undefined,
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
        countryCode: editForm.countryCode || '+91',
        mobile: editForm.phoneNumber || undefined,
        gender: editForm.gender || undefined,
        bloodGroup: editForm.bloodGroup || undefined,
        designationId: editForm.designationId || undefined,
        onboardingId: editForm.onboardingId || undefined,
        storeId: editForm.storeId || undefined,
        departmentId: editForm.storeId || undefined,
        isActive: editForm.isActive,
      };

      await apiFetchWithRetry(`/users/${editingUser._id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setEditingUser(null);
      await loadUsers();
      showToast('User updated successfully.', 'success');
    } catch {
      showToast('Unable to update user. Please try again.', 'error');
    }
  };

  const handleDelete = (user: (typeof initialUsers)[number]) => {
    setPendingDeleteUser(user);
  };

  const confirmDeleteUser = () => {
    if (!pendingDeleteUser) {
      showToast('No user selected for deletion.', 'error', 'Delete failed');
      return;
    }

    const deletedUserName = getUserDisplayName(pendingDeleteUser);

    setUsers((current) =>
      current.map((user) =>
        user.email === pendingDeleteUser.email
          ? {
              ...user,
              isDeleted: true,
              isDeactivated: true,
              status: 'Inactive',
            }
          : user,
      ),
    );
    setPendingDeleteUser(null);
    showToast(`${deletedUserName} has been removed from active user records.`, 'success', 'User deleted');
  };

  const handleAddUser = async () => {
    const errors = validateCurrentModalForm();
    if (Object.keys(errors).length > 0) {
      showToast(Object.values(errors)[0], 'error');
      return;
    }

    const duplicate = users.some((user) => user.email.toLowerCase() === form.email.trim().toLowerCase());
    if (duplicate) {
      showToast('A user with this email already exists.', 'error');
      return;
    }

    const normalizedMobile = normalizeMobileValue(form.countryCode, form.phoneNumber);
    const selectedDesignation = designationOptions.find((option) => option.value === form.designationId) ?? designationOptions[0];

    if (!selectedDesignation) {
      showToast('Please select a valid designation before creating the user.', 'error');
      return;
    }

    try {
      const payload = {
        title: form.title || undefined,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        countryCode: form.countryCode || '+91',
        mobile: form.phoneNumber || undefined,
        gender: form.gender || undefined,
        bloodGroup: form.bloodGroup || undefined,
        designationId: selectedDesignation.value,
        onboardingId: form.onboardingId || undefined,
        storeId: form.storeId || undefined,
        departmentId: form.storeId || undefined,
        joinedDate: new Date().toISOString(),
      };

      await apiFetchWithRetry('/users/create', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setForm({
        title: '',
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        countryCode: '',
        gender: '',
        bloodGroup: '',
        designationId: '',
        storeId: '',
        onboardingId: '',
      });
      setShowAddUser(false);
      await loadUsers();
      showToast('User added successfully.', 'success');
    } catch {
      showToast('Unable to create user. Please verify the details and try again.', 'error');
    }
  };

  const getSortArrow = (column: string) => {
    if (sortBy !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const activeUserModal = editingUser ? 'edit' : showAddUser ? 'add' : null;

  const closeUserModal = () => {
    setEditingUser(null);
    setShowAddUser(false);
    setFormErrors({});
  };

  const updateModalField = (field: string, value: string, isEditMode: boolean) => {
    if (isEditMode) {
      setEditForm((current) => ({ ...current, [field]: value }));
    } else {
      setForm((current) => ({ ...current, [field]: value }));
    }

    setFormErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const modalSubmitLabel = activeUserModal === 'edit' ? 'Save changes' : 'Save user';
  const modalTitle = activeUserModal === 'edit' ? 'Edit user' : 'Create user and assign store';
  const modalForm = activeUserModal === 'edit' ? editForm : form;

  const iconButtonStyle = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '1px solid rgba(148,163,184,0.35)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.4)',
    color: '#0f172a',
    padding: 0,
  } as const;

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 28 }}>
      {toast && <FeedbackToast title={toast.title} description={toast.description} type={toast.type} onClose={() => setToast(null)} durationMs={2800} />}
      <ConfirmDialog
        open={Boolean(pendingDeleteUser)}
        title="Delete user?"
        description={pendingDeleteUser ? <>Are you sure you want to delete <strong>{getUserDisplayName(pendingDeleteUser)}</strong> ({pendingDeleteUser.email})?</> : ''}
        confirmLabel="Delete user"
        onCancel={() => setPendingDeleteUser(null)}
        onConfirm={confirmDeleteUser}
      />

      {activeUserModal && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(760px, 100vw)', zIndex: 60, display: 'flex', flexDirection: 'column', background: '#f8fafc', borderLeft: '1px solid #e2e8f0', boxShadow: '-20px 0 60px rgba(15, 23, 42, 0.16)' }}>
          <div className="card" style={{ width: '100%', height: '100vh', padding: 0, borderRadius: 0, background: '#f8fafc', boxShadow: 'none', border: 'none', borderLeft: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px 16px', borderBottom: '1px solid rgba(148, 163, 184, 0.25)', background: '#f8fafc' }}>
              <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.03em', color: '#0f172a', fontWeight: 800 }}>{modalTitle}</h2>
              <button type="button" onClick={closeUserModal} style={{ border: 'none', background: 'transparent', fontSize: 30, cursor: 'pointer', color: '#475569', lineHeight: 1, padding: 0 }}>×</button>
            </div>

            <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 16, rowGap: 14, overflowY: 'auto', height: 'calc(100vh - 150px)' }}>
              <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 15 }}>
                Title
                <select
                  value={modalForm.title}
                  onChange={(event) => updateModalField('title', event.target.value, activeUserModal === 'edit')}
                  style={{
                    height: 48,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${formErrors.title ? '#ef4444' : 'rgba(148,163,184,0.35)'}`,
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 15,
                  }}
                >
                  <option value="">Select title</option>
                  <option value="Mr">Mr</option>
                  <option value="Mrs">Mrs</option>
                  <option value="Ms">Ms</option>
                  <option value="Dr">Dr</option>
                </select>
                {formErrors.title && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.title}</span>}
              </label>

              <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 15, gridColumn: '1' }}>
                First name
                <input
                  value={modalForm.firstName}
                  placeholder="Enter first name"
                  onChange={(event) => updateModalField('firstName', event.target.value, activeUserModal === 'edit')}
                  style={{
                    height: 48,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${formErrors.firstName ? '#ef4444' : 'rgba(148,163,184,0.35)'}`,
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 15,
                  }}
                />
                {formErrors.firstName && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.firstName}</span>}
              </label>

              <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 15 }}>
                Last name
                <input
                  value={modalForm.lastName}
                  placeholder="Enter last name"
                  onChange={(event) => updateModalField('lastName', event.target.value, activeUserModal === 'edit')}
                  style={{
                    height: 48,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${formErrors.lastName ? '#ef4444' : 'rgba(148,163,184,0.35)'}`,
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 15,
                  }}
                />
                {formErrors.lastName && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.lastName}</span>}
              </label>

              <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 15 }}>
                Email
                <input
                  value={modalForm.email}
                  placeholder="Enter email"
                  onChange={(event) => updateModalField('email', event.target.value, activeUserModal === 'edit')}
                  style={{
                    height: 48,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${formErrors.email ? '#ef4444' : 'rgba(148,163,184,0.35)'}`,
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 15,
                  }}
                />
                {formErrors.email && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.email}</span>}
              </label>

              <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 15, minWidth: 0 }}>
                Phone no.
                <div style={{ display: 'flex', gap: 8, width: '100%', minWidth: 0 }}>
                  <select
                    value={modalForm.countryCode ?? ''}
                    onChange={(event) => updateModalField('countryCode', event.target.value, activeUserModal === 'edit')}
                    style={{ flex: '0 0 96px', height: 48, padding: '10px 8px', borderRadius: 10, border: `1px solid ${formErrors.phoneNumber ? '#ef4444' : 'rgba(148,163,184,0.35)'}`, background: '#f8fafc', color: '#0f172a', fontSize: 15 }}
                  >
                    <option value="">Select</option>
                    {Array.from(new Set(countryCodes)).map((countryCode) => (
                      <option key={countryCode} value={countryCode}>{countryCode}</option>
                    ))}
                  </select>
                  <input
                    value={modalForm.phoneNumber ?? ''}
                    placeholder="Enter phone"
                    onChange={(event) => updateModalField('phoneNumber', event.target.value, activeUserModal === 'edit')}
                    style={{ flex: 1, minWidth: 0, height: 48, padding: '10px 12px', borderRadius: 10, border: `1px solid ${formErrors.phoneNumber ? '#ef4444' : 'rgba(148,163,184,0.35)'}`, background: '#f8fafc', color: '#0f172a', fontSize: 15 }}
                  />
                </div>
                {formErrors.phoneNumber && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.phoneNumber}</span>}
              </label>

              <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 15 }}>
                Gender
                <select
                  value={modalForm.gender ?? ''}
                  onChange={(event) => updateModalField('gender', event.target.value, activeUserModal === 'edit')}
                  style={{
                    height: 48,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${formErrors.gender ? '#ef4444' : 'rgba(148,163,184,0.35)'}`,
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 15,
                  }}
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
                {formErrors.gender && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.gender}</span>}
              </label>

              <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 15 }}>
                Blood Group
                <select
                  value={modalForm.bloodGroup ?? ''}
                  onChange={(event) => updateModalField('bloodGroup', event.target.value, activeUserModal === 'edit')}
                  style={{
                    height: 48,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${formErrors.bloodGroup ? '#ef4444' : 'rgba(148,163,184,0.35)'}`,
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 15,
                  }}
                >
                  <option value="">Select blood group</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
                {formErrors.bloodGroup && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.bloodGroup}</span>}
              </label>

              <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 15, minWidth: 0 }}>
                Designation
                <select
                  value={modalForm.designationId}
                  onChange={(event) => updateModalField('designationId', event.target.value, activeUserModal === 'edit')}
                  style={{
                    width: '100%',
                    height: 48,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${formErrors.designation ? '#ef4444' : 'rgba(148,163,184,0.35)'}`,
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 15,
                  }}
                >
                  <option value="">Select designation</option>
                  {designationOptions.map((designation) => <option key={designation.value} value={designation.value}>{designation.label}</option>)}
                </select>
                {formErrors.designation && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.designation}</span>}
              </label>

              <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 15 }}>
                Store assignment
                <select
                  value={modalForm.storeId}
                  onChange={(event) => updateModalField('storeId', event.target.value, activeUserModal === 'edit')}
                  style={{
                    height: 48,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${formErrors.store ? '#ef4444' : 'rgba(148,163,184,0.35)'}`,
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 15,
                  }}
                >
                  <option value="">Select store</option>
                  {storeOptions.map((store) => (
                    <option key={store.value} value={store.value}>{store.label}</option>
                  ))}
                </select>
                {formErrors.store && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.store}</span>}
              </label>

              <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 15 }}>
                Onboarding
                <select
                  value={modalForm.onboardingId}
                  onChange={(event) => updateModalField('onboardingId', event.target.value, activeUserModal === 'edit')}
                  style={{
                    height: 48,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${formErrors.onboarding ? '#ef4444' : 'rgba(148,163,184,0.35)'}`,
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: 15,
                  }}
                >
                  <option value="">Select onboarding</option>
                  {onboardingOptions.map((stage) => (
                    <option key={stage.value} value={stage.value}>{stage.label}</option>
                  ))}
                </select>
                {formErrors.onboarding && <span style={{ color: '#b91c1c', fontSize: 12, marginTop: 2 }}>{formErrors.onboarding}</span>}
              </label>

              {activeUserModal === 'edit' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#334155', fontWeight: 700, fontSize: 15, gridColumn: '1 / -1' }}>
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(event) => setEditForm((current) => ({ ...current, isActive: event.target.checked }))}
                    style={{ width: 20, height: 20, accentColor: '#2563eb' }}
                  />
                  Active user
                </label>
              )}
            </div>

            <div style={{ padding: '0 24px 24px', display: 'flex', justifyContent: 'flex-start', gap: 12, flexWrap: 'wrap', borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: 20 }}>
              <button type="button" onClick={activeUserModal === 'edit' ? handleUpdateUser : handleAddUser} style={{ minWidth: activeUserModal === 'edit' ? 180 : 170, padding: '16px 20px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 20, boxShadow: '0 10px 24px rgba(15, 23, 42, 0.18)' }}>
                {modalSubmitLabel}
              </button>
              <button type="button" onClick={closeUserModal} style={{ minWidth: 140, padding: '16px 20px', background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 20 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <ButtonLoader label="Refresh" loading={isLoadingUsers} variant="secondary" onClick={() => void loadUsers()} />
            <button type="button" onClick={() => setShowAddUser(true)} style={{ padding: '10px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
              + Add User
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: shouldDisplayStore ? 'minmax(220px, 1.2fr) minmax(180px, 0.9fr) minmax(180px, 0.9fr) minmax(180px, 0.9fr) minmax(180px, 0.9fr)' : 'minmax(220px, 1.5fr) minmax(180px, 1.2fr) minmax(180px, 1.1fr) minmax(180px, 1.1fr)', gap: 16, marginBottom: 18 }}>
          <label style={{ display: 'grid', gap: 8, color: '#334155', fontWeight: 700, fontSize: 13 }}>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or email"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 8, color: '#334155', fontWeight: 700, fontSize: 13 }}>
            Role
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}>
              {roleFilterOptions.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </label>

          {shouldDisplayStore && (
            <label style={{ display: 'grid', gap: 8, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              Store
              <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}>
                {storeFilterOptions.map((store) => (
                  <option key={store} value={store}>{store}</option>
                ))}
              </select>
            </label>
          )}

          <label style={{ display: 'grid', gap: 8, color: '#334155', fontWeight: 700, fontSize: 13 }}>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 8, color: '#334155', fontWeight: 700, fontSize: 13 }}>
            Onboarding
            <select value={onboardingFilter} onChange={(event) => setOnboardingFilter(event.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}>
              {onboardingFilterOptions.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {isLoadingUsers ? (
            <TableSkeleton columns={7} rows={4} />
          ) : hasLoadError ? (
            <EmptyState variant="error" onRetry={loadUsers} />
          ) : (
            <table className="table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleSort('name')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Name {getSortArrow('name')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('email')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Email {getSortArrow('email')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('designation')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Designation {getSortArrow('designation')}
                    </button>
                  </th>
                  {shouldDisplayStore && (
                    <th>
                      <button type="button" onClick={() => handleSort('store')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                        Store {getSortArrow('store')}
                      </button>
                    </th>
                  )}
                  <th>
                    <button type="button" onClick={() => handleSort('status')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Status {getSortArrow('status')}
                    </button>
                  </th>
                  <th>Onboarding</th>
                  <th style={{ position: 'sticky', right: 0, background: '#fff', zIndex: 2 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <tr key={user.email}>
                    <td>{getUserDisplayName(user)}</td>
                    <td>{user.email}</td>
                    <td><span className="chip" style={{ display: 'inline-block', padding: '7px 10px', background: '#eef2ff', color: '#3730a3', borderRadius: 999, fontWeight: 700, fontSize: 12 }}>{designationLabelMap.get(user.designationId ?? '') || user.designation || '—'}</span></td>
                    {shouldDisplayStore && <td>{user.store}</td>}
                    <td>
                      <span className={`badge ${user.status === 'Active' ? 'success' : user.status === 'Pending' ? 'warning' : 'danger'}`} style={{ display: 'inline-block', padding: '7px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                        {user.status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${user.onboarding === 'Completed' ? 'success' : user.onboarding === 'In Review' ? 'info' : 'warning'}`} style={{ display: 'inline-block', padding: '7px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                        {user.onboarding}
                      </span>
                    </td>
                    <td style={{ position: 'sticky', right: 0, background: '#fff', zIndex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap', minWidth: 142 }}>
                        <button type="button" aria-label={`Edit ${getUserDisplayName(user)}`} title="Edit user" onClick={() => handleEditUser(user)} style={{ ...iconButtonStyle, background: '#dbeafe', color: '#1d4ed8' }}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          aria-label={user.isDeactivated ? `Activate ${getUserDisplayName(user)}` : `Deactivate ${getUserDisplayName(user)}`}
                          title={user.isDeactivated ? 'Activate user' : 'Deactivate user'}
                          onClick={() => handleDeactivate(user.email)}
                          style={{
                            ...iconButtonStyle,
                            background: user.isDeactivated ? '#e2e8f0' : '#fef3c7',
                            color: user.isDeactivated ? '#334155' : '#92400e',
                          }}
                        >
                          {user.isDeactivated ? (
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M5 12h14" />
                              <circle cx="12" cy="12" r="9" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="12" cy="12" r="9" />
                              <path d="M8 12h8" />
                            </svg>
                          )}
                        </button>

                        <button
                          type="button"
                          aria-label={`Delete ${getUserDisplayName(user)}`}
                          title="Delete user"
                          onClick={() => handleDelete(user)}
                          style={{
                            ...iconButtonStyle,
                            background: '#fee2e2',
                            color: '#991b1b',
                            borderColor: 'rgba(239,68,68,0.35)',
                          }}
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
                ))
                ) : (
                  <EmptyState colSpan={shouldDisplayStore ? 7 : 6} title="No users found" description="No users match the current search or filters." />
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
