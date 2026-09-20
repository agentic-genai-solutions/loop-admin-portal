'use client';

import { currencyForCountry } from '@/lib/store-currency';
import Link from 'next/link';
import styles from './incentives.module.css';
import ShopRewards from './ShopRewards';
import AwardRewardModal from './AwardRewardModal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FeedbackToast } from '@/components/Feedback';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { fetchIncentives, fetchStores } from '@/lib/admin-data';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';

export type IncentiveProgram = {
  scope?: string;
  storeIds?: string[];
  employeeIds?: string[];
  notificationScope?: string;
  id?: string;
  name: string;
  type: string;
  payout: string;
  target: string;
  status: string;
  category?: string;
  frequency?: string;
  amount?: number;
  currency?: string;
  guideline?: string;
  stores?: string[];
  employees?: string[];
  notification?: string;
  targetMetric?: string;
  targetValue?: string;
};
type DropdownOption = { id: string; name: string; countryCode?: string; storeId?: string };
type EmployeeOptionResponse = {
  _id?: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  employeeCode?: string;
  employeeId?: string;
  storeId?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
};

const emptySummary = { monthlyPayout: '₹0', activePrograms: 0, approvalRate: '0%', staffEntries: 0 };
const initialProgramForm = {
  name: '',
  scope: 'Organization-wide',
  frequency: 'Monthly',
  amount: '',
  eligibleStores: [] as string[],
  targetMetric: 'Sales value',
  targetValue: '',
  stores: 'All Stores',
  employees: 'All Employees',
  notificationScope: 'employee',
  guideline: '',
};

type View = 'overview' | 'programs' | 'entries';

function storageKey() {
  const user = JSON.parse(window.sessionStorage.getItem('loop_admin_user') || '{}');
  const identity = user._id || user.id || user.email;
  if (!identity) throw new Error('Sign in to save incentive programs.');
  return `loop_incentive_programs:${identity}`;
}

function readSavedPrograms(): IncentiveProgram[] {
  const saved = JSON.parse(window.localStorage.getItem(storageKey()) || '[]');
  return Array.isArray(saved) ? saved.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.status === 'string' && typeof item.payout === 'string') : [];
}

