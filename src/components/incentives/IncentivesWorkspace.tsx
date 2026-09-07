'use client';

import Link from 'next/link';
import styles from './incentives.module.css';
import ShopRewards from './ShopRewards';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FeedbackToast } from '@/components/Feedback';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { fetchIncentives, fetchStores } from '@/lib/admin-data';
import { apiFetchWithRetry } from '@/lib/api';

type IncentiveProgram = {
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
type DropdownOption = { id: string; name: string };
type EmployeeOptionResponse = {
  _id?: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  employeeCode?: string;
  isDeleted?: boolean;
  deletedAt?: string;
};

const emptySummary = { monthlyPayout: '$0', activePrograms: 0, approvalRate: '0%', staffEntries: 0 };
const initialProgramForm = {
  name: '',
  scope: 'Organization-wide',
  frequency: 'Monthly',
  amount: '',
  targetMetric: 'Sales value',
  targetValue: '',
  stores: 'All Stores',
  employees: 'All Employees',
  notification: 'In-app',
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
      if (!cancelled) setStores(rows.filter((store) => !store.isDeleted).map((store) => ({ id: String(store.id), name: String(store.name) })).sort((a, b) => a.name.localeCompare(b.name)));
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
    const path = store === 'All Stores' ? '/employees' : `/employees/store/${encodeURIComponent(store)}`;
    apiFetchWithRetry<EmployeeOptionResponse[]>(path).then((rows) => {
      const items = (Array.isArray(rows) ? rows : [])
        .filter((employee) => !employee.isDeleted && !employee.deletedAt)
        .map((employee) => ({
          id: String(employee._id ?? employee.id ?? ''),
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
    setProgramForm((current) => ({ ...current, [field]: value, ...(field === 'stores' ? { employees: 'All Employees' } : {}) }));
  };

  const handleSaveProgram = () => {
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
    if (programForm.scope === 'Store-wide' && programForm.stores === 'All Stores') {
      showToast('Select a store for a store-wide program.', 'error');
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
    const newProgram: IncentiveProgram = {
      id: `${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      name: trimmedName,
      type: programForm.scope,
      payout: `$${Number.isFinite(normalizedAmount) && normalizedAmount > 0 ? normalizedAmount.toLocaleString() : '0'}`,
      target: `${programForm.targetMetric} • ${programForm.targetValue || 'Configured target'}`,
      status: 'Active',
      category: programForm.scope,
      frequency: programForm.frequency,
      amount: normalizedAmount,
      currency: 'USD',
      guideline: programForm.guideline || 'Set the KPI, target threshold and award rule for this program.',
      stores: [stores.find((store) => store.id === programForm.stores)?.name ?? 'All Stores'],
      employees: [employeeOptions?.items.find((employee) => employee.id === programForm.employees)?.name ?? 'All Employees'],
      notification: programForm.notification,
      targetMetric: programForm.targetMetric,
      targetValue: programForm.targetValue || 'Configured threshold',
    };

    try {
      window.localStorage.setItem(storageKey(), JSON.stringify([newProgram, ...readSavedPrograms()]));
    } catch {
      showToast('Unable to save this program in your browser. Check browser storage and try again.', 'error');
      return;
    }
    setPrograms((current) => [newProgram, ...current]);
    setSummary((current) => ({
      ...current,
      activePrograms: current.activePrograms + 1,
      staffEntries: current.staffEntries,
    }));
    setProgramForm(initialProgramForm);
    setIsCreatingProgram(false);
    setSearch('');
    setStatusFilter('All statuses');
    showToast('Incentive program saved successfully.', 'success');
  };

  const getProgramSortArrow = (column: 'name' | 'type' | 'payout' | 'target' | 'status') => {
    if (programSortBy !== column) return '↕';
    return programSortDirection === 'asc' ? '↑' : '↓';
  };

  const navigation = [
    { href: '/incentives', label: 'Overview', key: 'overview' },
    { href: '/incentives/programs', label: 'Programs', key: 'programs' },
    { href: '/incentives/entries', label: 'Rewards', key: 'entries' },
  ];
  return (
    <main className={styles.workspace}>
      {toast && !isCreatingProgram && <FeedbackToast title={toast.type === 'success' ? 'Success' : 'Error'} description={toast.message} type={toast.type} onClose={() => setToast(null)} durationMs={4000} />}
      <div className={styles.pageToolbar}>
        <nav className={styles.tabs} aria-label="Incentive pages">
          {navigation.map((item) => <Link key={item.key} href={item.href} aria-current={view === item.key ? 'page' : undefined}>{item.label}</Link>)}
        </nav>
        <button type="button" className={styles.primary} onClick={() => setIsCreatingProgram(true)}>+ New program</button>
      </div>
      {view === 'overview' && <>
        <section className={styles.metrics} aria-label="Incentive summary">
          {[['Monthly payout', summary.monthlyPayout, 'Current cycle'], ['Active programs', summary.activePrograms, 'Available rewards'], ['Approval rate', summary.approvalRate, 'Approved staff entries'], ['Staff entries', summary.staffEntries, 'Recorded rewards']].map(([label, value]) => <div className={styles.metric} key={label}><span>{label}</span><strong>{isLoading ? '—' : value}</strong></div>)}
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Programs <span className={styles.count}>{isLoading ? '…' : programs.length}</span></h2></div><Link href="/incentives/programs" className={styles.textLink}>View all programs →</Link></div>
          {isLoading ? <TableSkeleton columns={3} rows={2} /> : hasLoadError ? <EmptyState variant="error" onRetry={loadData} /> : programs.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}>✧</span><h3>No programs yet</h3><p>Add a program to start rewarding your team.</p><button type="button" className={styles.primary} onClick={() => setIsCreatingProgram(true)}>Create first program</button></div> : <div className={styles.programGrid}>{programs.slice(0, 3).map((program) => <button className={styles.programCard} key={program.id} onClick={() => setSelectedProgram(program)}><span className={styles.cardTop}><span className={styles.programIcon}>✧</span><span className={`badge ${program.status === 'Active' ? 'success' : 'info'}`}>{program.status}</span></span><h3>{program.name}</h3><p>{program.type}</p><strong>{program.payout}<small> / {program.frequency || 'Monthly'}</small></strong><span className={styles.cardFooter}>{(program.stores || ['All Stores']).join(', ')}<span>View details →</span></span></button>)}</div>}
        </section>
        <Link href="/incentives/entries" className={styles.entryLink}><div><h3>Employee rewards</h3><p>{isLoading ? 'Loading…' : `${summary.staffEntries} entries · ${summary.approvalRate} approved`}</p></div><span aria-hidden="true">→</span></Link>
      </>}
      {view === 'programs' && <section className={styles.panel}>
        <div className={styles.filters}><input aria-label="Search programs" placeholder="Search programs, stores, or employees…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{['All statuses', ...Array.from(new Set(programs.map((program) => program.status)))].map((status) => <option key={status}>{status}</option>)}</select></div>
        <div className={styles.resultsBar}><span role="status">{isLoading ? 'Loading programs…' : hasLoadError ? 'Programs unavailable' : `${sortedPrograms.length} of ${programs.length} programs`}</span>{(search || statusFilter !== 'All statuses') && <button type="button" className={styles.textButton} onClick={() => { setSearch(''); setStatusFilter('All statuses'); }}>Clear filters</button>}<span className={styles.storageHint}>New programs are saved in this browser</span></div>
        {isLoading ? <TableSkeleton columns={5} rows={4} /> : hasLoadError ? <EmptyState variant="error" onRetry={loadData} /> : programs.length === 0 ? <div className={styles.empty}><span className={styles.emptyIcon}>✧</span><h3>No programs yet</h3><p>Create a reward program and it will be listed here.</p><button type="button" className={styles.primary} onClick={() => setIsCreatingProgram(true)}>Create first program</button></div> : <div className={styles.tableWrap}><table className="table"><thead><tr>{([['name', 'Program'], ['type', 'Eligibility'], ['payout', 'Reward'], ['target', 'Target'], ['status', 'Status']] as const).map(([key, label]) => <th key={key} aria-sort={programSortBy === key ? programSortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button className={styles.sortButton} onClick={() => handleProgramSort(key)}>{label} {getProgramSortArrow(key)}</button></th>)}</tr></thead><tbody>{sortedPrograms.length ? sortedPrograms.map((program) => <tr key={program.id}><td><button className={styles.programName} onClick={() => setSelectedProgram(program)}>{program.name}</button><small className={styles.cellSub}>{program.frequency || 'Monthly'}</small></td><td>{program.type}<small className={styles.cellSub}>{(program.stores || ['All Stores']).join(', ')} · {(program.employees || ['All Employees']).join(', ')}</small></td><td><strong>{program.payout}</strong></td><td>{program.target}</td><td><span className={`badge ${program.status === 'Active' ? 'success' : 'info'}`}>{program.status}</span></td></tr>) : <EmptyState colSpan={5} title="No matching programs" description="Try another search or status filter." />}</tbody></table></div>}
      </section>}
      {view === 'entries' && <ShopRewards />}
      {isCreatingProgram && <dialog ref={dialogRef} className={styles.modal} aria-labelledby="new-program-title" onCancel={() => setIsCreatingProgram(false)} onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setIsCreatingProgram(false);
        }
      }}>
        {toast && <FeedbackToast title={toast.type === 'success' ? 'Success' : 'Error'} description={toast.message} type={toast.type} onClose={() => setToast(null)} durationMs={4000} />}
        <form className={`${styles.panel} ${styles.form}`} onSubmit={(event) => { event.preventDefault(); handleSaveProgram(); }}>
        <div className={styles.panelHeader}><div><h2 id="new-program-title">New program</h2></div><button type="button" className={styles.secondary} aria-label="Close new program" onClick={() => setIsCreatingProgram(false)}>×</button></div>
        <p className={styles.storageNote}>This program will be saved in this browser for your account.</p>
            <div className={styles.formGrid}>
              <div className={styles.formSection}><span>01</span><div><h3>Reward & target</h3></div></div>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                Program name
                <input required autoFocus value={programForm.name} onChange={(event) => handleProgramFormChange('name', event.target.value)} placeholder="WOW Bill for Single Customer Purchase" style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14 }} />
              </label>

              <label style={{ display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                Scope
                <select value={programForm.scope} onChange={(event) => handleProgramFormChange('scope', event.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14 }}>
                  <option value="Organization-wide">Organization-wide</option>
                  <option value="Store-wide">Store-wide</option>
                  <option value="Employee-specific">Employee-specific</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                Frequency
                <select value={programForm.frequency} onChange={(event) => handleProgramFormChange('frequency', event.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14 }}>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                Reward amount (USD)
                <input type="number" min="0.01" step="0.01" required value={programForm.amount} onChange={(event) => handleProgramFormChange('amount', event.target.value)} placeholder="250" style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14 }} />
              </label>

              <label style={{ display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                Target metric
                <input value={programForm.targetMetric} onChange={(event) => handleProgramFormChange('targetMetric', event.target.value)} placeholder="Sales value" style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14 }} />
              </label>

              <label style={{ display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                Target value
                <input value={programForm.targetValue} onChange={(event) => handleProgramFormChange('targetValue', event.target.value)} placeholder="e.g. 5000" style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14 }} />
              </label>

              <div className={styles.formSection}><span>02</span><div><h3>Eligibility & communication</h3></div></div>
              <label style={{ display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                Stores
                <select value={programForm.stores} onChange={(event) => handleProgramFormChange('stores', event.target.value)} disabled={storesLoading || storesError} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14 }}>
                  <option value="All Stores">All Stores</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
                {storesLoading && <small role="status">Loading stores…</small>}
                {storesError && <small role="alert">Unable to load stores. Close and reopen this form to retry.</small>}
                {!storesLoading && !storesError && stores.length === 0 && <small role="status">No stores available.</small>}
              </label>

              <label style={{ display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                Employees
                <select value={programForm.employees} onChange={(event) => handleProgramFormChange('employees', event.target.value)} disabled={employeesLoading || employeeOptions?.error} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14 }}>
                  <option value="All Employees">{programForm.stores === 'All Stores' ? 'All Employees' : 'All Employees in selected store'}</option>
                  {!employeesLoading && employeeOptions?.items.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
                {employeesLoading && <small role="status">Loading employees…</small>}
                {!employeesLoading && employeeOptions?.error && <small role="alert">Unable to load employees. Change the store or reopen this form to retry.</small>}
                {!employeesLoading && !employeeOptions?.error && employeeOptions?.items.length === 0 && <small role="status">No employees available{programForm.stores === 'All Stores' ? '.' : ' for this store.'}</small>}
              </label>

              <label style={{ display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a' }}>
                Notification in app
                <select value={programForm.notification} onChange={(event) => handleProgramFormChange('notification', event.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14 }}>
                  <option value="In-app">In-app</option>
                  <option value="In-app + push">In-app + push</option>
                  <option value="Dashboard only">Dashboard only</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a', gridColumn: '1 / -1' }}>
                Guideline / rule
                <textarea value={programForm.guideline} onChange={(event) => handleProgramFormChange('guideline', event.target.value)} placeholder="Reward when a single customer purchase crosses the configured basket threshold..." rows={4} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.5)', fontSize: 14, resize: 'vertical' }} />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" onClick={() => setIsCreatingProgram(false)} style={{ padding: '12px 18px', borderRadius: 12, background: '#e2e8f0', color: '#0f172a', border: 'none', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" style={{ padding: '12px 18px', borderRadius: 12, background: '#0f172a', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer' }}>Save Program</button>
            </div>
      </form></dialog>}
      {selectedProgram && <section id="incentive-program-details" tabIndex={-1} className={styles.panel} aria-label="Program details">
        <div className={styles.panelHeader}><div><h2>{selectedProgram.name}</h2></div><button className={styles.secondary} onClick={() => setSelectedProgram(null)}>Close details</button></div>
        <p>{selectedProgram.guideline}</p><dl className={styles.details}>{[['Status', selectedProgram.status], ['Scope', selectedProgram.type], ['Reward', selectedProgram.payout], ['Frequency', selectedProgram.frequency], ['Target', selectedProgram.target], ['Stores', selectedProgram.stores?.join(', ')], ['Employees', selectedProgram.employees?.join(', ')], ['Notification', selectedProgram.notification]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
      </section>}
    </main>
  );
}
