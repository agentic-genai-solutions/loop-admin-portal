'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiFetchWithRetry } from '@/lib/api';
import { fetchStores } from '@/lib/admin-data';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import styles from './incentives.module.css';

type Reward = { id: string; employee: string; employeeId: string; program: string; amount: number; currency: string; period: string; status: string; storeId: string };

export default function ShopRewards() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [shop, setShop] = useState('all');
  const [status, setStatus] = useState('Approved');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState('');
  const [sent, setSent] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [stores, rows] = await Promise.all([
        fetchStores(),
        (async () => {
          const result: Reward[] = [];
          for (let offset = 0; ; offset += 100) {
            const page = await apiFetchWithRetry<Reward[]>(`/incentives/entries?limit=100&offset=${offset}`);
            if (!Array.isArray(page)) throw new Error('Invalid rewards response');
            result.push(...page);
            if (page.length < 100) return result;
          }
        })(),
      ]);
      setShops(stores.map((store) => ({ id: String(store.id), name: String(store.name) })));
      setRewards(rows);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const grouped = new Map<string, Reward[]>();
    for (const reward of rewards) {
      if (reward.status !== status || (shop !== 'all' && reward.storeId !== shop)) continue;
      if (![reward.employee, reward.employeeId, reward.program].join(' ').toLowerCase().includes(search.toLowerCase())) continue;
      const key = reward.storeId || '';
      grouped.set(key, [...(grouped.get(key) || []), reward]);
    }
    return Array.from(grouped, ([id, rows]) => ({ id, name: shops.find((item) => item.id === id)?.name || id || 'Unassigned shop', rows }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rewards, shops, shop, status, search]);

  const act = async (reward: Reward, action: 'approve' | 'notify') => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(reward.id);
    setNotice('');
    try {
      if (action === 'approve') {
        const result = await apiFetch<Reward & { notificationError?: boolean }>(`/incentives/entries/${encodeURIComponent(reward.id)}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'Approved' }) });
        setRewards((current) => current.map((item) => item.id === reward.id ? { ...item, ...result } : item));
        setStatus('Approved');
        if (result.notificationError) setNotice('Reward approved, but notifications could not be completed. Use Announce reward to retry.');
        else { setSent((current) => [...current, reward.id]); setNotice('Reward approved. Announcement and personal congratulations sent to the mobile app.'); }
      } else {
        await apiFetch(`/incentives/entries/${encodeURIComponent(reward.id)}/notifications`, { method: 'POST' });
        setSent((current) => [...current, reward.id]);
        setNotice('Notifications sent to the audience configured for this reward.');
      }
    } catch { setNotice('Could not complete the action. Refresh to check the reward status before retrying.'); }
    finally { setBusy(null); busyRef.current = false; }
  };

  return <section className={styles.panel}>
    <div className={styles.filters}>
      <select aria-label="Filter rewards by shop" value={shop} onChange={(event) => setShop(event.target.value)}><option value="all">All shops</option>{shops.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{Array.from(new Set(rewards.map((item) => item.storeId || ''))).filter((id) => !shops.some((item) => item.id === id)).map((id) => <option key={id} value={id}>{id || 'Unassigned shop'}</option>)}</select>
      <select aria-label="Filter rewards by status" value={status} onChange={(event) => setStatus(event.target.value)}><option>Approved</option><option>Pending</option><option>Rejected</option></select>
      <input aria-label="Search employee rewards" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee or program…" />
      <button className={styles.secondary} disabled={loading || busy !== null} onClick={load}>{loading ? 'Refreshing…' : 'Refresh'}</button>
    </div>
    <div className={styles.resultsBar}><span role="status">{loading ? 'Loading rewards…' : error ? 'Rewards unavailable' : `${groups.reduce((count, group) => count + group.rows.length, 0)} ${status.toLowerCase()} rewards · ${groups.length} shops`}</span>{(search || shop !== 'all' || status !== 'Approved') && <button className={styles.textButton} onClick={() => { setSearch(''); setShop('all'); setStatus('Approved'); }}>Reset filters</button>}
      {status !== 'Rejected' && <details className={styles.inlineHelp}><summary>Notification details</summary><p>{status === 'Pending' ? 'Approving a reward' : 'Announcing a reward'} uses the program’s notification audience and sends personal congratulations to the recipient.</p></details>}
    </div>
    {notice && <p role="status" className={styles.rewardNotice}>{notice}</p>}
    {loading ? <TableSkeleton columns={5} rows={3} /> : error ? <EmptyState variant="error" onRetry={load} /> : !groups.length ? <div className={styles.empty}><span className={styles.emptyIcon}>🏆</span><h3>No {status.toLowerCase()} rewards found</h3><p>{search || shop !== 'all' ? 'Try another shop or clear your search.' : status === 'Pending' ? 'You’re all caught up.' : 'Rewards will appear here when their status changes.'}</p></div> : groups.map((group) => {
      const totals = group.rows.reduce<Record<string, number>>((sum, reward) => ({ ...sum, [reward.currency]: (sum[reward.currency] || 0) + Number(reward.amount) }), {});
      return <section key={group.id} className={styles.rewardGroup}>
        <div className={styles.panelHeader}><div><h3>{group.name}</h3><p>{group.rows.length} rewards · {new Set(group.rows.map((reward) => reward.employeeId)).size} employees</p></div><strong>{Object.entries(totals).map(([currency, amount]) => `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join(' · ')}</strong></div>
        <div className={styles.tableWrap}><table className="table"><thead><tr><th>Employee</th><th>Program</th><th>Reward</th><th>Period</th><th>{status === 'Pending' ? 'Approval' : 'Notification'}</th></tr></thead><tbody>{group.rows.map((reward) => <tr key={reward.id}><td><strong>{reward.employee}</strong><small className={styles.cellSub}>{reward.employeeId}</small></td><td>{reward.program}</td><td>{reward.currency} {Number(reward.amount).toFixed(2)}</td><td>{reward.period}</td><td>{status === 'Rejected' ? 'Not announced' : <button className={styles.secondary} disabled={busy !== null || sent.includes(reward.id)} onClick={() => act(reward, status === 'Pending' ? 'approve' : 'notify')}>{busy === reward.id ? 'Sending…' : sent.includes(reward.id) ? 'Announced ✓' : status === 'Pending' ? 'Approve & announce' : 'Announce reward'}</button>}</td></tr>)}</tbody></table></div>
      </section>;
    })}
  </section>;
}
