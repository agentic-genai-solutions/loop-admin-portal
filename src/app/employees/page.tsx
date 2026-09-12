'use client';

import AttendancePolicyEditor from '@/components/AttendancePolicyEditor';

import { useEffect, useMemo, useState } from 'react';
import { apiFetchWithRetry } from '@/lib/api';
import { normalizeRole } from '@/lib/utils';

type EmployeeRow = {
  _id?: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeCode: string;
  phone: string;
  role: string;
  department: string;
  storeId: string;
  storeName: string;
  status: 'Active' | 'Inactive';
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [stores, setStores] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [assignedStoreId, setAssignedStoreId] = useState('');
  const [assignedStoreName, setAssignedStoreName] = useState('');
  const [canViewStorewiseEmployees, setCanViewStorewiseEmployees] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  const normalizeStoreReference = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      setHasLoadError(false);

      try {
        const storedUser = JSON.parse(window.sessionStorage.getItem('loop_admin_user') ?? '{}');
        const storedRoleEntries = Array.isArray(storedUser?.role)
          ? storedUser.role
          : storedUser?.role
            ? [storedUser.role]
            : [];

        const currentRoles = storedRoleEntries.map((entry: unknown) => String(entry ?? '').trim()).filter(Boolean);
        const roleMeta = await apiFetchWithRetry<Array<{ roleCode?: string; label?: string; featureAccessIds?: string[] }>>('/master-data/roles').catch(() => []);
        const hasAccess = roleMeta.some((role) => currentRoles.some((roleCode: string) => roleCode.toLowerCase() === String(role?.roleCode ?? '').trim().toLowerCase()) && Array.isArray(role?.featureAccessIds) && role.featureAccessIds.includes('feature-view-storewise-employees'));

        const currentStoreId = String(storedUser?.storeId ?? '').trim();
        const currentStoreName = String(storedUser?.storeName || storedUser?.store || storedUser?.department || '').trim();
        setAssignedStoreId(currentStoreId);
        setAssignedStoreName(currentStoreName);
        setCanViewStorewiseEmployees(hasAccess);

        const storeData = await apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores').catch(() => []);
        const nextStores = storeData
          .map((store) => ({
            value: String(store?._id ?? store?.id ?? '').trim(),
            label: String(store?.name ?? '').trim(),
          }))
          .filter((store) => store.value && store.label);

        setStores(nextStores);

        const validCurrentStoreId = currentStoreId && nextStores.some((store) => store.value === currentStoreId)
          ? currentStoreId
          : nextStores[0]?.value || '';

        const nextSelectedStore = hasAccess ? (validCurrentStoreId || nextStores[0]?.value || '') : validCurrentStoreId;
        setSelectedStore(nextSelectedStore);
      } catch {
        setHasLoadError(true);
      } finally {
        setIsLoading(false);
      }
    };

    void loadInitialData();
  }, []);

  useEffect(() => {
    const loadEmployees = async () => {
      if (!stores.length) {
        return;
      }

      setIsLoading(true);
      setHasLoadError(false);

      try {
        const validSelectedStore = selectedStore && stores.some((store) => store.value === selectedStore)
          ? selectedStore
          : assignedStoreId && stores.some((store) => store.value === assignedStoreId)
            ? assignedStoreId
            : stores[0]?.value || '';

        const targetStoreId = canViewStorewiseEmployees ? validSelectedStore : (assignedStoreId || stores[0]?.value || '');

        if (targetStoreId) {
          setSelectedStore(validSelectedStore);
        }

        const employeeData = targetStoreId
          ? await apiFetchWithRetry<Array<any>>(`/employees/store/${encodeURIComponent(targetStoreId)}`).catch(() => [])
          : await apiFetchWithRetry<Array<any>>('/employees').catch(() => []);

        const storeLabelById = new Map(stores.map((store) => [store.value, store.label]));

        const mappedEmployees = employeeData.map((employee) => {
          const rawStoreId = String(employee.storeId ?? employee.store ?? employee.department ?? '').trim();
          const matchedStore = stores.find((store) => {
            const idMatch = normalizeStoreReference(store.value) === normalizeStoreReference(rawStoreId);
            const labelMatch = normalizeStoreReference(store.label) === normalizeStoreReference(rawStoreId);
            return idMatch || labelMatch;
          });
          const resolvedStoreId = matchedStore?.value || rawStoreId;

          return {
            _id: employee._id ?? employee.id ?? '',
            firstName: String(employee.firstName ?? '').trim(),
            lastName: String(employee.lastName ?? '').trim(),
            email: String(employee.email ?? '').trim(),
            employeeCode: String(employee.employeeCode ?? '').trim(),
            phone: String(employee.phone ?? '').trim(),
            role: normalizeRole(employee.role ?? 'Staff Member'),
            department: String(employee.department ?? '').trim() || 'Unassigned',
            storeId: resolvedStoreId,
            storeName: storeLabelById.get(resolvedStoreId) || String(employee.storeName ?? employee.store ?? 'Unassigned').trim() || 'Unassigned',
            status: employee.isActive === false ? 'Inactive' : 'Active',
          } satisfies EmployeeRow;
        });

        setEmployees(mappedEmployees);
      } catch {
        setHasLoadError(true);
      } finally {
        setIsLoading(false);
      }
    };

    void loadEmployees();
  }, [assignedStoreId, canViewStorewiseEmployees, selectedStore, stores]);

  const effectiveStoreId = useMemo(() => {
    if (!canViewStorewiseEmployees) {
      return assignedStoreId || selectedStore || stores[0]?.value || '';
    }

    return selectedStore || assignedStoreId || stores[0]?.value || '';
  }, [assignedStoreId, canViewStorewiseEmployees, selectedStore, stores]);

  const filteredEmployees = useMemo(() => {
    if (!effectiveStoreId) {
      return employees;
    }

    return employees.filter((employee) => employee.storeId === effectiveStoreId);
  }, [effectiveStoreId, employees]);

  const visibleStoreLabel = useMemo(() => {
    if (!effectiveStoreId) {
      return 'All store employees';
    }

    return stores.find((store) => store.value === effectiveStoreId)?.label || assignedStoreName || 'Assigned store';
  }, [assignedStoreName, effectiveStoreId, stores]);

  return (
    <main className="portal-page">
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 20, borderBottom: '1px solid rgba(148,163,184,0.18)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: '10px 12px', borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, border: '1px solid rgba(59,130,246,0.18)', width: 'fit-content' }}>
              {visibleStoreLabel}
            </div>
          </div>

          {canViewStorewiseEmployees && (
            <label style={{ display: 'grid', gap: 6, color: '#334155', fontWeight: 700, fontSize: 13 }}>
              Store
              <select
                value={selectedStore || effectiveStoreId || ''}
                onChange={(event) => setSelectedStore(event.target.value)}
                style={{ minWidth: 220, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.6)', color: '#0f172a', fontWeight: 600 }}
              >
                {stores.map((store) => (
                  <option key={store.value} value={store.value}>{store.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {isLoading ? (
          <div style={{ padding: 32, color: '#64748b', fontWeight: 600 }}>Loading employees...</div>
        ) : hasLoadError ? (
          <div style={{ padding: 32, color: '#b91c1c', fontWeight: 600 }}>Unable to load employee records right now.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Employee code</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Store</th>
                  <th>Status</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map((employee) => (
                    <tr key={employee._id || `${employee.email}-${employee.employeeCode}`}>
                      <td>{`${employee.firstName} ${employee.lastName}`.trim() || 'Unnamed employee'}</td>
                      <td>{employee.email || '—'}</td>
                      <td>{employee.employeeCode || '—'}</td>
                      <td><span className="chip" style={{ display: 'inline-block', padding: '7px 10px', background: '#eef2ff', color: '#3730a3', borderRadius: 999, fontWeight: 700, fontSize: 12 }}>{employee.role}</span></td>
                      <td>{employee.department}</td>
                      <td>{employee.storeName}</td>
                      <td>
                        <span className={`badge ${employee.status === 'Active' ? 'success' : 'danger'}`} style={{ display: 'inline-block', padding: '7px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          {employee.status}
                        </span>
                      </td>
                      <td><AttendancePolicyEditor scope="employee" profileId={employee.employeeCode} name={`${employee.firstName} ${employee.lastName}`} /></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '22px 16px', color: '#64748b', fontWeight: 600 }}>
                      No employees found for the selected store.
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
