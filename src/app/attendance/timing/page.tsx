'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';
import { fetchStores } from '@/lib/admin-data';

type Policy = { scope: 'enterprise' | 'store' | 'employee'; targetId: string; enabled: boolean; mode: 'schedule' | 'fixed'; timeZone: string; startTime: string; endTime: string; clockInBefore: number; clockInAfter: number; clockOutBefore: number; clockOutAfter: number; startBuffer: number; endBuffer: number };
const defaults: Policy = { scope: 'enterprise', targetId: 'all', enabled: false, mode: 'schedule', timeZone: 'Asia/Kolkata', startTime: '09:00', endTime: '18:00', clockInBefore: 60, clockInAfter: 30, clockOutBefore: 30, clockOutAfter: 120, startBuffer: 15, endBuffer: 15 };
const fields = [ ['clockInBefore', 'Earliest clock-in', 'Minutes before shift start', 720], ['clockInAfter', 'Latest clock-in', 'Minutes after shift start', 720], ['startBuffer', 'Start buffer', 'Extra minutes after the clock-in cutoff', 180], ['clockOutBefore', 'Earliest clock-out', 'Minutes before shift end', 720], ['clockOutAfter', 'Latest clock-out', 'Minutes after shift end', 720], ['endBuffer', 'End buffer', 'Extra minutes after the clock-out cutoff', 180] ] as const;

