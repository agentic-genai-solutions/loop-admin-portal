'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';
import type { IncentiveProgram } from './IncentivesWorkspace';
import styles from './incentives.module.css';

type Employee = { employeeId: string; firstName?: string; lastName?: string; storeId?: string; isActive?: boolean; isDeleted?: boolean; deletedAt?: string };
type Store = { _id: string; name: string; isActive?: boolean; isDeleted?: boolean };
const fullName = (user: Employee) => [user.firstName, user.lastName].filter(Boolean).join(' ') || user.employeeId;
const isServerId = (id?: string) => /^[a-f\d]{24}$/i.test(id || '');

function EmployeeSelect({ employees, value, onChange }: { employees: Employee[]; value: string; onChange: (id: string) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLUListElement>(null);
  const selected = employees.find(employee => employee.employeeId === value);
  const matches = employees.filter(employee => `${fullName(employee)} ${employee.employeeId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const label = (employee: Employee) => `${fullName(employee)} · ${employee.employeeId}`;
  const choose = (employee: Employee) => { onChange(employee.employeeId); setOpen(false); setQuery(''); setActive(-1); };
  useEffect(() => { if (open && active >= 0) list.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [active, open]);

  return <div className={styles.employeeSelect}>
    <label htmlFor={id}>Employee</label>
    <div className={styles.employeeSelectInput}>
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`}
        aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        autoComplete="off" placeholder="Search by name or employee ID" value={open ? query : selected ? label(selected) : ''}
        onFocus={() => { setOpen(true); setQuery(''); setActive(-1); }}
        onClick={() => setOpen(true)}
        onBlur={() => { setOpen(false); setQuery(''); setActive(-1); }}
        onChange={event => { setQuery(event.target.value); onChange(''); setOpen(true); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(current => matches.length ? event.key === 'ArrowDown' ? Math.min(current + 1, matches.length - 1) : current < 0 ? matches.length - 1 : Math.max(current - 1, 0) : -1);
          } else if (event.key === 'Enter' && open) {
            event.preventDefault(); if (active >= 0 && matches[active]) choose(matches[active]);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(''); setActive(-1);
          }
        }} />
      <span aria-hidden="true">⌄</span>
    </div>
    {open && <ul id={`${id}-options`} role="listbox" aria-label="Employees" className={styles.employeeOptions} ref={list}>
      {matches.map((employee, index) => <li key={employee.employeeId} id={`${id}-option-${index}`} role="option"
        aria-selected={employee.employeeId === value} data-active={index === active}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(employee)}>
        <strong>{fullName(employee)}</strong><small>{employee.employeeId}</small>
      </li>)}
      {!matches.length && <li role="presentation" className={styles.employeeEmpty}>No eligible employees found.</li>}
    </ul>}
  </div>;
}

