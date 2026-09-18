'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WorkforceWorkspace from '@/components/workforce/WorkforceWorkspace';
import { AdminDialog } from '@/components/admin/AdminWorkspace';
import styles from '@/components/admin/admin.module.css';
import workforce from '@/components/workforce/workforce.module.css';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';

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

export default function RosterPage() {
  const saveLock = useRef(false);
  const rosterRequest = useRef(0);
  const [search, setSearch] = useState('');
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
      setSelectedStoreId(canViewAllStores ? '' : currentStoreId);
    } catch {
      setAssignedStoreId('');
      setIsStoreLocked(false);
      setCanManagePolicy(false);
      setSelectedStoreId('');
    }
  }, []);

  const effectiveStoreId = useMemo(() => (isStoreLocked ? assignedStoreId : selectedStoreId), [assignedStoreId, isStoreLocked, selectedStoreId]);

  const loadRoster = useCallback(async (preserveEdits = false) => {
    const request = ++rosterRequest.current;
    setIsLoading(true);
    setErrorMessage('');

    try {
      const [storeData, rosterResponse] = await Promise.all([
        apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores'),
        apiFetchWithRetry<RosterViewResponse>(`/admin/rosters?${new URLSearchParams({
          ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
          view: selectedView,
          date: selectedDate || toDateInputValue(),
        }).toString()}`),
      ]);

      if (request !== rosterRequest.current) return;
      const normalizedStores = (Array.isArray(storeData) ? storeData : [])
        .map((store) => ({
          value: String(store?._id ?? store?.id ?? '').trim(),
          label: String(store?.name ?? '').trim(),
        }))
        .filter((store) => store.value && store.label)
        .sort((first, second) => first.label.localeCompare(second.label, undefined, { sensitivity: 'base' }));

      setStores(normalizedStores);
      setRosterData(rosterResponse);
      if (!preserveEdits) {
        setPolicyWorkingDays(Array.isArray(rosterResponse.policy?.workingDays) && rosterResponse.policy.workingDays.length > 0 ? rosterResponse.policy.workingDays : [1, 2, 3, 4, 5]);
      setPolicyExtraCashEnabled(Boolean(rosterResponse.policy?.extraCashEnabled ?? rosterResponse.policy?.sundayBonusEnabled ?? true));
      setPolicyExtraCashDays(
        Array.isArray(rosterResponse.policy?.extraCashDays) && rosterResponse.policy.extraCashDays.length > 0
          ? [...rosterResponse.policy.extraCashDays].sort((a, b) => a - b)
          : [0],
      );
      setPolicyExtraCashAmount(Number(rosterResponse.policy?.extraCashAmount ?? rosterResponse.policy?.sundayBonusAmount) || 0);

      }
      const overrideMap: Record<string, boolean> = {};
      const employeeExtraMap: Record<string, number> = {};
      (rosterResponse.employees ?? []).forEach((employee) => {
        employeeExtraMap[employee.employeeId] = Number(employee.extraCashAmount ?? rosterResponse.policy?.extraCashAmount ?? rosterResponse.policy?.sundayBonusAmount ?? 0) || 0;
        (employee.days ?? []).forEach((day) => {
          overrideMap[buildOverrideKey(employee.employeeId, day.date)] = Boolean(day.isWorkingDay);
        });
      });

      setInitialOverrides(overrideMap);
      setDraftOverrides(current => preserveEdits ? { ...overrideMap, ...current } : overrideMap);
      setInitialEmployeeExtras(employeeExtraMap);
      setDraftEmployeeExtras(current => preserveEdits ? { ...employeeExtraMap, ...current } : employeeExtraMap);
    } catch (error) {
      if (request !== rosterRequest.current) return;
      const message = error instanceof Error && error.message ? error.message : 'Unable to load roster data.';
      setErrorMessage(message);
      if (!preserveEdits) {
        setRosterData(null);
        setInitialOverrides({});
        setDraftOverrides({});
        setInitialEmployeeExtras({});
        setDraftEmployeeExtras({});
      }
    } finally {
      if (request === rosterRequest.current) setIsLoading(false);
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
    if (saveLock.current) return;
    if (policyWorkingDays.length === 0) {
      setErrorMessage('Select at least one default roster day.');
      return;
    }

    if (policyExtraCashEnabled && policyExtraCashDays.length === 0) {
      setErrorMessage('Select at least one extra cash day or disable extra cash.');
      return;
    }

    saveLock.current = true;
    setIsSavingPolicy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await apiFetch('/admin/rosters/policy', {
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
      await loadRoster(true);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Unable to save roster policy.';
      setErrorMessage(message);
    } finally {
      saveLock.current = false;
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
    if (saveLock.current) return;
    if (pendingOverrideChanges.length === 0) {
      setSuccessMessage('No override changes to save.');
      setErrorMessage('');
      return;
    }

    saveLock.current = true;
    setIsSavingOverrides(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const results = await Promise.allSettled(
        pendingOverrideChanges.map((change) =>
          apiFetch('/admin/rosters/override', {
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

      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) {
        await loadRoster(true);
        throw new Error(`${results.length - failures.length} changes saved; ${failures.length} could not be saved. Your remaining changes are kept. Try saving again.`);
      }
      setSuccessMessage(`${pendingOverrideChanges.length} override change${pendingOverrideChanges.length === 1 ? '' : 's'} saved.`);
      await loadRoster(true);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Unable to update roster override.';
      setErrorMessage(message);
    } finally {
      saveLock.current = false;
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
    if (saveLock.current) return;
    if (pendingEmployeeExtraChanges.length === 0) {
      setSuccessMessage('No employee extra amount changes to save.');
      setErrorMessage('');
      return;
    }

    saveLock.current = true;
    setIsSavingEmployeeExtras(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const results = await Promise.allSettled(
        pendingEmployeeExtraChanges.map((change) =>
          apiFetch('/admin/rosters/employee-extra', {
            method: 'PATCH',
            body: JSON.stringify({
              employeeId: change.employeeId,
              ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
              extraCashAmount: change.extraCashAmount,
            }),
          }),
        ),
      );

      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) {
        await loadRoster(true);
        throw new Error(`${results.length - failures.length} changes saved; ${failures.length} could not be saved. Your remaining changes are kept. Try saving again.`);
      }
      setSuccessMessage(`${pendingEmployeeExtraChanges.length} employee extra amount change${pendingEmployeeExtraChanges.length === 1 ? '' : 's'} saved.`);
      await loadRoster(true);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Unable to save employee extra amounts.';
      setErrorMessage(message);
    } finally {
      saveLock.current = false;
      setIsSavingEmployeeExtras(false);
    }
  };

  const isProcessingSave = isSavingPolicy || isSavingOverrides || isSavingEmployeeExtras;

  const policyChanged = Boolean(rosterData && (
    JSON.stringify(policyWorkingDays) !== JSON.stringify(rosterData.policy.workingDays) ||
    policyExtraCashEnabled !== Boolean(rosterData.policy.extraCashEnabled ?? rosterData.policy.sundayBonusEnabled ?? true) ||
    JSON.stringify(policyExtraCashDays) !== JSON.stringify(rosterData.policy.extraCashDays?.length ? [...rosterData.policy.extraCashDays].sort((a,b) => a-b) : [0]) ||
    policyExtraCashAmount !== Number(rosterData.policy.extraCashAmount ?? rosterData.policy.sundayBonusAmount ?? 0)
  ));
  const hasPendingChanges = policyChanged || pendingOverrideChanges.length > 0 || pendingEmployeeExtraChanges.length > 0;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasPendingChanges) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasPendingChanges]);
  const visibleEmployees = rosterData?.employees.filter(employee => `${employee.employeeName} ${employee.employeeId} ${employee.designation || ''}`.toLowerCase().includes(search.toLowerCase())) || [];
  const scopeLabel = stores.find(store => store.value === effectiveStoreId)?.label || (effectiveStoreId ? 'Assigned store' : 'All stores');
  const changeScope = (change: () => void) => {
    if (hasPendingChanges && !window.confirm('Discard your unsaved roster changes?')) return;
    setSuccessMessage(''); change();
  };
  return <WorkforceWorkspace actions={<button className={styles.secondary} disabled={isLoading || isProcessingSave} onClick={() => changeScope(() => { void loadRoster(); })}>Refresh</button>}>
    {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}
    {successMessage && <p className={styles.notice} role="status">{successMessage}</p>}
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Team roster</h2><p>Plan working days and additional daily pay for your team.</p></div>{rosterData && <span className={styles.badge}>{rosterData.employees.length} employees</span>}</div>
      <div className={styles.filters}>
        <label>Store<select value={effectiveStoreId || ''} disabled={isStoreLocked || isProcessingSave} onChange={e => changeScope(() => setSelectedStoreId(e.target.value))}><option value="">All stores</option>{stores.map(store => <option key={store.value} value={store.value}>{store.label}</option>)}</select></label>
        <label>View<select value={selectedView} disabled={isProcessingSave} onChange={e => changeScope(() => setSelectedView(e.target.value as RosterViewMode))}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label>Date<input type="date" required value={selectedDate} disabled={isProcessingSave} onChange={e => { if(e.target.value) changeScope(() => setSelectedDate(e.target.value)); }} /></label>
        <input aria-label="Search roster employees" placeholder="Search employee name or ID" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {rosterData && <p className={styles.hint}>{scopeLabel} · {new Date(rosterData.period.startDate).toLocaleDateString()} – {new Date(rosterData.period.endDate).toLocaleDateString()}</p>}
    </section>
    <details className={workforce.settings}>
      <summary>Working days &amp; extra pay<small>Configure defaults for {scopeLabel.toLowerCase()}. Open to view or change settings.</small></summary>
      <form onSubmit={e => { e.preventDefault(); setConfirmAction('policy'); }}>
        <fieldset className={workforce.fieldset} disabled={!canManagePolicy || isProcessingSave || isLoading || !rosterData}>
          <section className={workforce.section}><h3>Default working days</h3><div className={workforce.days}>{weekdayNames.map((day,index) => <label key={day}><input type="checkbox" checked={policyWorkingDays.includes(index)} onChange={() => toggleWorkingDay(index)} />{day}</label>)}</div></section>
          <section className={workforce.section}><label className={workforce.switch}><input type="checkbox" checked={policyExtraCashEnabled} onChange={e => setPolicyExtraCashEnabled(e.target.checked)} />Enable extra daily pay</label>
            {policyExtraCashEnabled && <><p className={styles.hint}>Employees receive extra pay when working on the selected days.</p><div className={workforce.days}>{weekdayNames.map((day,index) => <label key={day}><input type="checkbox" checked={policyExtraCashDays.includes(index)} onChange={() => toggleExtraCashDay(index)} />{day}</label>)}</div><div className={styles.filters}><label>Default amount per day (₹)<input type="number" required min="0" step="0.01" value={policyExtraCashAmount} onChange={e => setPolicyExtraCashAmount(Number(e.target.value))} /></label></div></>}
          </section>
          <div className={styles.actions}><button type="submit" className={styles.primary}>{isSavingPolicy ? 'Saving…' : 'Save settings'}</button><p className={styles.hint}>{effectiveStoreId ? 'Applies to this store.' : 'Applies to stores without their own policy.'}</p></div>
        </fieldset>
      </form>
    </details>
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Employee schedule</h2><p>Check a day to mark it as working. Blue labels indicate unsaved changes. Totals reflect the last saved schedule.</p></div><div className={styles.actions}><button className={styles.secondary} onClick={() => setConfirmAction('employee-extras')} disabled={!canManagePolicy || isProcessingSave || !pendingEmployeeExtraChanges.length}>Save pay changes{pendingEmployeeExtraChanges.length ? ` (${pendingEmployeeExtraChanges.length})` : ''}</button><button className={styles.primary} onClick={() => setConfirmAction('overrides')} disabled={!canManagePolicy || isProcessingSave || !pendingOverrideChanges.length}>Save working days{pendingOverrideChanges.length ? ` (${pendingOverrideChanges.length})` : ''}</button></div></div>
      {isLoading ? <p className={styles.empty} role="status">Loading roster…</p> : !rosterData ? <p className={styles.empty}>Roster could not be loaded. Use Refresh to try again.</p> : <div className={styles.tableWrap}><table className={`${styles.table} ${workforce.roster}`}><thead><tr><th>Employee</th><th>Extra pay / day (₹)</th><th>Working days</th><th>Total extra pay</th>{rosterData.dates.map(day => <th key={day.date} className={day.dayOfWeek === 0 || day.dayOfWeek === 6 ? workforce.weekend : undefined}>{day.label}</th>)}</tr></thead><tbody>
        {visibleEmployees.map(employee => <tr key={employee.employeeId}><td><strong>{employee.employeeName}</strong><small>{employee.employeeId} · {employee.designation || 'No designation'}</small></td><td><input aria-label={`Extra daily pay for ${employee.employeeName}`} type="number" min="0" step="0.01" style={{width:110}} value={draftEmployeeExtras[employee.employeeId] ?? employee.extraCashAmount ?? 0} onChange={e => setEmployeeExtraAmount(employee.employeeId, Number(e.target.value))} disabled={!canManagePolicy || isProcessingSave || !policyExtraCashEnabled} /></td><td>{employee.totalWorkingDays}</td><td>{asCurrency(Number(employee.totalExtraCash ?? employee.totalSundayExtra ?? 0))}</td>{employee.days.map(day => {
          const key = buildOverrideKey(employee.employeeId, day.date);
          const checked = draftOverrides[key] ?? day.isWorkingDay;
          const changed = checked !== (initialOverrides[key] ?? day.isWorkingDay);
          const rate = Number(draftEmployeeExtras[employee.employeeId] ?? employee.extraCashAmount ?? policyExtraCashAmount ?? 0);
          return <td key={day.date} className={day.dayOfWeek === 0 || day.dayOfWeek === 6 ? workforce.weekend : undefined}><label className={workforce.day} data-changed={changed}><input aria-label={`${employee.employeeName}, ${day.date}, working day`} type="checkbox" checked={checked} onChange={e => applyDraftOverride(employee.employeeId,day.date,e.target.checked)} disabled={!canManagePolicy || isProcessingSave} /><span>{changed ? 'Unsaved' : checked ? 'Working' : 'Day off'}</span>{day.isExtraCashDay && checked && policyExtraCashEnabled && rate > 0 && <small>+{asCurrency(rate)}</small>}</label></td>;
        })}</tr>)}
        {!visibleEmployees.length && <tr><td colSpan={4 + rosterData.dates.length} className={styles.empty}>No employees match this store or search.</td></tr>}
      </tbody></table></div>}
    </section>
    {confirmAction && <AdminDialog title="Save roster changes" busy={isProcessingSave} onClose={() => setConfirmAction(null)}>
      <header className={styles.dialogHeader}><h2>Save roster changes</h2><button className={styles.secondary} aria-label="Close dialog" disabled={isProcessingSave} onClick={() => setConfirmAction(null)}>×</button></header>
      <div className={styles.dialogBody}><p>{confirmAction === 'policy' ? `Update working days and extra pay settings for ${scopeLabel}?` : confirmAction === 'overrides' ? `Save ${pendingOverrideChanges.length} working-day changes for ${scopeLabel}?` : `Save extra daily pay for ${pendingEmployeeExtraChanges.length} employees?`}</p><p className={styles.hint}>These settings are used by attendance and payroll.</p></div>
      <footer className={styles.dialogFooter}><button className={styles.secondary} disabled={isProcessingSave} onClick={() => setConfirmAction(null)}>Cancel</button><button className={styles.primary} disabled={isProcessingSave} onClick={async () => { const action = confirmAction; await (action === 'policy' ? savePolicy() : action === 'overrides' ? saveOverrides() : saveEmployeeExtras()); setConfirmAction(null); }}>{isProcessingSave ? 'Saving…' : 'Save changes'}</button></footer>
    </AdminDialog>}
  </WorkforceWorkspace>;
}