export default function IncentivesWorkspace({ view, initiallyOpen = false }: { view: View; initiallyOpen?: boolean }) {
  const [isAwarding, setIsAwarding] = useState(false);
  const [rewardRevision, setRewardRevision] = useState(0);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [selectedProgram, setSelectedProgram] = useState<IncentiveProgram | null>(null);
  const [programs, setPrograms] = useState<IncentiveProgram[]>([]);
  const [programSortBy, setProgramSortBy] = useState<'name' | 'type' | 'payout' | 'target' | 'status'>('name');
  const [programSortDirection, setProgramSortDirection] = useState<'asc' | 'desc'>('asc');
  const [summary, setSummary] = useState(emptySummary);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [programForm, setProgramForm] = useState(initialProgramForm);
  const [isCreatingProgram, setIsCreatingProgram] = useState(initiallyOpen);
  const [stores, setStores] = useState<DropdownOption[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState(false);
  const [employeeOptions, setEmployeeOptions] = useState<{ store: string; items: DropdownOption[]; error: boolean } | null>(null);
  const employeesLoading = employeeOptions?.store !== programForm.stores;
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setFormError(type === 'error' ? message : '');
    setToast({ message, type });
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setHasLoadError(false);
    try {
      const data = await fetchIncentives();
      let saved: IncentiveProgram[] = [];
      try { saved = readSavedPrograms(); } catch { showToast('Browser-saved programs could not be loaded.', 'error'); }
      const combined = [...saved, ...data.programs.filter((program) => !saved.some((item) => item.id === program.id))];
      setPrograms(combined);
      setSummary({ ...data.summary, activePrograms: combined.filter((program) => program.status.toLowerCase() === 'active').length });
    } catch {
      setHasLoadError(true);
      showToast('Failed to load incentives after 3 attempts. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isCreatingProgram) return;
    setFormError('');
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isCreatingProgram]);

  useEffect(() => {
    if (!isCreatingProgram) return;
    let cancelled = false;
    setStoresLoading(true);
    setStoresError(false);
    fetchStores().then((rows) => {
      if (!cancelled) setStores(rows.filter((store) => !store.isDeleted).map((store) => ({ id: String(store.id), name: String(store.name), countryCode: store.countryCode })).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {
      if (!cancelled) setStoresError(true);
    }).finally(() => {
      if (!cancelled) setStoresLoading(false);
    });
    return () => { cancelled = true; };
  }, [isCreatingProgram]);

  useEffect(() => {
    if (!isCreatingProgram) return;
    let cancelled = false;
    const store = programForm.stores;
    setEmployeeOptions(null);
    const path = '/users';
    apiFetchWithRetry<EmployeeOptionResponse[]>(path).then((rows) => {
      const items = (Array.isArray(rows) ? rows : [])
        .filter((employee) => !employee.isDeleted && !employee.deletedAt && employee.isActive !== false && (store === 'All Stores' || employee.storeId === store))
        .map((employee) => ({
          id: String(employee.employeeId || ''),
          storeId: employee.storeId,
          name: [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || employee.email || employee.employeeCode || 'Unnamed employee',
        }))
        .filter((employee) => employee.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!cancelled) setEmployeeOptions({ store, items, error: false });
    }).catch(() => {
      if (!cancelled) setEmployeeOptions({ store, items: [], error: true });
    });
    return () => { cancelled = true; };
  }, [isCreatingProgram, programForm.stores]);

  useEffect(() => {
    if (selectedProgram) document.getElementById('incentive-program-details')?.focus();
  }, [selectedProgram]);

  const sortedPrograms = useMemo(() => {
    const parseAmount = (value: string) => {
      const numeric = Number(value.replace(/[^0-9.-]+/g, ''));
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    return programs.filter((program) => (statusFilter === 'All statuses' || program.status === statusFilter) && [program.name, program.type, ...(program.stores || []), ...(program.employees || [])].join(' ').toLowerCase().includes(search.toLowerCase())).sort((first, second) => {
      const comparison = programSortBy === 'payout'
        ? parseAmount(first.payout) - parseAmount(second.payout)
        : String(first[programSortBy]).localeCompare(String(second[programSortBy]), undefined, { sensitivity: 'base' });
      return programSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [programSortBy, programSortDirection, programs, search, statusFilter]);

  const handleProgramSort = (column: 'name' | 'type' | 'payout' | 'target' | 'status') => {
    if (programSortBy === column) {
      setProgramSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setProgramSortBy(column);
    setProgramSortDirection('asc');
  };

  const handleProgramFormChange = <K extends keyof typeof initialProgramForm>(field: K, value: (typeof initialProgramForm)[K]) => {
    setProgramForm((current) => ({ ...current, [field]: value, ...(field === 'stores' ? { employees: 'All Employees' } : {}), ...(field === 'scope' ? { stores: 'All Stores', employees: 'All Employees' } : {}) }));
  };

  const currencyStores = programForm.scope === 'Store-wide'
    ? stores.filter(store => programForm.eligibleStores.includes(store.id))
    : programForm.scope === 'Employee-specific'
      ? stores.filter(store => store.id === employeeOptions?.items.find(employee => employee.id === programForm.employees)?.storeId)
      : stores;
  const currencies = [...new Set(currencyStores.map(store => currencyForCountry(store.countryCode)))];
  const programCurrency = currencies.length === 1 ? currencies[0] : undefined;
  const currencyError = storesLoading ? 'Loading store currency…' : storesError ? 'Store details could not be loaded. Close and reopen the panel to retry.' : !currencyStores.length ? 'Choose eligible stores or an employee with an assigned store.' : currencies.includes(undefined) ? 'Set a supported country in the store details before creating this program.' : currencies.length > 1 ? 'These stores use different currencies. Choose stores with the same currency and create a separate program for each currency.' : '';
  const currencySymbol = programCurrency ? new Intl.NumberFormat('en-IN', {style:'currency',currency:programCurrency}).formatToParts(0).find(part => part.type === 'currency')?.value : '';

  const handleSaveProgram = async () => {
    if (savingRef.current) return;
    if (currencyError || !programCurrency) { setFormError(currencyError || 'Choose a store to determine currency.'); return; }
    const trimmedName = programForm.name.trim();
    if (!trimmedName) {
      showToast('Program name is required before saving.', 'error');
      return;
    }

    const normalizedAmount = Number(programForm.amount);
    if (!programForm.amount || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      showToast('Enter a reward amount greater than zero.', 'error');
      return;
    }
    if (programForm.scope === 'Store-wide' && !programForm.eligibleStores.length) {
      showToast('Select at least one eligible store.', 'error');
      return;
    }
    if (programForm.scope === 'Employee-specific' && programForm.employees === 'All Employees') {
      showToast('Select an employee for an employee-specific program.', 'error');
      return;
    }
    if ((programForm.stores !== 'All Stores' && !stores.some((store) => store.id === programForm.stores)) ||
        (programForm.employees !== 'All Employees' && (employeesLoading || !employeeOptions?.items.some((employee) => employee.id === programForm.employees)))) {
      showToast('Wait for the selected store and employee to load.', 'error');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await apiFetch('/incentives/programs', { method: 'POST', body: JSON.stringify({
        name: trimmedName, scope: programForm.scope === 'Store-wide' ? 'store' : programForm.scope === 'Employee-specific' ? 'employee' : 'organization',
        amount: normalizedAmount, currency: programCurrency, frequency: programForm.frequency,
        guideline: programForm.guideline, targetMetric: programForm.targetMetric, targetValue: programForm.targetValue,
        storeIds: programForm.scope === 'Store-wide' ? programForm.eligibleStores : [],
        employeeIds: programForm.scope === 'Employee-specific' ? [programForm.employees] : [],
        notificationScope: programForm.notificationScope,
      }) });
      setProgramForm(initialProgramForm);
      setIsCreatingProgram(false);
      setSearch(''); setStatusFilter('All statuses');
      showToast('Program saved. You can now award it to an employee.', 'success');
      await loadData();
    } catch { showToast('The program could not be saved. Check your connection and try again.', 'error'); }
    finally { setSaving(false); savingRef.current = false; }
  };

  const getProgramSortArrow = (column: 'name' | 'type' | 'payout' | 'target' | 'status') => {
    if (programSortBy !== column) return '↕';
    return programSortDirection === 'asc' ? '↑' : '↓';
  };

  const navigation = [
    { href: '/incentives', label: 'Overview', key: 'overview' },
    { href: '/incentives/programs', label: 'Reward programs', key: 'programs' },
    { href: '/incentives/entries', label: 'Employee rewards', key: 'entries' },
  ];
  return (
    <main className={styles.workspace}>
      {toast && !isCreatingProgram && <FeedbackToast title={toast.type === 'success' ? 'Success' : 'Error'} description={toast.message} type={toast.type} onClose={() => setToast(null)} durationMs={4000} />}
      <div className={styles.pageToolbar}>
        <nav className={styles.tabs} aria-label="Incentive pages">
          {navigation.map((item) => <Link key={item.key} href={item.href} aria-current={view === item.key ? 'page' : undefined}>{item.label}</Link>)}
        </nav>
        {view === 'programs' && <button type="button" className={styles.primary} onClick={() => setIsCreatingProgram(true)}>+ New program</button>}
        {view === 'entries' && <button type="button" className={styles.primary} disabled={isLoading || hasLoadError} onClick={() => { setToast(null); setIsAwarding(true); }}>Award employee</button>}
      </div>
      {view === 'overview' && <>
        <section className={styles.metrics} aria-label="Incentive summary">
          {[['Monthly payout', summary.monthlyPayout, 'Current cycle'], ['Active programs', summary.activePrograms, 'Available rewards'], ['Approval rate', summary.approvalRate, 'Approved staff entries'], ['Staff entries', summary.staffEntries, 'Recorded rewards']].map(([label, value]) => <div className={styles.metric} key={label}><span>{label}</span><strong>{isLoading ? '—' : value}</strong></div>)}
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Programs <span className={styles.count}>{isLoading ? '…' : programs.length}</span></h2></div><Link href="/incentives/programs" className={styles.textLink}>View all programs →</Link></div>
          {isLoading ? <TableSkeleton columns={3} rows={2} /> : hasLoadError ? <EmptyState variant="error" onRetry={loadData} /> : programs.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}>✧</span><h3>No programs yet</h3><p>Add a program to start rewarding your team.</p><Link className={styles.primary} href="/incentives/programs">Go to programs</Link></div> : <div className={styles.programGrid}>{programs.slice(0, 3).map((program) => <button className={styles.programCard} key={program.id} onClick={() => setSelectedProgram(program)}><span className={styles.cardTop}><span className={styles.programIcon}>✧</span><span className={`badge ${program.status === 'Active' ? 'success' : 'info'}`}>{program.status}</span></span><h3>{program.name}</h3><p>{program.type}</p><strong>{program.payout}<small> / {program.frequency || 'Monthly'}</small></strong><span className={styles.cardFooter}>{(program.stores || ['All Stores']).join(', ')}<span>View details →</span></span></button>)}</div>}
        </section>
        <Link href="/incentives/entries" className={styles.entryLink}><div><h3>Employee rewards</h3><p>{isLoading ? 'Loading…' : `${summary.staffEntries} entries · ${summary.approvalRate} approved`}</p></div><span aria-hidden="true">→</span></Link>
      </>}
      {view === 'programs' && <section className={styles.panel}>
        <div className={styles.filters}><input aria-label="Search programs" placeholder="Search programs, stores, or employees…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{['All statuses', ...Array.from(new Set(programs.map((program) => program.status)))].map((status) => <option key={status}>{status}</option>)}</select></div>
        <div className={styles.resultsBar}><span role="status">{isLoading ? 'Loading programs…' : hasLoadError ? 'Programs unavailable' : `${sortedPrograms.length} of ${programs.length} programs`}</span>{(search || statusFilter !== 'All statuses') && <button type="button" className={styles.textButton} onClick={() => { setSearch(''); setStatusFilter('All statuses'); }}>Clear filters</button>}<span className={styles.storageHint}>New programs are saved online</span></div>
        {isLoading ? <TableSkeleton columns={5} rows={4} /> : hasLoadError ? <EmptyState variant="error" onRetry={loadData} /> : programs.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}>✧</span><h3>No programs yet</h3><p>Create a reward program and it will be listed here.</p><button type="button" className={styles.primary} onClick={() => setIsCreatingProgram(true)}>Create first program</button></div> : <div className={styles.tableWrap}><table className="table"><thead><tr>{([['name', 'Program'], ['type', 'Eligibility'], ['payout', 'Reward'], ['target', 'Target'], ['status', 'Status']] as const).map(([key, label]) => <th key={key} aria-sort={programSortBy === key ? programSortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button className={styles.sortButton} onClick={() => handleProgramSort(key)}>{label} {getProgramSortArrow(key)}</button></th>)}</tr></thead><tbody>{sortedPrograms.length ? sortedPrograms.map((program) => <tr key={program.id}><td><button className={styles.programName} onClick={() => setSelectedProgram(program)}>{program.name}</button><small className={styles.cellSub}>{program.frequency || 'Monthly'}{!/^[a-f\d]{24}$/i.test(program.id || '') ? ' · Browser draft' : ''}</small></td><td>{program.type}<small className={styles.cellSub}>{(program.stores || ['All Stores']).join(', ')} · {(program.employees || ['All Employees']).join(', ')}</small></td><td><strong>{program.payout}</strong></td><td>{program.target}</td><td><span className={`badge ${program.status === 'Active' ? 'success' : 'info'}`}>{program.status}</span></td></tr>) : <EmptyState colSpan={5} title="No matching programs" description="Try another search or status filter." />}</tbody></table></div>}
      </section>}
      {view === 'entries' && <ShopRewards key={rewardRevision} />}
      {isCreatingProgram && <dialog ref={dialogRef} className={styles.programDrawer} aria-labelledby="new-program-title" onCancel={event => { if(saving) event.preventDefault(); else setIsCreatingProgram(false); }}>
        <header className={styles.awardHeader}><div><h2 id="new-program-title">New incentive program</h2><p className={styles.hint}>Choose who can earn it, then set the reward.</p></div><button type="button" className={styles.secondary} aria-label="Close new program" disabled={saving} onClick={() => setIsCreatingProgram(false)}>×</button></header>
        <form className={styles.awardForm} onSubmit={event => {event.preventDefault(); void handleSaveProgram();}}>
          <div className={styles.awardScroll}>
            <fieldset className={styles.programFields} disabled={saving}>
              {formError && <p role="alert" className={styles.awardError}>{formError}</p>}
              <label>Program name<input required autoFocus value={programForm.name} onChange={e => handleProgramFormChange('name',e.target.value)} placeholder="e.g. Outstanding sales" /></label>
              <section className={styles.programSection}><h3>Who can earn this reward?</h3>
                <label>Eligible people<select value={programForm.scope} onChange={e => handleProgramFormChange('scope',e.target.value)}><option value="Organization-wide">Everyone in the organization</option><option value="Store-wide">People in selected stores</option><option value="Employee-specific">A specific employee</option></select></label>
                {programForm.scope === 'Store-wide' && <fieldset className={styles.storeChoices}><legend>Eligible stores</legend>{stores.map(store => <label key={store.id}><input type="checkbox" checked={programForm.eligibleStores.includes(store.id)} onChange={e => handleProgramFormChange('eligibleStores',e.target.checked ? [...programForm.eligibleStores,store.id] : programForm.eligibleStores.filter(id => id !== store.id))} /><span>{store.name}<small>{currencyForCountry(store.countryCode) || 'Country required'}</small></span></label>)}</fieldset>}
                {programForm.scope === 'Employee-specific' && <><label>Store<select value={programForm.stores} disabled={storesLoading || storesError} onChange={e => handleProgramFormChange('stores',e.target.value)}><option value="All Stores">All stores</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label>Employee<select value={programForm.employees} disabled={employeesLoading || employeeOptions?.error} onChange={e => handleProgramFormChange('employees',e.target.value)}><option value="All Employees">Choose an employee</option>{!employeesLoading && employeeOptions?.items.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>{employeeOptions?.error && <p className={styles.awardError}>Employees could not be loaded. Change the store to retry.</p>}</>}
              </section>
              <section className={styles.programSection}><h3>Reward</h3><div className={styles.awardColumns}><label>Amount {currencySymbol && `(${currencySymbol})`}<input required type="number" min="0.01" step="0.01" value={programForm.amount} onChange={e => handleProgramFormChange('amount',e.target.value)} placeholder="250" /></label><label>How often?<select value={programForm.frequency} onChange={e => handleProgramFormChange('frequency',e.target.value)}><option>Daily</option><option>Weekly</option><option>Monthly</option></select></label></div>
                <p className={currencyError ? styles.awardError : styles.currencyNote} role="status">{currencyError || `Currency: ${programCurrency} · Set from the eligible stores’ country.`}</p>
              </section>
              <section className={styles.programSection}><h3>When someone earns the reward</h3><label>Notify<select value={programForm.notificationScope} onChange={e => handleProgramFormChange('notificationScope',e.target.value)}><option value="employee">Only the employee</option><option value="store">The employee and their store</option><option value="organization">Everyone in the organization</option></select><small>Sent when a reward is awarded or approved.</small></label></section>
              <details className={styles.programSection}><summary>Target &amp; guidelines <small>Optional</small></summary><div className={styles.programFields}><div className={styles.awardColumns}><label>Measure<input value={programForm.targetMetric} onChange={e => handleProgramFormChange('targetMetric',e.target.value)} placeholder="Sales value" /></label><label>Target<input value={programForm.targetValue} onChange={e => handleProgramFormChange('targetValue',e.target.value)} placeholder="e.g. 5000" /></label></div><label>Guidelines<textarea rows={3} value={programForm.guideline} onChange={e => handleProgramFormChange('guideline',e.target.value)} placeholder="Explain what the employee needs to achieve." /></label></div></details>
            </fieldset>
          </div>
          <footer className={styles.awardFooter}><span>{programCurrency && programForm.amount ? new Intl.NumberFormat('en-IN',{style:'currency',currency:programCurrency}).format(Number(programForm.amount) || 0) + ' per reward' : 'Set up your reward above'}</span><div><button type="button" className={styles.secondary} disabled={saving} onClick={() => setIsCreatingProgram(false)}>Cancel</button><button type="submit" className={styles.primary} disabled={saving || Boolean(currencyError)}>{saving ? 'Saving…' : 'Create program'}</button></div></footer>
        </form>
      </dialog>}
      {selectedProgram && <section id="incentive-program-details" tabIndex={-1} className={styles.panel} aria-label="Program details">
        <div className={styles.panelHeader}><div><h2>{selectedProgram.name}</h2></div><button className={styles.secondary} onClick={() => setSelectedProgram(null)}>Close details</button></div>
        <p>{selectedProgram.guideline}</p><dl className={styles.details}>{[['Status', selectedProgram.status], ['Scope', selectedProgram.type], ['Reward', selectedProgram.payout], ['Frequency', selectedProgram.frequency], ['Target', selectedProgram.target], ['Stores', selectedProgram.stores?.join(', ')], ['Employees', selectedProgram.employees?.join(', ')], ['Notification', selectedProgram.notification]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
      </section>}
      {isAwarding && <AwardRewardModal programs={programs} onClose={() => setIsAwarding(false)} onProgramSaved={(oldId) => {
        try { window.localStorage.setItem(storageKey(), JSON.stringify(readSavedPrograms().filter(item => item.id !== oldId))); } catch { /* The server program remains available if storage is unavailable. */ }
        void loadData();
      }} onAwarded={(notificationError) => { setIsAwarding(false); setRewardRevision(current => current + 1); showToast(notificationError ? 'Reward awarded. Notification delivery needs a retry from Rewards.' : 'Reward awarded and notifications sent.', notificationError ? 'error' : 'success'); void loadData(); }} />}
    </main>
  );
}
