'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FeedbackToast } from '@/components/Feedback';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { fetchDirectors } from '@/lib/admin-data';
import { isDirectorRole, isSuperAdminRole } from '@/lib/utils';

type Director = { id: string | number; name: string; email: string; region: string; status: string; stores: number };

const initialDirectors: Director[] = [];

export default function DirectorsPage() {
  const [directors, setDirectors] = useState(initialDirectors);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'region' | 'stores' | 'status'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const loadDirectors = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const mappedDirectors = await fetchDirectors();
      setDirectors(mappedDirectors);
      setIsApiLoaded(true);
    } catch {
      setHasError(true);
      showToast('Failed to load directors after 3 attempts. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

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

  return (
    <main className="portal-page">
      {toast && (
        <FeedbackToast
          title={toast.type === 'success' ? 'Success' : 'Error'}
          description={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          durationMs={2800}
        />
      )}

      <div className="card" style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15,23,42,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 16, alignItems: 'end', width: '100%', maxWidth: 520 }}>
            <label style={{ display: 'grid', gap: 8, fontWeight: 700, color: '#334155', fontSize: 13 }}>
              Search
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email or region"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 8, fontWeight: 700, color: '#334155', fontSize: 13 }}>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(255,255,255,0.42)' }}>
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Pending">Pending</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {isLoading ? (
            <TableSkeleton columns={6} rows={4} />
          ) : hasError ? (
            <EmptyState variant="error" onRetry={loadDirectors} />
          ) : (
            <table className="table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleSort('name')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Name {getSortArrow('name')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('email')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Email {getSortArrow('email')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('region')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Region {getSortArrow('region')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('stores')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Stores Assigned {getSortArrow('stores')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('status')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Status {getSortArrow('status')}
                    </button>
                  </th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {visibleDirectors.length > 0 ? (
                  visibleDirectors.map((director) => (
                    <tr key={director.id}>
                      <td>{director.name}</td>
                      <td>{director.email}</td>
                      <td>{director.region}</td>
                      <td>{director.stores}</td>
                      <td>
                        <span className={`badge ${director.status === 'Active' ? 'success' : director.status === 'Pending' ? 'warning' : 'danger'}`}>
                          {director.status}
                        </span>
                      </td>
                      <td>Read only</td>
                    </tr>
                  ))
                ) : (
                  <EmptyState colSpan={6} title="No directors found" description="No directors match the current search or filters." />
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
