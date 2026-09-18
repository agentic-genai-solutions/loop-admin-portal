'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { financeNavigation, type FinanceTab } from '@/lib/finance-navigation';
import navigationStyles from '@/components/incentives/incentives.module.css';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';
import styles from './finance.module.css';

type Employee = { employeeId: string; fullName: string; storeId: string };
type Store = { _id: string; name: string; isActive?: boolean; isDeleted?: boolean };
type Salary = { salaryConfigId: string; employeeId: string; storeId: string | null; baseSalary: number; currency: string; payoutDay: number; payoutMode: string; notes?: string; isActive: boolean };
type Payroll = { _id: string; payrollId: string; employeeId: string; storeId?: string; periodStart: string; periodEnd: string; status: string; currency: string; netSalary: number; incentiveAmount?: number };
type Run = { salaryRunId: string; periodStart: string; periodEnd: string; storeId?: string; status: string; totalEmployees: number; createdPayrollCount: number; skippedPayrollCount: number; failedPayrollCount: number; runErrors?: { employeeId: string; message: string }[] };
type Slip = { slipId: string; employeeId: string; storeId?: string; period: { start: string; end: string }; attendance: { payableDays: number; absentDays: number; presentDays: number; approvedLeaveDays: number }; earnings: { baseSalary: number; earnedBaseSalary: number; overtime: number; bonus: number; sundayExtraPay: number; incentiveAmount: number }; deductions: { totalDeductions: number }; totals: { netSalary: number }; payout: { currency: string; payoutDay: number; payoutMode: string }; status: string };
const base = '/accounting/payroll';
const currencies = ['INR', 'USD', 'AED', 'SAR', 'GBP', 'EUR'];
const money = (amount: number, currency = 'INR') => { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(amount || 0); } catch { return `${currency} ${Number(amount || 0).toFixed(2)}`; } };
const date = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const period = (row: { periodStart: string; periodEnd: string }) => `${date(row.periodStart)} – ${date(row.periodEnd)}`;
const readable = (value: string) => ({ draft: 'Needs review', approved: 'Approved', paid: 'Paid', running: 'In progress', completed: 'Completed', completed_with_errors: 'Needs attention', failed: 'Failed', bank_transfer: 'Bank transfer', upi: 'UPI', cash: 'Cash' }[value] || value);
const errorText = (error: unknown) => { if (!(error instanceof Error)) return 'Something went wrong. Please try again.'; try { const payload = JSON.parse(error.message); return Array.isArray(payload.message) ? payload.message.join('. ') : payload.message || 'Request failed.'; } catch { return error.message; } };
const newSalary = { employeeId: '', storeId: '', baseSalary: '', currency: 'INR', payoutDay: '1', payoutMode: 'bank_transfer', notes: '' };