export default function AwardRewardModal({ programs, onClose, onAwarded, onProgramSaved }: { programs: IncentiveProgram[]; onClose: () => void; onAwarded: (notificationError: boolean) => void; onProgramSaved: (oldId?: string) => void }) {
  const [chosenProgram, setChosenProgram] = useState<IncentiveProgram | null>(null);
  const program = chosenProgram || { name: '', type: '', payout: '', status: '' } as IncentiveProgram;
  const activePrograms = programs.filter(item => item.status === 'Active');
  const dialog = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [storeId, setStoreId] = useState('');
  const amount = program.amount ?? Number(program.payout.replace(/[^0-9.]/g, ''));
  const rewardLabel = new Intl.NumberFormat('en-IN', { style: 'currency', currency: program.currency || 'INR' }).format(amount || 0);
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [savedId, setSavedId] = useState(isServerId(program.id) ? program.id : undefined);
  const [notificationScope, setNotificationScope] = useState(program.notificationScope || 'employee');

  const load = async () => {
    setLoading(true); setLoadFailed(false); setError('');
    try {
      const [employees, shops] = await Promise.all([apiFetchWithRetry<Employee[]>('/users'), apiFetchWithRetry<Store[]>('/stores')]);
      setUsers(employees.filter(user => user.employeeId && user.isActive !== false && !user.isDeleted && !user.deletedAt).sort((a, b) => fullName(a).localeCompare(fullName(b))));
      setStores(shops.filter(store => store.isActive !== false && !store.isDeleted));
    } catch { setLoadFailed(true); setError('We couldn’t load employees and stores. Please try again.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal(); document.body.style.overflow = 'hidden'; void load();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  const scope = program.scope || (program.type === 'Store-wide' ? 'store' : program.type === 'Employee-specific' ? 'employee' : 'organization');
  const eligibleStoreIds = program.storeIds || stores.filter(store => program.stores?.includes(store.name)).map(store => store._id);
  const eligibleEmployeeIds = program.employeeIds || users.filter(user => program.employees?.includes(fullName(user))).map(user => user.employeeId);
  const eligible = users.filter(user => chosenProgram && (scope === 'organization' || (scope === 'store' ? eligibleStoreIds.includes(user.storeId || '') : eligibleEmployeeIds.includes(user.employeeId))));
  const visible = eligible.filter(user => !storeId || user.storeId === storeId);
  const selected = eligible.find(user => user.employeeId === employeeId);
  const audience = notificationScope === 'organization' ? 'Everyone in the organization' : notificationScope === 'store' ? `Everyone at ${stores.find(store => store._id === selected?.storeId)?.name || 'the employee’s store'}` : 'Only the employee';

  async function award(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current || loading || loadFailed) return;
    if (!chosenProgram) { setError('Choose a reward program.'); return; }
    if (!selected) { setError('Choose an eligible employee.'); return; }
    if (notificationScope === 'store' && !selected.storeId) { setError('This employee needs a store before a store announcement can be sent.'); return; }
    if (!(Number(amount) > 0) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) { setError('Enter a valid reward amount and month.'); return; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      let id = savedId;
      if (!id) {
        const saved = await apiFetch<{ id: string }>('/incentives/programs', { method: 'POST', body: JSON.stringify({
          name: program.name, scope, amount: program.amount || Number(amount), currency: program.currency || 'INR', frequency: program.frequency || 'Monthly',
          guideline: program.guideline || '', targetMetric: program.targetMetric || '', targetValue: program.targetValue || '', notificationScope,
          storeIds: scope === 'store' ? eligibleStoreIds : [], employeeIds: scope === 'employee' ? eligibleEmployeeIds : [],
        }) });
        id = saved.id; setSavedId(id); onProgramSaved(program.id);
      }
      const result = await apiFetch<{ notificationError?: boolean }>('/incentives/awards', { method: 'POST', body: JSON.stringify({ programId: id, employeeId, amount: Number(amount), period }) });
      onAwarded(Boolean(result.notificationError));
    } catch (failure) {
      let message = 'The reward could not be completed. Check Rewards before trying again.';
      if (failure instanceof Error) {
        try { const response = JSON.parse(failure.message); if (response.message) message = Array.isArray(response.message) ? response.message.join('. ') : response.message; } catch { /* Keep actionable fallback. */ }
      }
      setError(message);
    } finally { setBusy(false); busyRef.current = false; }
  }

  return <dialog ref={dialog} className={styles.awardDialog} aria-labelledby="award-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <header className={styles.awardHeader}><div><span className={styles.awardEyebrow}>RECOGNIZE YOUR TEAM</span><h2 id="award-title">Award an employee</h2></div><button className={styles.secondary} type="button" disabled={busy} onClick={onClose} aria-label="Close award form">×</button></header>
    <form onSubmit={award} className={styles.awardForm}>
      <div className={styles.awardScroll}>
        {error && <p role="alert" className={styles.awardError}>{error} {loadFailed && <button type="button" onClick={load}>Try again</button>}</p>}
        <fieldset disabled={loading || busy || loadFailed} className={styles.awardFields}>
          <label>Reward program<select required autoFocus value={chosenProgram?.id || ''} onChange={event => {
            const next = activePrograms.find(item => item.id === event.target.value) || null;
            setChosenProgram(next); setEmployeeId(''); setStoreId(''); setError('');
            setSavedId(isServerId(next?.id) ? next?.id : undefined);
            setNotificationScope(next?.notificationScope || 'employee');
          }}><option value="">Choose a program</option>{activePrograms.map(item => <option key={item.id} value={item.id}>{item.name} · {item.payout}</option>)}</select></label>
          {!activePrograms.length && <p className={styles.hint}>No active programs available. <Link href="/incentives/programs">Go to Programs</Link> to create one.</p>}
          {chosenProgram && <>
            <div className={styles.awardBanner}><span aria-hidden="true">🏆</span><div><strong>{program.name}</strong><p>{program.payout} · {program.frequency || 'Monthly'}</p></div></div>
        <label>Store<select value={storeId} onChange={event => { setStoreId(event.target.value); setEmployeeId(''); }}><option value="">All eligible stores</option>{stores.filter(store => eligible.some(user => user.storeId === store._id)).map(store => <option key={store._id} value={store._id}>{store.name}</option>)}</select></label>
        <EmployeeSelect key={`${program.id}-${storeId}`} employees={visible} value={employeeId} onChange={setEmployeeId} />
        <div className={styles.awardColumns}><div className={styles.fixedReward}><small>Fixed reward</small><strong>{rewardLabel}</strong></div><label>Reward month<input type="month" required value={period} onChange={event => setPeriod(event.target.value)} /></label></div>
        {!savedId && <label>Who hears about this reward?<select value={notificationScope} onChange={event => setNotificationScope(event.target.value)}><option value="employee">Employee only</option><option value="store">Employee’s store</option><option value="organization">Everyone in the organization</option></select><small>Your browser-saved program will be saved online with this setting.</small></label>}
        <div className={styles.awardSummary}><strong>{selected ? `${fullName(selected)} receives ${rewardLabel}` : 'Choose an employee above'}</strong><p>Notification: {audience}.</p><small>This records an approved reward. It does not make a payment.</small></div>
          </>}
        </fieldset>
      </div>
      <footer className={styles.awardFooter}>
        <span>{chosenProgram ? 'The employee will be notified in the app.' : 'Choose a program to get started.'}</span>
        <div><button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className={styles.primary} disabled={!chosenProgram || !selected || busy || loading || loadFailed}>{busy ? 'Awarding…' : 'Award & notify'}</button></div>
      </footer>
    </form>
  </dialog>;
}
