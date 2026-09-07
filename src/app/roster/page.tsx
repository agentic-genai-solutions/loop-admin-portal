'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetchWithRetry } from '@/lib/api';

type StoreOption = {
  value: string;
  label: string;
};

type RosterViewMode = 'weekly' | 'monthly';

type RosterPolicyResponse = {
  storeId?: string | null;
  scope: 'global' | 'store';
  workingDays: number[];
  extraCashEnabled?: boolean;
  extraCashDays?: number[];
  extraCashAmount?: number;
  sundayBonusEnabled: boolean;
  sundayBonusAmount: number;
  isOverride: boolean;
};

type RosterDay = {
  date: string;
  label: string;
  dayOfWeek: number;
  isWorkingDay: boolean;
  isOverride: boolean;
  isExtraCashDay?: boolean;
  extraCashAmount?: number;
  sundayExtraAmount: number;
};

type RosterEmployeeRow = {
  employeeId: string;
  employeeName: string;
  designation?: string;
  storeId?: string | null;
  extraCashAmount?: number;
  totalExtraCash?: number;
  totalWorkingDays: number;
  totalSundayExtra: number;
  days: RosterDay[];
};

type RosterViewResponse = {
  view: RosterViewMode;
  storeId?: string | null;
  period: {
    startDate: string;
    endDate: string;
  };
  policy: RosterPolicyResponse;
  dates: Array<{
    date: string;
    dayOfWeek: number;
    label: string;
    isDefaultWorkingDay: boolean;
    isExtraCashDay?: boolean;
    extraCashEnabled?: boolean;
    extraCashAmount?: number;
    sundayBonusEnabled: boolean;
    sundayBonusAmount: number;
  }>;
  employees: RosterEmployeeRow[];
};

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildOverrideKey(employeeId: string, date: string) {
  return `${employeeId}__${date}`;
}

function parseOverrideKey(value: string) {
  const markerIndex = value.indexOf('__');
  if (markerIndex < 0) {
    return { employeeId: '', date: '' };
  }

  return {
    employeeId: value.slice(0, markerIndex),
    date: value.slice(markerIndex + 2),
  };
}

