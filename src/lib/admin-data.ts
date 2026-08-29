import { apiFetchWithRetry } from './api';
import { normalizeRole } from './utils';

// Each fetch* helper retries transient failures via apiFetchWithRetry and rethrows
// after retries are exhausted so pages can render an explicit error state.

async function loadStoreLabelById() {
  const stores = await apiFetchWithRetry<Array<any>>('/stores').catch(() => []);
  return new Map<string, string>(
    (Array.isArray(stores) ? stores : [])
      .map((store): [string, string] => [String(store?._id ?? store?.id ?? '').trim(), String(store?.name ?? '').trim()])
      .filter(([id, label]) => Boolean(id && label)),
  );
}

async function loadDesignationLabelById() {
  const designations = await apiFetchWithRetry<Array<any>>('/master-data/designations').catch(() => []);
  return new Map<string, string>(
    (Array.isArray(designations) ? designations : [])
      .map((item): [string, string] => [String(item?._id ?? '').trim(), String(item?.label ?? '').trim()])
      .filter(([id, label]) => Boolean(id && label)),
  );
}

async function loadOnboardingLabelById() {
  const onboarding = await apiFetchWithRetry<Array<any>>('/auth/onboarding-stages').catch(() => []);
  return new Map<string, string>(
    (Array.isArray(onboarding) ? onboarding : [])
      .map((item): [string, string] => [String(item?.value ?? '').trim(), String(item?.label ?? '').trim()])
      .filter(([id, label]) => Boolean(id && label)),
  );
}

export async function fetchUsers() {
  const [users, storeLabelById, designationLabelById, onboardingLabelById] = await Promise.all([
    apiFetchWithRetry<Array<any>>('/users'),
    loadStoreLabelById(),
    loadDesignationLabelById(),
    loadOnboardingLabelById(),
  ]);
  if (!Array.isArray(users)) return [];

  return users.map((user) => {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unnamed user';
    const storeId = String(user.storeId ?? '').trim();
    const designationId = String(user.designationId ?? '').trim();
    const onboardingId = String(user.onboardingId ?? '').trim();

    const storeLabel = storeLabelById.get(storeId) || user.department || storeId || 'Unassigned';
    const designationLabel = designationLabelById.get(designationId) || user.designation || 'Unassigned';
    const onboardingLabel = onboardingLabelById.get(onboardingId) || user.onboarding || 'Completed';

    return {
      name: fullName,
      email: user.email ?? '',
      role: normalizeRole(user.role),
      store: storeLabel,
      storeId,
      designation: designationLabel,
      designationId,
      status: user.isActive === false ? 'Inactive' : 'Active',
      onboarding: onboardingLabel,
      onboardingId,
      isDeleted: Boolean(user.isDeleted || user.deletedAt),
      isDeactivated: user.isActive === false,
    };
  });
}

export async function fetchDirectors() {
  const [users, storeLabelById] = await Promise.all([
    apiFetchWithRetry<Array<any>>('/users/directors'),
    loadStoreLabelById(),
  ]);
  if (!Array.isArray(users)) return [];

  return users.map((user, index) => {
    const storeId = String(user.storeId ?? '').trim();
    const resolvedRegion = storeLabelById.get(storeId) || user.department || storeId || 'Unassigned';

    return {
      id: user._id ?? user.id ?? index + 1,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Director',
      email: user.email ?? '',
      region: resolvedRegion,
      status: user.isActive === false ? 'Inactive' : 'Active',
      stores: storeId ? 1 : 0,
    };
  });
}

export async function fetchStores() {
  const stores = await apiFetchWithRetry<Array<any>>('/stores');
  if (!Array.isArray(stores)) return [];

  return stores.map((store, index) => {
    const address = store.address ?? {};
    const normalizeText = (value: unknown) => (typeof value === 'string' ? value : '');
    const normalizeOptionValue = (value: unknown) => {
      if (typeof value === 'object' && value && value !== null) {
        return (value as { value?: string; label?: string }).value ?? (value as { label?: string }).label ?? '';
      }
      return normalizeText(value);
    };

    return {
      id: store._id ?? store.id ?? index + 1,
      name: store.name ?? `Store ${index + 1}`,
      locality: normalizeText(store.locality ?? address.locality),
      city: normalizeText(store.city ?? address.city),
      district: normalizeText(store.district ?? address.district),
      pinCode: normalizeText(store.pinCode ?? address.pinCode),
      localBody: normalizeText(store.localBody ?? address.localBody),
      type: normalizeOptionValue(store.type ?? address.type) || 'Retail',
      manager: normalizeText(store.manager ?? address.manager),
      status: store.isActive === false ? 'Inactive' : normalizeOptionValue(store.status ?? address.status) || 'Operational',
      isDeleted: Boolean(store.isDeleted || store.deletedAt),
    };
  });
}