export default function AttendanceTimingPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [stores, setStores] = useState<{id: string; name: string}[]>([]);
  const [employees, setEmployees] = useState<{id: string; name: string; storeId: string}[]>([]);
  const [form, setForm] = useState<Policy>(defaults);
  const [storeFilter, setStoreFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setLoadFailed(false); setError('');
    try {
      const [rules, shopRows, people] = await Promise.all([
        apiFetchWithRetry<Policy[]>('/admin/attendance-timing'), fetchStores(),
        apiFetchWithRetry<Array<{employeeId?: string; firstName?: string; lastName?: string; storeId?: string}>>('/users'),
      ]);
      const query = new URLSearchParams(window.location.search);
      const scope = (query.get('scope') || 'enterprise') as Policy['scope'];
      const targetId = query.get('targetId') || (scope === 'enterprise' ? 'all' : '');
      if (['enterprise', 'store', 'employee'].includes(scope) && targetId) {
        setForm(rules.find(rule => rule.scope === scope && rule.targetId === targetId) || { ...defaults, scope, targetId });
      }
      setPolicies(rules); setStores(shopRows.map(shop => ({ id: String(shop.id), name: String(shop.name) })));
      setEmployees(people.filter(person => person.employeeId).map(person => ({ id: person.employeeId!, name: [person.firstName, person.lastName].filter(Boolean).join(' ') || person.employeeId!, storeId: String(person.storeId || '') })));
    } catch { setLoadFailed(true); setError('Unable to load attendance timing policies. Check your access and try again.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const selectTarget = (scope: Policy['scope'], targetId: string) => {
    setForm(policies.find(policy => policy.scope === scope && policy.targetId === targetId) || { ...defaults, scope, targetId });
    setNotice('');
  };
  const save = async () => {
    if (saving) return;
    if (!form.targetId) { setError('Select a target before saving.'); return; }
    if (form.clockInBefore + form.clockInAfter + form.startBuffer >= 1440 || form.clockOutBefore + form.clockOutAfter + form.endBuffer >= 1440) { setError('Each allowed window must be shorter than 24 hours.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const saved = await apiFetch<Policy>('/admin/attendance-timing', { method: 'PUT', body: JSON.stringify(Object.fromEntries(Object.keys(defaults).map(key => [key, form[key as keyof Policy]]))) });
      setPolicies(current => [...current.filter(policy => !(policy.scope === saved.scope && policy.targetId === saved.targetId)), saved]);
      setNotice(saved.enabled ? 'Timing limits saved and active.' : 'Rule saved as inactive. The next applicable rule is used.');
    } catch (value) { setError(value instanceof Error ? value.message : 'Unable to save timing policy.'); }
    finally { setSaving(false); }
  };
  const name = (policy: Policy) => policy.scope === 'enterprise' ? 'Entire enterprise' : policy.scope === 'store' ? stores.find(store => store.id === policy.targetId)?.name || policy.targetId : employees.find(person => person.id === policy.targetId)?.name || policy.targetId;
  return <main className="portal-page">
    <div className="finance-toolbar"><nav className="finance-tabs" aria-label="Attendance pages"><Link href="/attendance" style={{padding: '14px 2px'}}>Attendance</Link><Link href="/attendance/timing" aria-current="page" style={{padding: '14px 2px', color: '#137b72', borderBottom: '2px solid #137b72'}}>Timing rules</Link></nav><button className="btn btn-secondary" disabled={loading || saving} onClick={load}>Refresh</button></div>
    {error && <p role="alert" className="dashboard-error-banner">{error}</p>}
    {notice && <p role="status" className="timing-notice">{notice}</p>}
    <form className="card" onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={loading || saving || loadFailed} className="timing-fieldset">
        <div className="timing-form-grid">
          <label>Applies to<select value={form.scope} onChange={event => { setStoreFilter(''); selectTarget(event.target.value as Policy['scope'], event.target.value === 'enterprise' ? 'all' : ''); }}><option value="enterprise">Enterprise-wide</option><option value="store">Store</option><option value="employee">Employee</option></select></label>
          {form.scope === 'employee' && <label>Filter employees by store<select value={storeFilter} onChange={event => { setStoreFilter(event.target.value); selectTarget('employee', ''); }}><option value="">All stores</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}
          {form.scope !== 'enterprise' && <label>{form.scope === 'store' ? 'Store' : 'Employee'}<select required value={form.targetId} onChange={event => selectTarget(form.scope, event.target.value)}><option value="">Select {form.scope}</option>{(form.scope === 'store' ? stores : employees.filter(person => !storeFilter || person.storeId === storeFilter)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label>Timing basis<select value={form.mode} onChange={event => setForm({...form, mode: event.target.value as Policy['mode']})}><option value="schedule">Assigned shift</option><option value="fixed">Fixed daily times</option></select></label>
          <label>Timezone<input required value={form.timeZone} placeholder="Asia/Kolkata" onChange={event => setForm({...form, timeZone: event.target.value})} /></label>
          {form.mode === 'fixed' && <><label>Start time<input required type="time" value={form.startTime} onChange={event => setForm({...form, startTime: event.target.value})} /></label><label>End time<input required type="time" value={form.endTime} onChange={event => setForm({...form, endTime: event.target.value})} /></label></>}
        </div>
        <p className="timing-hint">Employee → store → enterprise. The first active rule applies. Without an active rule, attendance remains unrestricted by these timing limits.</p>
        <div className="timing-form-grid">{fields.map(([key,label,hint,max]) => <label key={key}>{label}<input type="number" required min={0} max={max} step={1} value={form[key]} onChange={event => setForm({...form, [key]: event.target.value === '' ? '' : Number(event.target.value)})} /><small>{hint}</small></label>)}</div>
        <div className="timing-preview"><span><strong>Clock-in:</strong> start − {form.clockInBefore || 0} min → start + {Number(form.clockInAfter) + Number(form.startBuffer)} min</span><span><strong>Clock-out:</strong> end − {form.clockOutBefore || 0} min → end + {Number(form.clockOutAfter) + Number(form.endBuffer)} min</span></div>
        <p className="timing-hint">After the clock-in window closes, the mobile app replaces the clock-in button with an elapsed-time message and an Apply for leave link. The calendar shows absence until leave is applied; pending leave is shown separately. Salary credit requires approval.</p>
        <p className="timing-hint">Actions outside these windows are blocked using server time. The start buffer also allows arrival without a late mark. Overnight shifts end the next day. Assigned-shift rules require an active schedule.</p>
        <div className="timing-actions"><label><input type="checkbox" checked={form.enabled} onChange={event => setForm({...form, enabled: event.target.checked})} /> Enable this rule</label><button className="btn btn-primary" type="submit">{saving ? 'Saving…' : 'Save rule'}</button></div>
      </fieldset>
    </form>
    <section className="card"><h2 style={{fontSize: 18, marginTop: 0}}>Configured rules <span className="badge info">{policies.length}</span></h2>{loading ? <p role="status">Loading…</p> : !policies.length ? <p className="timing-hint">No timing rules configured yet.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Target</th><th>Scope</th><th>Basis</th><th>Timezone</th><th>Status</th><th /></tr></thead><tbody>{policies.map(policy => <tr key={`${policy.scope}-${policy.targetId}`}><td>{name(policy)}</td><td>{policy.scope}</td><td>{policy.mode === 'schedule' ? 'Assigned shift' : `${policy.startTime}–${policy.endTime}`}</td><td>{policy.timeZone}</td><td><span className={`badge ${policy.enabled ? 'success' : 'info'}`}>{policy.enabled ? 'Active' : 'Inactive'}</span></td><td><button type="button" className="btn btn-secondary" disabled={saving} onClick={() => { setForm(policy); setStoreFilter(''); window.scrollTo({top: 0, behavior: 'smooth'}); }}>Edit</button></td></tr>)}</tbody></table></div>}</section>
  </main>;
}
