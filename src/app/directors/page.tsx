'use client';

import AdminWorkspace from '@/components/admin/AdminWorkspace';
import adminStyles from '@/components/admin/admin.module.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { fetchDirectors } from '@/lib/admin-data';
import { isDirectorRole, isSuperAdminRole } from '@/lib/utils';

type Director = { id: string | number; name: string; email: string; region: string; status: string; stores: number };

const initialDirectors: Director[] = [];

export default function DirectorsPage() {
  const [directors, setDirectors] = useState(initialDirectors);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'region' | 'stores' | 'status'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const visibleDirectors = useMemo(() => {
    const filtered = directors.filter((director) => {
      const matchesQuery =
        query.trim().length === 0 ||
        director.name.toLowerCase().includes(query.toLowerCase()) ||
        director.email.toLowerCase().includes(query.toLowerCase()) ||
        director.region.toLowerCase().includes(query.toLowerCase());

      const matchesStatus = statusFilter === 'All' || director.status === statusFilter;
      return matchesQuery && matchesStatus;
    });

    return [...filtered].sort((first, second) => {
      const comparison = sortBy === 'stores'
        ? first.stores - second.stores
        : String(first[sortBy]).localeCompare(String(second[sortBy]), undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [directors, query, statusFilter, sortBy, sortDirection]);

  const summaryStats = useMemo(() => {
    const active = directors.filter((director) => director.status === 'Active').length;
    const pending = directors.filter((director) => director.status === 'Pending').length;
    const inactive = directors.filter((director) => director.status === 'Inactive').length;

    return {
      total: directors.length,
      active,
      pending,
      inactive,
    };
  }, [directors]);

  const handleSort = (column: 'name' | 'email' | 'region' | 'stores' | 'status') => {
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection('asc');
  };

  const getSortArrow = (column: 'name' | 'email' | 'region' | 'stores' | 'status') => {
    if (sortBy !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const loadDirectors = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const mappedDirectors = await fetchDirectors();
      setDirectors(mappedDirectors);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedUser = window.sessionStorage.getItem('loop_admin_user');
    if (!storedUser) {
      window.location.href = '/login';
      return;
    }

    try {
      const parsed = JSON.parse(storedUser);
      const canAccessDirectors = isSuperAdminRole(parsed?.role) || isDirectorRole(parsed?.role);
      if (!canAccessDirectors) {
        window.location.href = '/';
        return;
      }
    } catch {
      window.location.href = '/login';
      return;
    }

    loadDirectors();
  }, [loadDirectors]);

  return <AdminWorkspace actions={<button className={adminStyles.secondary} disabled={isLoading} onClick={loadDirectors}>Refresh</button>}>
    <section className={adminStyles.panel}>
      <div className={adminStyles.panelHeader}><div><h2>Director directory</h2><p>View director contact details and assigned stores.</p></div></div>
      <div className={adminStyles.filters}><input aria-label="Search directors" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, email or store…" /><select aria-label="Director status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="All">All statuses</option><option>Active</option><option>Inactive</option></select></div>
      {isLoading ? <TableSkeleton columns={4} rows={4} /> : hasError ? <EmptyState variant="error" onRetry={loadDirectors} /> : <><p className={adminStyles.count}>{visibleDirectors.length} directors · {summaryStats.active} active</p><div className={adminStyles.tableWrap}><table className={adminStyles.table}><thead><tr>{([['name', 'Director'], ['email', 'Email'], ['region', 'Assigned store'], ['status', 'Status']] as const).map(([key, label]) => <th key={key} aria-sort={sortBy === key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button className={adminStyles.link} onClick={() => handleSort(key)}>{label} {getSortArrow(key)}</button></th>)}</tr></thead><tbody>{visibleDirectors.map(director => <tr key={director.id}><td><strong>{director.name}</strong></td><td>{director.email || '—'}</td><td>{director.region}</td><td><span className={adminStyles.badge} data-status={director.status}>{director.status}</span></td></tr>)}{!visibleDirectors.length && <tr><td colSpan={4} className={adminStyles.empty}>No directors match your filters.</td></tr>}</tbody></table></div></>}
    </section>
  </AdminWorkspace>;
}