type ReportRow = { department: string; region: string; active: number; present: number; approvals: number; compliance: string; status: string };

export async function fetchReports() {
  const emptyAttendance = { totalEmployees: 0, present: 0, late: 0, absent: 0, attendanceRate: 0 };
  const emptyLeave = { totalLeaveRequests: 0, approved: 0, pending: 0, rejected: 0 };
  const emptyPayroll = { totalPayroll: 0, approved: 0, pending: 0, paid: 0 };

  const [attendance, leave, payroll] = await Promise.all([
    apiFetchWithRetry<{ attendanceRate?: number; present?: number; totalEmployees?: number; late?: number; absent?: number }>('/director/reports/attendance'),
    apiFetchWithRetry<{ totalLeaveRequests?: number; approved?: number; pending?: number; rejected?: number }>('/director/reports/leave'),
    apiFetchWithRetry<{ totalPayroll?: number; approved?: number; pending?: number; paid?: number }>('/director/reports/payroll'),
  ]);

  return {
    attendance: {
      totalEmployees: attendance?.totalEmployees ?? emptyAttendance.totalEmployees,
      present: attendance?.present ?? emptyAttendance.present,
      late: attendance?.late ?? emptyAttendance.late,
      absent: attendance?.absent ?? emptyAttendance.absent,
      attendanceRate: attendance?.attendanceRate ?? emptyAttendance.attendanceRate,
    },
    leave: {
      totalLeaveRequests: leave?.totalLeaveRequests ?? emptyLeave.totalLeaveRequests,
      approved: leave?.approved ?? emptyLeave.approved,
      pending: leave?.pending ?? emptyLeave.pending,
      rejected: leave?.rejected ?? emptyLeave.rejected,
    },
    payroll: {
      totalPayroll: payroll?.totalPayroll ?? emptyPayroll.totalPayroll,
      approved: payroll?.approved ?? emptyPayroll.approved,
      pending: payroll?.pending ?? emptyPayroll.pending,
      paid: payroll?.paid ?? emptyPayroll.paid,
    },
    rows: [] as ReportRow[],
  };
}

export async function fetchIncentives() {
  const [payroll, programs, entries] = await Promise.all([
    apiFetchWithRetry<{ totalPayroll?: number; paid?: number; pending?: number }>('/director/reports/payroll'),
    apiFetchWithRetry<Array<any>>('/incentives/programs'),
    apiFetchWithRetry<Array<any>>('/incentives/entries'),
  ]);

  const programList = Array.isArray(programs) ? programs : [];
  const entryList = Array.isArray(entries) ? entries : [];

  return {
    programs: programList,
    entries: entryList,
    summary: {
      monthlyPayout: payroll?.totalPayroll ? `$${(payroll.totalPayroll / 10).toLocaleString()}` : '$0',
      activePrograms: programList.filter((program) => program.status === 'Active').length,
      approvalRate: '0%',
      staffEntries: entryList.length,
    },
  };
}

export type RoleMasterDataRecord = {
  _id?: string;
  roleCode: string;
  label: string;
  type: string;
  accessLevel: string;
  scope: string;
  storeAccessScope?: string;
  category: string;
  keyResponsibilities?: string[];
  designations?: string[];
  canCreateRoleCodes?: string[];
  canApproveRoleCodes?: string[];
  canRejectRoleCodes?: string[];
  canReferBackRoleCodes?: string[];
  isActive?: boolean;
};

export async function fetchRoleMatrix() {
  const roles = await apiFetchWithRetry<Array<{ value: string; label: string; description: string; category: string }>>('/auth/roles');
  if (!Array.isArray(roles)) return [];

  return roles.map((role) => ({
    label: role.label,
    scope: role.category,
    access: role.description,
  }));
}

export async function fetchRoleMasterData() {
  const roles = await apiFetchWithRetry<Array<RoleMasterDataRecord>>('/master-data/roles');
  return Array.isArray(roles) ? roles : [];
}

export async function saveRoleMasterData(payload: Partial<RoleMasterDataRecord>) {
  const method = payload.roleCode ? 'PUT' : 'POST';
  return apiFetchWithRetry<{ success?: boolean; message?: string; roleCode?: string }>('/master-data/roles', {
    method,
    body: JSON.stringify(payload),
  });
}

export async function deleteRoleMasterData(roleCode: string) {
  return apiFetchWithRetry<{ success?: boolean; message?: string }>(`/master-data/roles/${encodeURIComponent(roleCode)}`, {
    method: 'DELETE',
  });
}

