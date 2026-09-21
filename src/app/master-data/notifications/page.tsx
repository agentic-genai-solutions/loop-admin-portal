'use client';
import { useCallback, useEffect, useState } from 'react';
import MasterDataWorkspace from '@/components/master-data/MasterDataWorkspace';
import admin from '@/components/admin/admin.module.css';
import { apiFetch } from '@/lib/api';

type Rule = { event: string; scope: string; targetId: string; enabled: boolean; audience: string; minutesBefore: number; timeZone: string };
type Settings = { events: Record<string,string>; rules: Rule[]; workerEnabled: boolean; registeredDevices: number; failedDeliveries: number };
export default function NotificationSettings() {
  const [data,setData] = useState<Settings | null>(null);
  const [stores,setStores] = useState<Array<{_id:string;name:string}>>([]);
  const [users,setUsers] = useState<Array<{employeeId:string;firstName:string;lastName:string;storeId?:string}>>([]);
  const [scope,setScope] = useState('organization'); const [targetId,setTargetId] = useState('all');
  const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [saved,setSaved] = useState('');
  const [drafts,setDrafts] = useState<Record<string,Rule>>({});
  const load = useCallback(async () => {
    setError('');
    try {
      const [settings,storeRows,userRows] = await Promise.all([apiFetch<Settings>('/admin/push'),apiFetch<any[]>('/stores'),apiFetch<any[]>('/users')]);
      setData(settings);setStores(storeRows);setUsers(userRows.filter(user=>user.employeeId));
    } catch {setError('Unable to load notification settings. This page requires a super administrator account.');}
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{setDrafts({});setSaved('');},[scope,targetId]);
  function ruleFor(event:string):Rule {
    return drafts[event] ?? data?.rules.find(rule=>rule.event===event && rule.scope===scope && rule.targetId===targetId)
      ?? {...((scope==='employee' ? data?.rules.find(rule=>rule.event===event && rule.scope==='store' && rule.targetId===users.find(user=>user.employeeId===targetId)?.storeId) : undefined) ?? data?.rules.find(rule=>rule.event===event && rule.scope==='organization') ?? {enabled:true,audience:'original',minutesBefore:15,timeZone:'Asia/Kolkata'}),event,scope,targetId};
  }
  async function save(event:string,remove=false) {
    if(!targetId)return;setBusy(true);setError('');setSaved('');
    try {await apiFetch('/admin/push',{method:remove?'DELETE':'PUT',body:JSON.stringify(ruleFor(event))});const settings=await apiFetch<Settings>('/admin/push');setData(settings);setDrafts(current=>{const next={...current};delete next[event];return next;});setSaved(remove?'Override removed. The inherited setting now applies.':'Notification setting saved.');}
    catch {setError('Could not save the setting. Please try again.');}finally{setBusy(false);}
  }
  return <MasterDataWorkspace actions={<button className={admin.secondary} disabled={busy} onClick={()=>void load()}>Refresh</button>}>
    <section className={admin.panel}><div className={admin.panelHeader}><div><h2>Push notifications</h2><p>Choose which updates appear on employees’ phones, even when Loop is closed.</p></div></div>
      <p className={admin.notice}>Punch-in reminders are sent 15 minutes before the shift by default. Employee settings override store settings, which override organization defaults. Reminders skip days off, approved leave and completed punch-ins.</p>
      {data && <p className={admin.hint}>{data.registeredDevices} registered devices · Delivery service {data.workerEnabled?'enabled':'paused'} · {data.failedDeliveries} recent failed deliveries</p>}
    </section>
    {error && <p className={admin.error} role="alert">{error}</p>}{saved && <p className={admin.notice} role="status">{saved}</p>}
    {!data ? <p className={admin.empty}>{error?'Use Refresh to try again.':'Loading notification settings…'}</p> : <>
      <section className={admin.panel}><div className={admin.filters}>
        <label>Apply settings to<select value={scope} disabled={busy} onChange={event=>{setScope(event.target.value);setTargetId(event.target.value==='organization'?'all':'');}}><option value="organization">Entire organization</option><option value="store">A store</option><option value="employee">An employee</option></select></label>
        {scope==='store' && <label>Store<select value={targetId} disabled={busy} onChange={event=>setTargetId(event.target.value)}><option value="">Choose a store</option>{stores.map(store=><option key={store._id} value={store._id}>{store.name}</option>)}</select></label>}
        {scope==='employee' && <label>Employee<select value={targetId} disabled={busy} onChange={event=>setTargetId(event.target.value)}><option value="">Choose an employee</option>{users.map(user=><option key={user.employeeId} value={user.employeeId}>{user.firstName} {user.lastName} · {user.employeeId}</option>)}</select></label>}
      </div><p className={admin.hint}>Changes affect future push delivery. Existing in-app messages remain available. Users must allow notifications on their phone.</p></section>
      {targetId && Object.entries(data.events).map(([event,label])=>{
        const rule=ruleFor(event);const own=data.rules.some(row=>row.event===event&&row.scope===scope&&row.targetId===targetId);
        const update=(value:Partial<Rule>)=>setDrafts(current=>({...current,[event]:{...rule,...value}}));
        return <section className={admin.panel} key={event}><div className={admin.panelHeader}><div><h2>{label}</h2><p>{scope==='organization'?'Organization default':own?'Custom setting':'Inherited setting — save to override'}</p></div><label><input type="checkbox" checked={rule.enabled} disabled={busy} onChange={e=>update({enabled:e.target.checked})}/> Send push notifications</label></div>
          <div className={admin.filters}>{event==='punch_reminder' && <label>Minutes before shift<input type="number" min={1} max={120} value={rule.minutesBefore} disabled={busy} onChange={e=>update({minutesBefore:Number(e.target.value)})}/></label>}
          {event==='punch_reminder' && <label>Fallback time zone<input value={rule.timeZone || 'Asia/Kolkata'} disabled={busy} onChange={e=>update({timeZone:e.target.value})} placeholder="Asia/Kolkata" /></label>}
          {['message','reward'].includes(event)?<label>Send for these recipient levels<select value={rule.audience} disabled={busy} onChange={e=>update({audience:e.target.value})}><option value="original">All configured audiences</option><option value="employee">Employee messages only</option><option value="store">Store announcements only</option><option value="organization">Organization announcements only</option></select></label>:<p className={admin.hint}>Recipient: the employee only.</p>}</div>
          {['message','reward'].includes(event)&&<p className={admin.hint}>Uses the recipients selected when the message or reward was created. This setting filters push alerts; it does not add new recipients.</p>}
          {event==='punch_reminder' && <p className={admin.hint}>Uses the attendance rule’s time zone when configured; otherwise uses the fallback time zone.</p>}
          <div className={admin.actions} style={{marginTop:16}}><button className={admin.primary} disabled={busy||!Number.isInteger(rule.minutesBefore)||rule.minutesBefore<1||rule.minutesBefore>120} onClick={()=>void save(event)}>Save setting</button>{own&&scope!=='organization'&&<button className={admin.secondary} disabled={busy} onClick={()=>void save(event,true)}>Use inherited setting</button>}</div>
        </section>;
      })}
    </>}
  </MasterDataWorkspace>;
}