function Dialog({ title, children, onClose, busy }: { title: string; children: ReactNode; onClose: () => void; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    ref.current?.showModal(); document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><small>FINANCE</small><h2>{title}</h2></div><button type="button" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button></header>{children}
  </dialog>;
}

export default function FinanceWorkspace({ tab = 'Overview' }: { tab?: FinanceTab }) {
  const router = useRouter();
  const [data, setData] = useState<{ employees: Employee[]; stores: Store[]; salaries: Salary[]; payroll: Payroll[]; runs: Run[] }>({ employees: [], stores: [], salaries: [], payroll: [], runs: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState<'salary' | 'run' | 'slip' | 'runDetail' | 'status' | null>(null);
  const [salary, setSalary] = useState(newSalary);
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; });
  const [runStore, setRunStore] = useState('');
  const [slip, setSlip] = useState<Slip | null>(null);
  const [runDetail, setRunDetail] = useState<Run | null>(null);
  const [target, setTarget] = useState<Payroll | null>(null);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [employeeActive, setEmployeeActive] = useState(-1);
  const employeeList = useRef<HTMLUListElement>(null);
  useEffect(() => { if (employeeOpen && employeeActive >= 0) employeeList.current?.children[employeeActive]?.scrollIntoView({ block: 'nearest' }); }, [employeeOpen, employeeActive]);
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const [employees, stores, salaries, payroll, runs] = await Promise.all([
        apiFetchWithRetry<Employee[]>(`${base}/employees`), apiFetchWithRetry<Store[]>('/stores'),
        apiFetchWithRetry<Salary[]>(`${base}/salary-configs`), apiFetchWithRetry<Payroll[]>(base), apiFetchWithRetry<Run[]>(`${base}/runs`),
      ]);
      setData({ employees, stores, salaries: salaries.filter(item => item.isActive), payroll, runs });
    } catch (failure) { setLoadError(errorText(failure)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const employeeNames = useMemo(() => new Map(data.employees.map(item => [item.employeeId, item.fullName])), [data.employees]);
  const storeNames = useMemo(() => new Map(data.stores.map(item => [item._id, item.name])), [data.stores]);
  const employeeName = (id: string) => employeeNames.get(id) || id;
  const storeName = (id?: string | null) => (id ? storeNames.get(id) || id : 'All stores');
  const switchTab = (next: FinanceTab) => { router.push(financeNavigation.find(item => item.label === next)!.href); };
  const close = () => { if (!busyRef.current) { setModal(null); setError(''); } };
  const open = (next: typeof modal) => { setError(''); setModal(next); };
  const matches = (id: string, store?: string | null) => (!storeFilter || store === storeFilter) && `${employeeName(id)} ${id} ${storeName(store)}`.toLowerCase().includes(search.trim().toLowerCase());
  const payroll = data.payroll.filter(item => matches(item.employeeId, item.storeId) && (!statusFilter || item.status === statusFilter));
  const salaries = data.salaries.filter(item => matches(item.employeeId, item.storeId));
  const runs = data.runs.filter(item => (!storeFilter || item.storeId === storeFilter) && `${period(item)} ${storeName(item.storeId)} ${item.salaryRunId}`.toLowerCase().includes(search.trim().toLowerCase()));
  const employeeOptions = data.employees.filter(item => `${item.fullName} ${item.employeeId}`.toLowerCase().includes(employeeQuery.toLowerCase()));
  const chooseEmployee = (employee: Employee) => { setSalary(current => ({ ...current, employeeId: employee.employeeId, storeId: employee.storeId })); setEmployeeOpen(false); setEmployeeQuery(''); };
  const perform = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (failure) { setError(errorText(failure)); } finally { busyRef.current = false; setBusy(false); }
  };
  const saveSalary = () => perform(async () => {
    if (!salary.employeeId) throw new Error('Choose an employee from the list.');
    await apiFetch(`${base}/salary-configs`, { method: 'POST', body: JSON.stringify({ ...salary, storeId: salary.storeId || undefined, baseSalary: Number(salary.baseSalary), payoutDay: Number(salary.payoutDay) }) });
    setModal(null); setNotice('Salary saved. Future payroll runs will use these settings.'); await load();
  });
  const generate = () => perform(async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid payroll month.');
    const [year, monthNumber] = month.split('-').map(Number);
    const end = new Date(year, monthNumber, 0).getDate();
    const result = await apiFetch<Run>(`${base}/generate`, { method: 'POST', body: JSON.stringify({ periodStart: `${month}-01`, periodEnd: `${month}-${end}`, storeId: runStore || undefined }) });
    setModal(null); setNotice(`Payroll prepared: ${result.createdPayrollCount} created, ${result.skippedPayrollCount} already existed, ${result.failedPayrollCount} need attention.`); await load();
  });
  const showSlip = (row: Payroll) => perform(async () => { setSlip(await apiFetch<Slip>(`${base}/${encodeURIComponent(row.payrollId)}/slip`)); open('slip'); });
  const showRun = (run: Run) => perform(async () => { setRunDetail(await apiFetch<Run>(`${base}/runs/${encodeURIComponent(run.salaryRunId)}`)); open('runDetail'); });
  const updateStatus = () => perform(async () => {
    if (!target) return;
    const status = target.status === 'draft' ? 'approved' : 'paid';
    const updated = await apiFetch<Payroll>(`${base}/${encodeURIComponent(target._id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setData(current => ({ ...current, payroll: current.payroll.map(item => item._id === updated._id ? updated : item) }));
    setModal(null); setNotice(status === 'paid' ? 'Payment recorded.' : 'Payroll approved. Approved rewards are included in the updated total.');
  });
  const editSalary = (config?: Salary) => {
    setEditing(Boolean(config)); setEmployeeOpen(false); setEmployeeQuery('');
    setSalary(config ? { employeeId: config.employeeId, storeId: config.storeId || '', baseSalary: String(config.baseSalary), currency: config.currency, payoutDay: String(config.payoutDay), payoutMode: config.payoutMode, notes: config.notes || '' } : newSalary); open('salary');
  };
  const ready = data.employees.filter(employee => (!runStore || employee.storeId === runStore));
  const missing = ready.filter(employee => !data.salaries.some(config => config.employeeId === employee.employeeId && (!config.storeId || config.storeId === employee.storeId) && config.baseSalary > 0));
  const badge = (status: string) => <span className={styles.badge} data-status={status}>{readable(status)}</span>;
  const empty = (title: string, description: string, action?: ReactNode) => <div className={styles.empty}><span aria-hidden="true">₹</span><h3>{title}</h3><p>{description}</p>{action}</div>;
  const totals = Object.entries(data.payroll.filter(item => item.status === 'approved').reduce<Record<string, number>>((sum, item) => { const currency = item.currency || 'INR'; sum[currency] = (sum[currency] || 0) + item.netSalary; return sum; }, {}));

  return <main className={styles.workspace}>
    <div className={navigationStyles.pageToolbar}><nav className={navigationStyles.tabs} aria-label="Finance pages">{financeNavigation.map(item => <Link key={item.href} href={item.href} aria-current={tab === item.label ? 'page' : undefined}>{item.label}</Link>)}</nav>
      {tab === 'Salaries' && <button className={navigationStyles.primary} disabled={loading || !!loadError} onClick={() => editSalary()}>+ Set up salary</button>}
      {tab === 'Payroll runs' && <button className={navigationStyles.primary} disabled={loading || !!loadError} onClick={() => open('run')}>+ Run payroll</button>}
    </div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && !modal && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <div className={styles.empty} role="status">Loading finance…</div> : loadError ? <div className={styles.panel} role="alert"><h3>Finance couldn’t load</h3><p>{loadError}</p><button className={styles.secondary} onClick={load}>Try again</button></div> : <>
      {tab === 'Overview' && <>
        <div className={styles.metrics}><div><span>Configured salaries</span><strong>{data.salaries.length}</strong><small>{data.employees.length} active employees</small></div><div><span>Awaiting review</span><strong>{data.payroll.filter(item => item.status === 'draft').length}</strong><small>Review before approval</small></div><div><span>Ready for payment</span><strong className={styles.money}>{totals.length ? totals.map(([currency, amount]) => <span key={currency}>{money(amount, currency)}</span>) : money(0)}</strong><small>Approved payroll · all periods</small></div></div>
        {!data.payroll.length && <div className={styles.steps}><div><small>01 · SET UP</small><h3>Start with salaries</h3><p>Set each employee’s salary, currency and payment schedule.</p><button className={styles.link} onClick={() => switchTab('Salaries')}>Manage salaries →</button></div><div><small>02 · PREPARE</small><h3>Run monthly payroll</h3><p>Use attendance, approved leave and rewards to prepare salaries.</p><button className={styles.link} onClick={() => switchTab('Payroll runs')}>Go to payroll runs →</button></div><div><small>03 · REVIEW</small><h3>Approve and record payment</h3><p>Review salary breakdowns, then record payments after they are made.</p><button className={styles.link} onClick={() => switchTab('Salary slips')}>View salary slips →</button></div></div>}
      </>}
      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><h2>{tab === 'Overview' ? 'Payroll to review' : tab === 'Salaries' ? 'Employee salaries' : tab === 'Payroll runs' ? 'Payroll history' : 'Salary slips'}</h2><p>{tab === 'Salaries' ? 'Salary settings used to prepare each employee’s payroll.' : tab === 'Payroll runs' ? 'Track monthly runs and resolve any employee errors.' : 'Review attendance, earnings and rewards in each salary slip.'}</p></div><button className={styles.link} disabled={busy} onClick={load}>Refresh</button></div>
        <div className={styles.filters}><input aria-label="Search finance" placeholder={tab === 'Payroll runs' ? 'Search period or store…' : 'Search employee name or ID…'} value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Filter by store" value={storeFilter} onChange={event => setStoreFilter(event.target.value)}><option value="">All stores</option>{data.stores.map(store => <option key={store._id} value={store._id}>{store.name}</option>)}</select>{(tab === 'Overview' || tab === 'Salary slips') && <select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="draft">Needs review</option><option value="approved">Approved</option><option value="paid">Paid</option></select>}</div>
        {tab === 'Salaries' ? salaries.length ? <div className={styles.tableWrap}><table><thead><tr><th>Employee</th><th>Store</th><th>Base salary</th><th>Payment schedule</th><th /></tr></thead><tbody>{salaries.map(config => <tr key={config.salaryConfigId}><td><strong>{employeeName(config.employeeId)}</strong><small>{config.employeeId}</small></td><td>{storeName(config.storeId)}</td><td>{money(config.baseSalary, config.currency)}</td><td>{readable(config.payoutMode)}<small>Day {config.payoutDay} of each month</small></td><td><button className={styles.link} onClick={() => editSalary(config)}>Edit</button></td></tr>)}</tbody></table></div> : empty('No salaries found', search || storeFilter ? 'Try another search or store.' : 'Set up employee salaries before running payroll.')
        : tab === 'Payroll runs' ? runs.length ? <div className={styles.tableWrap}><table><thead><tr><th>Period</th><th>Store</th><th>Status</th><th>Results</th><th /></tr></thead><tbody>{runs.map(run => <tr key={run.salaryRunId}><td><strong>{period(run)}</strong><small>{run.salaryRunId}</small></td><td>{storeName(run.storeId)}</td><td>{badge(run.status)}</td><td>{run.createdPayrollCount} created<small>{run.skippedPayrollCount} existing · {run.failedPayrollCount} failed</small></td><td><button className={styles.link} disabled={busy} onClick={() => showRun(run)}>View details</button></td></tr>)}</tbody></table></div> : empty('No payroll runs found', 'Choose a month and store to prepare payroll from saved salaries.')
        : payroll.length ? <div className={styles.tableWrap}><table><thead><tr><th>Employee</th><th>Period</th><th>Net salary</th><th>Status</th><th>Actions</th></tr></thead><tbody>{payroll.map(row => <tr key={row._id}><td><strong>{employeeName(row.employeeId)}</strong><small>{row.employeeId} · {storeName(row.storeId)}</small></td><td>{period(row)}</td><td><strong>{money(row.netSalary, row.currency)}</strong></td><td>{badge(row.status)}</td><td><div className={styles.actions}><button className={styles.link} disabled={busy} onClick={() => showSlip(row)}>View slip</button>{tab === 'Overview' && row.status !== 'paid' && <button className={styles.secondary} disabled={busy} onClick={() => { setTarget(row); open('status'); }}>{row.status === 'draft' ? 'Approve' : 'Record payment'}</button>}</div></td></tr>)}</tbody></table></div> : empty('No payroll items found', search || storeFilter || statusFilter ? 'Try another search or filter.' : 'Start by setting up salaries, then prepare a payroll run.')}
      </section>
    </>}
    {modal && <Dialog title={modal === 'salary' ? editing ? 'Edit salary' : 'Set up salary' : modal === 'run' ? 'Run monthly payroll' : modal === 'slip' ? 'Salary slip' : modal === 'runDetail' ? 'Payroll run details' : target?.status === 'draft' ? 'Approve payroll' : 'Record payment'} onClose={close} busy={busy}>
      <form onSubmit={event => { event.preventDefault(); if (modal === 'salary') void saveSalary(); else if (modal === 'run') void generate(); else if (modal === 'status') void updateStatus(); }}>
        <div className={styles.dialogBody}>{error && <p className={styles.error} role="alert">{error}</p>}
          {modal === 'salary' && <fieldset disabled={busy} className={styles.fields}>
            <div className={styles.employeePicker}><label htmlFor="finance-employee">Employee</label><input id="finance-employee" role="combobox" aria-expanded={employeeOpen} aria-controls="finance-employees" aria-autocomplete="list" aria-activedescendant={employeeOpen && employeeActive >= 0 ? `finance-employee-${employeeActive}` : undefined} disabled={editing} autoComplete="off" placeholder="Search employee name or ID" value={employeeOpen ? employeeQuery : salary.employeeId ? `${employeeName(salary.employeeId)} · ${salary.employeeId}` : ''} onFocus={() => { setEmployeeOpen(true); setEmployeeActive(-1); }} onChange={event => { setEmployeeQuery(event.target.value); setEmployeeActive(-1); setSalary(current => ({ ...current, employeeId: '' })); }} onBlur={() => { setEmployeeOpen(false); setEmployeeQuery(''); }} onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setEmployeeOpen(true); setEmployeeActive(current => employeeOptions.length ? event.key === 'ArrowDown' ? Math.min(current + 1, employeeOptions.length - 1) : current < 0 ? employeeOptions.length - 1 : Math.max(0, current - 1) : -1); }
              else if (event.key === 'Enter' && employeeOpen) { event.preventDefault(); if (employeeOptions[employeeActive]) chooseEmployee(employeeOptions[employeeActive]); }
              else if (event.key === 'Escape' && employeeOpen) { event.preventDefault(); event.stopPropagation(); setEmployeeOpen(false); }
            }} />{employeeOpen && <ul ref={employeeList} id="finance-employees" role="listbox" aria-label="Employees">{employeeOptions.map((employee, index) => <li key={employee.employeeId} id={`finance-employee-${index}`} role="option" aria-selected={salary.employeeId === employee.employeeId} data-active={index === employeeActive} onMouseDown={event => event.preventDefault()} onClick={() => chooseEmployee(employee)}>{employee.fullName}<small>{employee.employeeId} · {storeName(employee.storeId)}</small></li>)}{!employeeOptions.length && <li role="presentation">No employees found</li>}</ul>}</div>
            <p className={styles.hint}>Store: {salary.employeeId ? storeName(salary.storeId) : 'Choose an employee'}</p>
            <div className={styles.columns}><label>Base salary<input required type="number" min="0.01" step="0.01" value={salary.baseSalary} onChange={event => setSalary({ ...salary, baseSalary: event.target.value })} /></label><label>Currency<select value={salary.currency} onChange={event => setSalary({ ...salary, currency: event.target.value })}>{Array.from(new Set([...currencies, salary.currency])).map(currency => <option key={currency} value={currency}>{currency === 'INR' ? '₹ Indian rupee (INR)' : currency}</option>)}</select></label></div>
            <div className={styles.columns}><label>Payment day<input required type="number" min="1" max="31" step="1" value={salary.payoutDay} onChange={event => setSalary({ ...salary, payoutDay: event.target.value })} /></label><label>Payment method<select value={salary.payoutMode} onChange={event => setSalary({ ...salary, payoutMode: event.target.value })}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option></select></label></div>
            <label>Notes (optional)<textarea rows={2} value={salary.notes} onChange={event => setSalary({ ...salary, notes: event.target.value })} /></label>
          </fieldset>}
          {modal === 'run' && <fieldset disabled={busy} className={styles.fields}><p className={styles.hint}>Prepare draft salaries using saved salary settings, attendance, approved leave and eligible rewards. Review them before approval.</p><label>Payroll month<input required type="month" value={month} onChange={event => setMonth(event.target.value)} /></label><label>Store<select value={runStore} onChange={event => setRunStore(event.target.value)}><option value="">All stores</option>{data.stores.filter(store => store.isActive !== false && !store.isDeleted).map(store => <option key={store._id} value={store._id}>{store.name}</option>)}</select></label><div className={styles.notice}><strong>{ready.length - missing.length} employees have salary settings</strong><p>Existing payroll for the same employee and period will be skipped.</p></div>{!!missing.length && <p className={styles.error}>{missing.length} employees need salary settings. Their payroll will report an error until a salary is configured.</p>}</fieldset>}
          {modal === 'slip' && slip && <><div className={styles.slipHero}><small>{slip.slipId}</small><h2>{employeeName(slip.employeeId)}</h2><p>{date(slip.period.start)} – {date(slip.period.end)}</p>{badge(slip.status)}<strong>{money(slip.totals.netSalary, slip.payout.currency)}</strong><small>Net salary</small></div><dl className={styles.breakdown}>{[['Configured base salary', slip.earnings.baseSalary], ['Earned base salary', slip.earnings.earnedBaseSalary], ['Overtime pay', slip.earnings.overtime], ['Bonus (includes extra-day pay)', slip.earnings.bonus], ['Approved rewards', slip.earnings.incentiveAmount], ['Deductions', slip.deductions.totalDeductions]].map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{money(Number(amount), slip.payout.currency)}</dd></div>)}</dl><div className={styles.notice}>{slip.attendance.payableDays} payable days · {slip.attendance.absentDays} absent days<p>{readable(slip.payout.payoutMode)} · payment day {slip.payout.payoutDay}</p></div></>}
          {modal === 'runDetail' && runDetail && <><h3>{period(runDetail)}</h3><p>{storeName(runDetail.storeId)} · {readable(runDetail.status)}</p><div className={styles.notice}>{runDetail.createdPayrollCount} created · {runDetail.skippedPayrollCount} existing · {runDetail.failedPayrollCount} failed</div>{runDetail.runErrors?.length ? <ul className={styles.runErrors}>{runDetail.runErrors.map((entry, index) => <li key={index}><strong>{employeeName(entry.employeeId)}</strong><p>{entry.message}</p></li>)}</ul> : <p>No employee errors reported.</p>}</>}
          {modal === 'status' && target && <><h3>{employeeName(target.employeeId)}</h3><p>{period(target)}</p><strong className={styles.confirmAmount}>{money(target.netSalary, target.currency)}</strong><p className={styles.hint}>{target.status === 'draft' ? 'Approval refreshes eligible rewards and locks the salary earnings for payment.' : 'Record this only after the employee has been paid. This action records payment; it does not transfer money.'}</p></>}
        </div>
        <footer><button type="button" className={styles.secondary} disabled={busy} onClick={close}>{modal === 'slip' || modal === 'runDetail' ? 'Close' : 'Cancel'}</button>{(modal === 'salary' || modal === 'run' || modal === 'status') && <button className={styles.primary} type="submit" disabled={busy || (modal === 'salary' && !salary.employeeId) || (modal === 'run' && ready.length === missing.length)}>{busy ? 'Saving…' : modal === 'salary' ? 'Save salary' : modal === 'run' ? 'Prepare payroll' : target?.status === 'draft' ? 'Approve payroll' : 'Record payment'}</button>}</footer>
      </form>
    </Dialog>}
  </main>;
}