function toDateInputValue(value?: string) {
  const next = value ? new Date(value) : new Date();
  if (Number.isNaN(next.getTime())) {
    return '';
  }

  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function asCurrency(value: number) {
  const amount = Number(value) || 0;
  return `₹${amount.toFixed(2)}`;
}

function normalizeRoles(roleInput: unknown): string[] {
  const roles = Array.isArray(roleInput) ? roleInput : roleInput ? [roleInput] : [];
  return roles.map((entry) => String(entry ?? '').trim().toLowerCase()).filter(Boolean);
}

function getDesignationBadgeClass(designation: string) {
  const normalized = designation.trim().toLowerCase();
  if (!normalized) {
    return 'info';
  }

  const firstCode = normalized.charCodeAt(0);
  const mapped = firstCode % 4;
  if (mapped === 0) return 'success';
  if (mapped === 1) return 'info';
  if (mapped === 2) return 'warning';
  return 'danger';
}

export default function RosterPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedView, setSelectedView] = useState<RosterViewMode>('weekly');
  const [selectedDate, setSelectedDate] = useState(toDateInputValue());
  const [assignedStoreId, setAssignedStoreId] = useState('');
  const [isStoreLocked, setIsStoreLocked] = useState(false);
  const [canManagePolicy, setCanManagePolicy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [isSavingOverrides, setIsSavingOverrides] = useState(false);
  const [isSavingEmployeeExtras, setIsSavingEmployeeExtras] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<null | 'policy' | 'overrides' | 'employee-extras'>(null);

  const [policyWorkingDays, setPolicyWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [policyExtraCashEnabled, setPolicyExtraCashEnabled] = useState(true);
  const [policyExtraCashDays, setPolicyExtraCashDays] = useState<number[]>([0]);
  const [policyExtraCashAmount, setPolicyExtraCashAmount] = useState(0);
  const [rosterData, setRosterData] = useState<RosterViewResponse | null>(null);
  const [initialOverrides, setInitialOverrides] = useState<Record<string, boolean>>({});
  const [draftOverrides, setDraftOverrides] = useState<Record<string, boolean>>({});
  const [initialEmployeeExtras, setInitialEmployeeExtras] = useState<Record<string, number>>({});
  const [draftEmployeeExtras, setDraftEmployeeExtras] = useState<Record<string, number>>({});

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const parsed = JSON.parse(window.sessionStorage.getItem('loop_admin_user') ?? '{}');
      const currentStoreId = String(parsed?.storeId ?? '').trim();
      const roles = normalizeRoles(parsed?.role);
      const canViewAllStores = roles.includes('director') || roles.includes('super_admin') || roles.includes('super_admin_it');
      const canEditRoster = canViewAllStores || roles.includes('store_admin') || roles.includes('store_manager');

      setAssignedStoreId(currentStoreId);
      setIsStoreLocked(!canViewAllStores && Boolean(currentStoreId));
      setCanManagePolicy(canEditRoster);
      setSelectedStoreId(currentStoreId);
    } catch {
      setAssignedStoreId('');
      setIsStoreLocked(false);
      setCanManagePolicy(false);
      setSelectedStoreId('');
    }
  }, []);

  const effectiveStoreId = useMemo(() => (isStoreLocked ? assignedStoreId : selectedStoreId), [assignedStoreId, isStoreLocked, selectedStoreId]);

  const loadRoster = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const [storeData, rosterResponse] = await Promise.all([
        apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores').catch(() => []),
        apiFetchWithRetry<RosterViewResponse>(`/admin/rosters?${new URLSearchParams({
          ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
          view: selectedView,
          date: selectedDate || toDateInputValue(),
        }).toString()}`),
      ]);

      const normalizedStores = (Array.isArray(storeData) ? storeData : [])
        .map((store) => ({
          value: String(store?._id ?? store?.id ?? '').trim(),
          label: String(store?.name ?? '').trim(),
        }))
        .filter((store) => store.value && store.label)
        .sort((first, second) => first.label.localeCompare(second.label, undefined, { sensitivity: 'base' }));

      setStores(normalizedStores);
      setRosterData(rosterResponse);
      setPolicyWorkingDays(Array.isArray(rosterResponse.policy?.workingDays) && rosterResponse.policy.workingDays.length > 0 ? rosterResponse.policy.workingDays : [1, 2, 3, 4, 5]);
      setPolicyExtraCashEnabled(Boolean(rosterResponse.policy?.extraCashEnabled ?? rosterResponse.policy?.sundayBonusEnabled ?? true));
      setPolicyExtraCashDays(
        Array.isArray(rosterResponse.policy?.extraCashDays) && rosterResponse.policy.extraCashDays.length > 0
          ? [...rosterResponse.policy.extraCashDays].sort((a, b) => a - b)
          : [0],
      );
      setPolicyExtraCashAmount(Number(rosterResponse.policy?.extraCashAmount ?? rosterResponse.policy?.sundayBonusAmount) || 0);

      const overrideMap: Record<string, boolean> = {};
      const employeeExtraMap: Record<string, number> = {};
      (rosterResponse.employees ?? []).forEach((employee) => {
        employeeExtraMap[employee.employeeId] = Number(employee.extraCashAmount ?? rosterResponse.policy?.extraCashAmount ?? rosterResponse.policy?.sundayBonusAmount ?? 0) || 0;
        (employee.days ?? []).forEach((day) => {
          overrideMap[buildOverrideKey(employee.employeeId, day.date)] = Boolean(day.isWorkingDay);
        });
      });

      setInitialOverrides(overrideMap);
      setDraftOverrides(overrideMap);
      setInitialEmployeeExtras(employeeExtraMap);
      setDraftEmployeeExtras(employeeExtraMap);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Unable to load roster data.';
      setErrorMessage(message);
      setRosterData(null);
      setInitialOverrides({});
      setDraftOverrides({});
      setInitialEmployeeExtras({});
      setDraftEmployeeExtras({});
    } finally {
      setIsLoading(false);
    }
  }, [effectiveStoreId, selectedDate, selectedView]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const toggleWorkingDay = (day: number) => {
    setPolicyWorkingDays((current) => {
      const hasValue = current.includes(day);
      const next = hasValue ? current.filter((entry) => entry !== day) : [...current, day];
      return next.sort((a, b) => a - b);
    });
  };

  const toggleExtraCashDay = (day: number) => {
    setPolicyExtraCashDays((current) => {
      const hasValue = current.includes(day);
      const next = hasValue ? current.filter((entry) => entry !== day) : [...current, day];
      return next.sort((a, b) => a - b);
    });
  };

  const savePolicy = async () => {
    if (policyWorkingDays.length === 0) {
      setErrorMessage('Select at least one default roster day.');
      return;
    }

    if (policyExtraCashEnabled && policyExtraCashDays.length === 0) {
      setErrorMessage('Select at least one extra cash day or disable extra cash.');
      return;
    }

    setIsSavingPolicy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await apiFetchWithRetry('/admin/rosters/policy', {
        method: 'PUT',
        body: JSON.stringify({
          ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
          workingDays: policyWorkingDays,
          extraCashEnabled: policyExtraCashEnabled,
          extraCashDays: policyExtraCashEnabled ? policyExtraCashDays : [],
          extraCashAmount: Number(policyExtraCashAmount) || 0,
          sundayBonusEnabled: policyExtraCashEnabled && policyExtraCashDays.includes(0),
          sundayBonusAmount: Number(policyExtraCashAmount) || 0,
        }),
      });

      setSuccessMessage(effectiveStoreId ? 'Store roster policy updated.' : 'Global roster policy updated.');
      await loadRoster();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Unable to save roster policy.';
      setErrorMessage(message);
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const pendingOverrideChanges = useMemo(() => {
    const changes: Array<{ employeeId: string; date: string; isWorkingDay: boolean }> = [];

    Object.entries(draftOverrides).forEach(([key, isWorkingDay]) => {
      const initialValue = initialOverrides[key];
      if (typeof initialValue !== 'boolean' || initialValue === isWorkingDay) {
        return;
      }

      const { employeeId, date } = parseOverrideKey(key);
      if (!employeeId || !date) {
        return;
      }

      changes.push({ employeeId, date, isWorkingDay });
    });

    return changes;
  }, [draftOverrides, initialOverrides]);

  const pendingEmployeeExtraChanges = useMemo(() => {
    const changes: Array<{ employeeId: string; extraCashAmount: number }> = [];

    Object.entries(draftEmployeeExtras).forEach(([employeeId, amount]) => {
      const initialAmount = Number(initialEmployeeExtras[employeeId] ?? 0);
      const nextAmount = Number(amount ?? 0);
      const roundedInitial = Number(initialAmount.toFixed(2));
      const roundedNext = Number(nextAmount.toFixed(2));

      if (roundedInitial !== roundedNext) {
        changes.push({ employeeId, extraCashAmount: Math.max(0, roundedNext) });
      }
    });

    return changes;
  }, [draftEmployeeExtras, initialEmployeeExtras]);

  const saveOverrides = async () => {
    if (pendingOverrideChanges.length === 0) {
      setSuccessMessage('No override changes to save.');
      setErrorMessage('');
      return;
    }

    setIsSavingOverrides(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await Promise.all(
        pendingOverrideChanges.map((change) =>
          apiFetchWithRetry('/admin/rosters/override', {
            method: 'PATCH',
            body: JSON.stringify({
              employeeId: change.employeeId,
              ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
              date: change.date,
              isWorkingDay: change.isWorkingDay,
            }),
          }),
        ),
      );

      setSuccessMessage(`${pendingOverrideChanges.length} override change${pendingOverrideChanges.length === 1 ? '' : 's'} saved.`);
      await loadRoster();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Unable to update roster override.';
      setErrorMessage(message);
    } finally {
      setIsSavingOverrides(false);
    }
  };

  const applyDraftOverride = (employeeId: string, date: string, isWorkingDay: boolean) => {
    const key = buildOverrideKey(employeeId, date);
    setDraftOverrides((current) => ({
      ...current,
      [key]: isWorkingDay,
    }));
  };

  const setEmployeeExtraAmount = (employeeId: string, amount: number) => {
    setDraftEmployeeExtras((current) => ({
      ...current,
      [employeeId]: Math.max(0, Number.isFinite(amount) ? amount : 0),
    }));
  };

  const saveEmployeeExtras = async () => {
    if (pendingEmployeeExtraChanges.length === 0) {
      setSuccessMessage('No employee extra amount changes to save.');
      setErrorMessage('');
      return;
    }

    setIsSavingEmployeeExtras(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await Promise.all(
        pendingEmployeeExtraChanges.map((change) =>
          apiFetchWithRetry('/admin/rosters/employee-extra', {
            method: 'PATCH',
            body: JSON.stringify({
              employeeId: change.employeeId,
              ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
              extraCashAmount: change.extraCashAmount,
            }),
          }),
        ),
      );

      setSuccessMessage(`${pendingEmployeeExtraChanges.length} employee extra amount change${pendingEmployeeExtraChanges.length === 1 ? '' : 's'} saved.`);
      await loadRoster();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Unable to save employee extra amounts.';
      setErrorMessage(message);
    } finally {
      setIsSavingEmployeeExtras(false);
    }
  };

  const isProcessingSave = isSavingPolicy || isSavingOverrides || isSavingEmployeeExtras;

  return (
    <main className="portal-page portal-page-grid" style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end', minWidth: 'min(100%, 670px)' }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
              Store Scope
              <select
                value={effectiveStoreId || ''}
                onChange={(event) => setSelectedStoreId(event.target.value)}
                disabled={isStoreLocked}
                style={{ width: '100%', minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: isStoreLocked ? 'rgba(241,245,249,0.9)' : '#fff' }}
              >
                <option value="">All Shops (Global Default)</option>
                {stores.map((store) => (
                  <option key={store.value} value={store.value}>{store.label}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
              View
              <select
                value={selectedView}
                onChange={(event) => setSelectedView(event.target.value as RosterViewMode)}
                style={{ width: '100%', minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
              Base Date
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                style={{ width: '100%', minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
              />
            </label>

            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => void loadRoster()} style={{ width: '100%' }}>
                Refresh
              </button>
            </div>
          </div>
        </div>

        {errorMessage ? <div style={{ color: '#b91c1c', fontWeight: 700 }}>{errorMessage}</div> : null}
        {successMessage ? <div style={{ color: '#047857', fontWeight: 700 }}>{successMessage}</div> : null}
      </div>

      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>Default Roster Configuration</h3>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
              By default employees are rostered on configured days (Mon-Fri initially). After changing settings, use Save Policy to apply updates.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setConfirmAction('policy')} disabled={!canManagePolicy || isSavingPolicy}>
            {isSavingPolicy ? 'Saving...' : 'Save Policy'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          <section style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(248,250,252,0.75)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Roster Days</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {weekdayNames.map((dayLabel, index) => (
                <label key={dayLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 74, justifyContent: 'center', padding: '8px 10px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.35)', background: '#fff', fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={policyWorkingDays.includes(index)}
                    onChange={() => toggleWorkingDay(index)}
                    disabled={!canManagePolicy || isSavingPolicy}
                  />
                  {dayLabel}
                </label>
              ))}
            </div>
          </section>

          <section style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(248,250,252,0.75)' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#334155' }}>
              <input
                type="checkbox"
                checked={policyExtraCashEnabled}
                onChange={(event) => setPolicyExtraCashEnabled(event.target.checked)}
                disabled={!canManagePolicy || isSavingPolicy}
              />
              Extra Cash Enabled
            </label>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Extra Cash Days</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {weekdayNames.map((dayLabel, index) => (
                  <label key={`extra-day-${dayLabel}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 74, justifyContent: 'center', padding: '8px 10px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.35)', background: '#fff', fontSize: 13, fontWeight: 700, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={policyExtraCashDays.includes(index)}
                      onChange={() => toggleExtraCashDay(index)}
                      disabled={!canManagePolicy || isSavingPolicy || !policyExtraCashEnabled}
                    />
                    {dayLabel}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#334155' }}>
                Default Extra Cash Amount
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={policyExtraCashAmount}
                  onChange={(event) => setPolicyExtraCashAmount(Number(event.target.value))}
                  disabled={!canManagePolicy || isSavingPolicy || !policyExtraCashEnabled}
                  style={{ width: 190, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)' }}
                />
              </label>

              <div style={{ fontSize: 13, color: '#64748b', paddingBottom: 8 }}>
                Active rate: <strong>{asCurrency(policyExtraCashEnabled ? policyExtraCashAmount : 0)}</strong>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 22, color: '#64748b', fontWeight: 600 }}>Loading roster...</div>
        ) : !rosterData ? (
          <div style={{ padding: 22, color: '#64748b', fontWeight: 600 }}>No roster data found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(148,163,184,0.2)', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', color: '#334155', fontSize: 12, fontWeight: 700, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: 'rgba(226,232,240,0.8)', border: '1px solid rgba(148,163,184,0.35)' }} />
                  Weekday
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: 'rgba(254,226,226,0.55)', border: '1px solid rgba(248,113,113,0.35)' }} />
                  Weekend
                </span>
                <span style={{ color: '#64748b' }}>Overrides: {pendingOverrideChanges.length}</span>
                <span style={{ color: '#64748b' }}>Employee extras: {pendingEmployeeExtraChanges.length}</span>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmAction('employee-extras')}
                  disabled={!canManagePolicy || isSavingEmployeeExtras || pendingEmployeeExtraChanges.length === 0}
                >
                  {isSavingEmployeeExtras ? 'Saving...' : 'Save Employee Amounts'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setConfirmAction('overrides')}
                  disabled={!canManagePolicy || isSavingOverrides || pendingOverrideChanges.length === 0}
                >
                  {isSavingOverrides ? 'Saving...' : 'Save Overrides'}
                </button>
              </div>
            </div>
            <table className="table" style={{ minWidth: 1260 }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Designation</th>
                  <th>Extra Cash / Day</th>
                  <th>Total Working Days</th>
                  <th>Total Extra Cash</th>
                  {rosterData.dates.map((day) => (
                    <th
                      key={day.date}
                      style={{
                        background: day.dayOfWeek === 0 || day.dayOfWeek === 6 ? 'rgba(254,226,226,0.55)' : 'rgba(226,232,240,0.8)',
                        color: day.dayOfWeek === 0 || day.dayOfWeek === 6 ? '#b91c1c' : '#334155',
                      }}
                    >
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rosterData.employees.length > 0 ? (
                  rosterData.employees.map((employee) => (
                    <tr key={employee.employeeId}>
                      <td>{employee.employeeName}</td>
                      <td>
                        <span
                          className={`badge ${getDesignationBadgeClass(employee.designation || '')}`}
                          style={{ display: 'inline-block', padding: '6px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}
                        >
                          {employee.designation || 'Unassigned'}
                        </span>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={Number(draftEmployeeExtras[employee.employeeId] ?? employee.extraCashAmount ?? 0)}
                          onChange={(event) => setEmployeeExtraAmount(employee.employeeId, Number(event.target.value))}
                          disabled={!canManagePolicy || isSavingEmployeeExtras || !policyExtraCashEnabled}
                          style={{ width: 110, padding: '6px 8px', borderRadius: 8, border: `1px solid ${Number((draftEmployeeExtras[employee.employeeId] ?? 0).toFixed(2)) !== Number((initialEmployeeExtras[employee.employeeId] ?? 0).toFixed(2)) ? 'rgba(29,78,216,0.45)' : 'rgba(148,163,184,0.35)'}` }}
                        />
                      </td>
                      <td>{employee.totalWorkingDays}</td>
                      <td>{asCurrency(Number(employee.totalExtraCash ?? employee.totalSundayExtra ?? 0))}</td>
                      {employee.days.map((day) => {
                        const key = buildOverrideKey(employee.employeeId, day.date);
                        const draftValue = draftOverrides[key] ?? day.isWorkingDay;
                        const initialValue = initialOverrides[key] ?? day.isWorkingDay;
                        const hasPendingChange = draftValue !== initialValue;
                        const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
                        const employeeDayRate = Number(draftEmployeeExtras[employee.employeeId] ?? employee.extraCashAmount ?? policyExtraCashAmount ?? 0);
                        const dayExtraAmount = Boolean(day.isExtraCashDay) && draftValue && policyExtraCashEnabled ? employeeDayRate : 0;

                        return (
                        <td
                          key={`${employee.employeeId}-${day.date}`}
                          style={{
                            background: isWeekend ? 'rgba(254,226,226,0.3)' : 'rgba(226,232,240,0.35)',
                          }}
                        >
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="checkbox"
                              checked={draftValue}
                              onChange={(event) => {
                                applyDraftOverride(employee.employeeId, day.date, event.target.checked);
                              }}
                              disabled={!canManagePolicy || isSavingOverrides}
                            />
                            <span style={{ fontSize: 11, color: hasPendingChange ? '#1d4ed8' : day.isOverride ? '#b45309' : '#64748b', fontWeight: hasPendingChange || day.isOverride ? 700 : 500 }}>
                              {hasPendingChange ? 'Pending' : day.isOverride ? 'Override' : 'Default'}
                            </span>
                          </label>
                          {dayExtraAmount > 0 ? (
                            <div style={{ fontSize: 11, color: '#047857', fontWeight: 700, marginTop: 4 }}>
                              +{asCurrency(dayExtraAmount)}
                            </div>
                          ) : null}
                        </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5 + rosterData.dates.length} style={{ textAlign: 'center', padding: '24px 14px', color: '#64748b', fontWeight: 600 }}>
                      No active employees found for selected store/scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmAction ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="card" style={{ width: '100%', maxWidth: 460, display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Confirm changes</h3>
            <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>
              {confirmAction === 'policy'
                ? 'Do you want to save this default roster policy for the selected scope?'
                : confirmAction === 'overrides'
                  ? `Do you want to save ${pendingOverrideChanges.length} override change${pendingOverrideChanges.length === 1 ? '' : 's'}?`
                  : `Do you want to save ${pendingEmployeeExtraChanges.length} employee extra amount change${pendingEmployeeExtraChanges.length === 1 ? '' : 's'}?`}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmAction(null)}
                disabled={isProcessingSave}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isProcessingSave}
                onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(null);

                  if (action === 'policy') {
                    void savePolicy();
                    return;
                  }

                  if (action === 'employee-extras') {
                    void saveEmployeeExtras();
                    return;
                  }

                  void saveOverrides();
                }}
              >
                {isProcessingSave ? 'Saving...' : 'Confirm Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
