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

    const latitude = Number(store.latitude ?? store.lat ?? address.latitude ?? address.lat ?? 0);
    const longitude = Number(store.longitude ?? store.lng ?? address.longitude ?? address.lng ?? 0);
    const radiusMeters = Number(store.radiusMeters ?? store.geoRadiusMeters ?? store.radius ?? store.geofenceRadius ?? address.radiusMeters ?? address.geofenceRadius ?? 0);

    const locationName = normalizeText(store.locationName ?? store.location ?? address.locationName ?? address.formattedAddress ?? address.name ?? store.addressName ?? store.address?.formattedAddress ?? store.address?.locationName);

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
      latitude: Number.isFinite(latitude) ? latitude : 0,
      longitude: Number.isFinite(longitude) ? longitude : 0,
      radiusMeters: Number.isFinite(radiusMeters) ? radiusMeters : 100,
      locationName,
      isDeleted: Boolean(store.isDeleted || store.deletedAt),
    };
  });
}

type ReportRow = { department: string; region: string; active: number; present: number; approvals: number; compliance: string; status: 'Healthy' | 'Watch' | 'At Risk' };

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeStatus(value: unknown, complianceValue: number): ReportRow['status'] {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['healthy', 'good', 'on-track', 'stable'].includes(normalized)) return 'Healthy';
  if (['watch', 'warning', 'attention', 'at-risk'].includes(normalized)) return 'Watch';
  if (['at risk', 'critical', 'danger', 'risk'].includes(normalized)) return 'At Risk';
  if (complianceValue >= 90) return 'Healthy';
  if (complianceValue >= 75) return 'Watch';
  return 'At Risk';
}

function normalizeCompliance(value: unknown, fallback = 0) {
  const numeric = toNumber(value, fallback);
  if (numeric > 1 && numeric <= 100) return `${numeric.toFixed(0)}%`;
  if (numeric > 0 && numeric <= 1) return `${(numeric * 100).toFixed(0)}%`;
  return `${fallback.toFixed(0)}%`;
}

function normalizeReportRow(entry: Record<string, any>): ReportRow | null {
  if (!entry || typeof entry !== 'object') return null;

  const department = String(entry.department ?? entry.departmentName ?? entry.team ?? entry.branch ?? entry.storeName ?? 'Operations').trim() || 'Operations';
  const region = String(entry.region ?? entry.location ?? entry.area ?? entry.zone ?? entry.storeRegion ?? 'Head Office').trim() || 'Head Office';
  const active = Math.max(0, Math.round(toNumber(entry.active ?? entry.activeStaff ?? entry.activeEmployees ?? entry.totalEmployees ?? entry.staffCount ?? 0, 0)));
  const present = Math.max(0, Math.round(toNumber(entry.present ?? entry.presentToday ?? entry.presentEmployees ?? entry.presentCount ?? 0, 0)));
  const approvals = Math.max(0, Math.round(toNumber(entry.approvals ?? entry.pendingApprovals ?? entry.pending ?? entry.approvalCount ?? entry.pendingActionCount ?? 0, 0)));
  const complianceValue = Math.max(0, Math.min(100, toNumber(entry.compliance ?? entry.complianceRate ?? entry.attendanceRate ?? entry.rate ?? 0, 0)));
  const compliance = normalizeCompliance(complianceValue, complianceValue);

  return {
    department,
    region,
    active,
    present,
    approvals,
    compliance,
    status: normalizeStatus(entry.status, complianceValue),
  };
}

