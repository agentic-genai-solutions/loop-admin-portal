export function normalizeRole(role?: string | string[]): string {
  if (Array.isArray(role)) {
    const normalizedParts = role
      .map((entry) => normalizeRole(entry))
      .filter(Boolean)
      .filter((entry, index, list) => list.indexOf(entry) === index);

    return normalizedParts.length > 0 ? normalizedParts.join(', ') : 'Staff Member';
  }

  if (!role) return 'Staff Member';

  const key = String(role)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const roleLabels: Record<string, string> = {
    super_admin: 'System Administrator',
    director: 'Director',
    hr_manager: 'HR Manager',
    store_admin: 'Store Admin',
    store_manager: 'Store Manager',
    operations_manager: 'Operations Manager',
    warehouse_manager: 'Warehouse Manager',
    finance_manager: 'Finance Manager',
    warehouse_associate: 'Warehouse Associate',
    store_associate: 'Store Associate',
    staff_member: 'Staff Member',
    member: 'Member',
    support_staff: 'Support Staff',
    warehouse_staff: 'Warehouse Staff',
    senior_sales_associate: 'Senior Sales Associate',
    sales_associate: 'Sales Associate',
    sales_consultant: 'Sales Consultant',
    auditor: 'Auditor',
    accountant: 'Accountant',
    senior_accountant: 'Senior Accountant',
    admin: 'Admin',
    manager: 'Manager',
    team: 'Team',
  };

  if (roleLabels[key]) {
    return roleLabels[key];
  }

  const fallback = String(role)
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!fallback) return 'Staff Member';

  return fallback
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getRoleKey(role?: string | string[]): string {
  if (Array.isArray(role)) {
    return role.map((entry) => getRoleKey(entry)).filter(Boolean).join(',');
  }

  return String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getNormalizedRoleList(role?: string | string[]): string[] {
  const values = Array.isArray(role) ? role : [role];
  return values
    .map((entry) => getRoleKey(entry))
    .filter((entry) => typeof entry === 'string' && entry.length > 0);
}

export function isITAdminRole(role?: string | string[]) {
  const normalizedRoles = getNormalizedRoleList(role);
  return normalizedRoles.some((normalized) => normalized === 'system_administrator');
}

export function hasITAdminAccess(role?: string | string[]) {
  return isITAdminRole(role) || isITAdminRole(normalizeRole(role));
}

export function isDirectorRole(role?: string | string[]) {
  const normalizedRoles = getNormalizedRoleList(role);
  return normalizedRoles.some((normalized) => normalized === 'director');
}

export function isSuperAdminRole(role?: string | string[]) {
  const normalizedRoles = getNormalizedRoleList(role);
  return normalizedRoles.some((normalized) => normalized === 'super_admin' || normalized === 'system_administrator');
}

export function isStoreScopedRole(role?: string | string[]) {
  const normalizedRoles = getNormalizedRoleList(role);
  return normalizedRoles.some((normalized) => [
    'store_admin',
    'store_manager',
    'operations_manager',
    'warehouse_manager',
    'store_associate',
    'warehouse_associate',
    'sales_associate',
    'sales_consultant',
    'senior_sales_associate',
    'auditor',
  ].includes(normalized));
}

export function shouldShowStoreField(role?: string | string[]) {
  const normalizedRoles = getNormalizedRoleList(role);
  return normalizedRoles.some((normalized) => [
    'store_admin',
    'store_manager',
    'warehouse_manager',
    'store_associate',
    'warehouse_associate',
    'sales_associate',
    'sales_consultant',
    'senior_sales_associate',
    'auditor',
  ].includes(normalized));
}

export function formatName(firstName?: string, lastName?: string) {
  return [firstName, lastName].filter(Boolean).join(' ') || '';
}

export function buildSkeletonRows(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}