export async function fetchReports() {
  const emptyAttendance = { totalEmployees: 0, present: 0, late: 0, absent: 0, attendanceRate: 0 };
  const emptyLeave = { totalLeaveRequests: 0, approved: 0, pending: 0, rejected: 0 };
  const emptyPayroll = { totalPayroll: 0, totalSundayExtraPay: 0, approved: 0, pending: 0, paid: 0 };

  const [attendance, leave, payroll, reportSummary, reportFallback] = await Promise.all([
    apiFetchWithRetry<{ attendanceRate?: number; present?: number; totalEmployees?: number; late?: number; absent?: number; data?: any; rows?: any[] }>('/director/reports/attendance').catch(() => null),
    apiFetchWithRetry<{ totalLeaveRequests?: number; approved?: number; pending?: number; rejected?: number; data?: any; rows?: any[] }>('/director/reports/leave').catch(() => null),
    apiFetchWithRetry<{ totalPayroll?: number; totalSundayExtraPay?: number; approved?: number; pending?: number; paid?: number; data?: any; rows?: any[] }>('/director/reports/payroll').catch(() => null),
    apiFetchWithRetry<any>('/director/reports').catch(() => null),
    apiFetchWithRetry<any>('/reports').catch(() => null),
  ]);

  const combinedSources = [attendance, leave, payroll, reportSummary, reportFallback];
  let rows: ReportRow[] = [];

  for (const source of combinedSources) {
    if (!source) continue;

    const candidateRows = Array.isArray(source.rows)
      ? source.rows
      : Array.isArray(source.data?.rows)
        ? source.data.rows
        : Array.isArray(source.data)
          ? source.data
          : [];

    if (candidateRows.length) {
      rows = candidateRows
        .map((entry: Record<string, any>) => normalizeReportRow(entry))
        .filter((entry: ReportRow | null): entry is ReportRow => Boolean(entry));
      break;
    }
  }

  const attendanceData = attendance?.data ?? attendance ?? {};
  const leaveData = leave?.data ?? leave ?? {};
  const payrollData = payroll?.data ?? payroll ?? {};

  const attendanceRate = toNumber(attendanceData.attendanceRate ?? attendance?.attendanceRate ?? 0, 0);
  const leaveRequests = toNumber(leaveData.totalLeaveRequests ?? leave?.totalLeaveRequests ?? 0, 0);
  const payrollTotal = toNumber(payrollData.totalPayroll ?? payroll?.totalPayroll ?? 0, 0);
  const pendingActions = Math.max(0, toNumber(payrollData.pending ?? payroll?.pending ?? 0, 0) + toNumber(leaveData.pending ?? leave?.pending ?? 0, 0));

  return {
    attendance: {
      totalEmployees: toNumber(attendanceData.totalEmployees ?? attendance?.totalEmployees ?? 0, 0),
      present: toNumber(attendanceData.present ?? attendance?.present ?? 0, 0),
      late: toNumber(attendanceData.late ?? attendance?.late ?? 0, 0),
      absent: toNumber(attendanceData.absent ?? attendance?.absent ?? 0, 0),
      attendanceRate,
    },
    leave: {
      totalLeaveRequests: leaveRequests,
      approved: toNumber(leaveData.approved ?? leave?.approved ?? 0, 0),
      pending: toNumber(leaveData.pending ?? leave?.pending ?? 0, 0),
      rejected: toNumber(leaveData.rejected ?? leave?.rejected ?? 0, 0),
    },
    payroll: {
      totalPayroll: payrollTotal,
      totalSundayExtraPay: toNumber(payrollData.totalSundayExtraPay ?? payroll?.totalSundayExtraPay ?? 0, 0),
      approved: toNumber(payrollData.approved ?? payroll?.approved ?? 0, 0),
      pending: toNumber(payrollData.pending ?? payroll?.pending ?? 0, 0),
      paid: toNumber(payrollData.paid ?? payroll?.paid ?? 0, 0),
    },
    summary: {
      attendanceRate,
      leaveUtilization: leaveRequests > 0 ? Math.min(100, (toNumber(leaveData.approved ?? leave?.approved ?? 0, 0) / leaveRequests) * 100) : 0,
      payrollTotal,
      pendingActions,
    },
    rows,
  };
}

export async function fetchIncentives() {
  const [payroll, programs, entries] = await Promise.all([
    apiFetchWithRetry<{ totalPayroll?: number; paid?: number; pending?: number }>('/director/reports/payroll').catch(() => ({ totalPayroll: 0, paid: 0, pending: 0 })),
    apiFetchWithRetry<Array<any>>('/incentives/programs').catch(() => []),
    apiFetchWithRetry<Array<any>>('/incentives/entries').catch(() => []),
  ]);

  const programList = Array.isArray(programs) ? programs : [];
  const entryList = Array.isArray(entries) ? entries : [];

  const safeAmount = Number.isFinite(Number(payroll?.totalPayroll)) ? Number(payroll.totalPayroll) : 0;
  const activePrograms = programList.filter((program) => String(program.status ?? '').toLowerCase() === 'active').length;
  const approvedEntries = entryList.filter((entry) => String(entry.status ?? '').toLowerCase() === 'approved').length;
  const totalEntries = entryList.length || 1;
  const approvalRate = entryList.length > 0 ? Math.max(0, Math.min(100, Math.round((approvedEntries / totalEntries) * 100))) : 0;

  return {
    programs: programList.map((program) => ({
      id: String(program.id ?? `${program.name ?? 'program'}-${Math.random()}`),
      name: String(program.name ?? 'Untitled Program'),
      type: String(program.type ?? program.category ?? 'Sales'),
      payout: String(program.payout ?? `$${Number(program.amount ?? 0).toLocaleString()}`),
      target: String(program.target ?? program.targetValue ?? 'Configured target'),
      status: String(program.status ?? 'Active'),
      category: String(program.category ?? program.type ?? 'Sales'),
      frequency: String(program.frequency ?? 'Monthly'),
      amount: Number(program.amount ?? 0),
      currency: String(program.currency ?? 'USD'),
      guideline: String(program.guideline ?? 'Set the rule for this incentive.'),
      stores: Array.isArray(program.stores) ? program.stores : ['All Stores'],
      employees: Array.isArray(program.employees) ? program.employees : ['All Employees'],
      notification: String(program.notification ?? 'In-app'),
      targetMetric: String(program.targetMetric ?? 'Performance target'),
      targetValue: String(program.targetValue ?? 'Configured value'),
    })),
    entries: entryList.map((entry) => ({
      employee: String(entry.employee ?? 'Employee'),
      store: String(entry.store ?? 'All Stores'),
      program: String(entry.program ?? 'Program'),
      amount: String(entry.amount ?? '$0'),
      period: String(entry.period ?? 'Current cycle'),
      status: String(entry.status ?? 'Pending'),
    })),
    summary: {
      monthlyPayout: safeAmount ? `$${safeAmount.toLocaleString()}` : '$0',
      activePrograms,
      approvalRate: `${approvalRate}%`,
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

