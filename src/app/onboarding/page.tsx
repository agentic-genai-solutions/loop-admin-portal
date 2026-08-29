'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FeedbackToast } from '@/components/Feedback';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { apiFetchWithRetry } from '@/lib/api';
import { isDirectorRole, isStoreScopedRole, isSuperAdminRole, normalizeRole } from '@/lib/utils';

function formatStageLabel(stage?: string, status?: string) {
  const raw = stage || status || 'pending';
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function formatLinkedStatus(user?: { status: string }) {
  if (!user) return 'Not linked';
  return user.status === 'Active' ? 'Linked to active user' : 'Linked to inactive user';
}

type OnboardingProfile = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  role: string;
  department: string;
  storeId: string;
  storeLabel?: string;
  status: string;
  stage: string;
  profileCode: string;
  source?: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [profiles, setProfiles] = useState<OnboardingProfile[]>([]);
  const [linkedUsers, setLinkedUsers] = useState<Record<string, { name: string; role: string; status: string; email: string }>>({});
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [linkFilter, setLinkFilter] = useState<'All' | 'Linked' | 'Not linked'>('All');
  const [sortBy, setSortBy] = useState<'candidate' | 'email' | 'role' | 'department' | 'location' | 'stage' | 'reference'>('candidate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const departmentOptions = useMemo(
    () => Array.from(new Set(profiles.map((profile) => profile.department).filter(Boolean))).sort(),
    [profiles],
  );

  const stats = useMemo(() => {
    const total = profiles.length;
    const approved = profiles.filter((item) => item.status === 'approved').length || 0;
    const pending = profiles.filter((item) => item.status === 'pending').length || 0;
    const inReview = profiles.filter((item) => item.status === 'in_review').length || 0;

    return { total, approved, pending, inReview };
  }, [profiles]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setHasLoadError(false);

    try {
      const storedUser = JSON.parse(window.sessionStorage.getItem('loop_admin_user') ?? '{}');
      const currentUserStore = String(storedUser?.storeId || storedUser?.store || storedUser?.department || storedUser?.store_name || '').trim().toLowerCase();
      const isStoreRestricted = isStoreScopedRole(storedUser?.role) && Boolean(currentUserStore);

      const [userData, profileData, storesData] = await Promise.all([
        apiFetchWithRetry<Array<{ email?: string; firstName?: string; lastName?: string; role?: string; isActive?: boolean; storeId?: string; department?: string }>>('/users').catch(() => []),
        apiFetchWithRetry<Array<OnboardingProfile>>('/onboarding').catch(() => []),
        apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores').catch(() => []),
      ]);

      const storeLabelById = new Map<string, string>(
        storesData
          .map((store): [string, string] => [String(store._id ?? store.id ?? '').trim(), String(store.name ?? '').trim()])
          .filter(([id, name]) => Boolean(id && name)),
      );

      const mappedProfileData = profileData.map((profile) => {
        const storeId = String(profile.storeId ?? '').trim();
        const storeLabel = storeLabelById.get(storeId) ?? storeId;
        return {
          ...profile,
          storeLabel,
        };
      });

      const filteredProfileData = isStoreRestricted
        ? mappedProfileData.filter((profile) => {
            const profileStore = String(profile.storeId || profile.storeLabel || profile.department || '').trim().toLowerCase();
            return profileStore === currentUserStore || profileStore.includes(currentUserStore);
          })
        : mappedProfileData;

      const userMap: Record<string, { name: string; role: string; status: string; email: string }> = {};
      userData.forEach((user) => {
        const email = (user.email ?? '').trim().toLowerCase();
        if (!email) return;
        userMap[email] = {
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'User',
          role: normalizeRole(user.role || 'member'),
          status: user.isActive === false ? 'Inactive' : 'Active',
          email,
        };
      });

      setLinkedUsers(userMap);
      setProfiles(filteredProfileData);
    } catch {
      setHasLoadError(true);
      showToast('Failed to load onboarding profiles after 3 attempts. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').toLowerCase();
      const email = profile.email?.toLowerCase() ?? '';
      const matchesQuery =
        normalizedQuery.length === 0 ||
        fullName.includes(normalizedQuery) ||
        email.includes(normalizedQuery) ||
        (profile.profileCode ?? '').toLowerCase().includes(normalizedQuery);

      const matchesStatus = statusFilter === 'All' || profile.status === statusFilter;
      const matchesDepartment = departmentFilter === 'All' || profile.department === departmentFilter;
      const linkedUser = profile.email ? linkedUsers[profile.email.trim().toLowerCase()] : undefined;
      const matchesLink =
        linkFilter === 'All' ||
        (linkFilter === 'Linked' && Boolean(linkedUser)) ||
        (linkFilter === 'Not linked' && !linkedUser);

      return matchesQuery && matchesStatus && matchesDepartment && matchesLink;
    });
  }, [profiles, query, statusFilter, departmentFilter, linkFilter, linkedUsers]);

  const sortedProfiles = useMemo(() => {
    const getCandidateName = (profile: OnboardingProfile) =>
      [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.firstName || profile.profileCode || '';

    return [...filteredProfiles].sort((first, second) => {
      const firstValue = sortBy === 'candidate'
        ? getCandidateName(first)
        : sortBy === 'email'
          ? first.email
          : sortBy === 'role'
            ? normalizeRole(first.role || 'member')
            : sortBy === 'department'
              ? (first.department || '')
              : sortBy === 'location'
                ? (first.storeLabel || first.storeId || '')
                : sortBy === 'stage'
                  ? formatStageLabel(first.stage, first.status)
                  : (first.profileCode || '');

      const secondValue = sortBy === 'candidate'
        ? getCandidateName(second)
        : sortBy === 'email'
          ? second.email
          : sortBy === 'role'
            ? normalizeRole(second.role || 'member')
            : sortBy === 'department'
              ? (second.department || '')
              : sortBy === 'location'
                ? (second.storeLabel || second.storeId || '')
                : sortBy === 'stage'
                  ? formatStageLabel(second.stage, second.status)
                  : (second.profileCode || '');

      const comparison = String(firstValue).localeCompare(String(secondValue), undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredProfiles, sortBy, sortDirection]);

  const handleSort = (column: 'candidate' | 'email' | 'role' | 'department' | 'location' | 'stage' | 'reference') => {
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection('asc');
  };

  const getSortArrow = (column: 'candidate' | 'email' | 'role' | 'department' | 'location' | 'stage' | 'reference') => {
    if (sortBy !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 28 }}>
      {toast && (
        <FeedbackToast
          title={toast.type === 'success' ? 'Success' : 'Error'}
          description={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          durationMs={3200}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
      </div>

      <div className="row" style={{ marginBottom: 20 }}>
        <div className="card" style={{ flex: '1 1 200px' }}><strong>{stats.total}</strong><div>Total applicants</div></div>
        <div className="card" style={{ flex: '1 1 200px' }}><strong>{stats.approved}</strong><div>Approved</div></div>
        <div className="card" style={{ flex: '1 1 200px' }}><strong>{stats.pending}</strong><div>Pending</div></div>
        <div className="card" style={{ flex: '1 1 200px' }}><strong>{stats.inReview}</strong><div>In review</div></div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 20, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15,23,42,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 8, fontWeight: 700, color: '#475569' }}>
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or email"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: '#fff' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 8, fontWeight: 700, color: '#475569' }}>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: '#fff' }}>
              <option value="All">All</option>
              <option value="pending">Pending</option>
              <option value="in_review">In review</option>
              <option value="approved">Approved</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 8, fontWeight: 700, color: '#475569' }}>
            Department
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: '#fff' }}>
              <option value="All">All</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 8, fontWeight: 700, color: '#475569' }}>
            Linked user
            <select value={linkFilter} onChange={(event) => setLinkFilter(event.target.value as 'All' | 'Linked' | 'Not linked')} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: '#fff' }}>
              <option value="All">All</option>
              <option value="Linked">Linked</option>
              <option value="Not linked">Not linked</option>
            </select>
          </label>

        </div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 20, background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)', borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15,23,42,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
          <div style={{ padding: 14, borderRadius: 12, background: '#fff', border: '1px solid rgba(148,163,184,0.2)' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Role: Team Member</div>
            <div style={{ color: '#475569', lineHeight: 1.6 }}>Submit profile → store manager review → HR confirmation → system activation.</div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: '#fff', border: '1px solid rgba(148,163,184,0.2)' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Role: Store Supervisor</div>
            <div style={{ color: '#475569', lineHeight: 1.6 }}>Candidate intake → area manager approval → director validation → onboarding complete.</div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: '#fff', border: '1px solid rgba(148,163,184,0.2)' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Role: Finance / Operations</div>
            <div style={{ color: '#475569', lineHeight: 1.6 }}>Initial review → department head approval → finance ops confirmation → final activation.</div>
          </div>
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <svg viewBox="0 0 900 240" width="100%" height="240" role="img" aria-label="Onboarding approval flow diagram" style={{ minWidth: 760, display: 'block' }}>
            <defs>
              <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                <path d="M0,0 L0,6 L9,3 z" fill="#475569" />
              </marker>
            </defs>

            <rect x="20" y="80" width="150" height="60" rx="14" fill="#dbeafe" stroke="#93c5fd" />
            <text x="95" y="110" textAnchor="middle" fill="#0f172a" fontSize="17" fontWeight="700">Apply</text>
            <text x="95" y="132" textAnchor="middle" fill="#334155" fontSize="13">Candidate</text>

            <rect x="220" y="80" width="180" height="60" rx="14" fill="#ede9fe" stroke="#c4b5fd" />
            <text x="310" y="110" textAnchor="middle" fill="#0f172a" fontSize="17" fontWeight="700">Department</text>
            <text x="310" y="132" textAnchor="middle" fill="#334155" fontSize="13">Review</text>

            <rect x="460" y="80" width="190" height="60" rx="14" fill="#dcfce7" stroke="#86efac" />
            <text x="555" y="110" textAnchor="middle" fill="#0f172a" fontSize="17" fontWeight="700">Manager</text>
            <text x="555" y="132" textAnchor="middle" fill="#334155" fontSize="13">Approval</text>

            <rect x="700" y="80" width="170" height="60" rx="14" fill="#fef3c7" stroke="#fbbf24" />
            <text x="785" y="110" textAnchor="middle" fill="#0f172a" fontSize="17" fontWeight="700">Activate</text>
            <text x="785" y="132" textAnchor="middle" fill="#334155" fontSize="13">User Access</text>

            <path d="M170 110 H220" stroke="#475569" strokeWidth="2.5" fill="none" markerEnd="url(#arrow)" />
            <path d="M400 110 H460" stroke="#475569" strokeWidth="2.5" fill="none" markerEnd="url(#arrow)" />
            <path d="M650 110 H700" stroke="#475569" strokeWidth="2.5" fill="none" markerEnd="url(#arrow)" />

            <text x="95" y="190" textAnchor="middle" fill="#475569" fontSize="12">Submission</text>
            <text x="310" y="190" textAnchor="middle" fill="#475569" fontSize="12">Assess</text>
            <text x="555" y="190" textAnchor="middle" fill="#475569" fontSize="12">Approve</text>
            <text x="785" y="190" textAnchor="middle" fill="#475569" fontSize="12">Finalize</text>
          </svg>
        </div>
      </div>

      <div className="card" style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15,23,42,0.04)' }}>
        {isLoading ? (
          <TableSkeleton columns={7} rows={4} />
        ) : hasLoadError ? (
          <EmptyState variant="error" onRetry={loadData} />
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleSort('candidate')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Candidate {getSortArrow('candidate')}
                    </button>
                  </th>
                  <th>Linked user</th>
                  <th>
                    <button type="button" onClick={() => handleSort('role')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Role {getSortArrow('role')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('department')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Department {getSortArrow('department')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('location')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Location {getSortArrow('location')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('stage')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Stage {getSortArrow('stage')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('reference')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Reference {getSortArrow('reference')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedProfiles.length > 0 ? (
                  sortedProfiles.map((item) => {
                    const linkedUser = item.email ? linkedUsers[item.email.trim().toLowerCase()] : undefined;

                    return (
                      <tr key={item._id || item.profileCode}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{item.firstName && item.lastName ? `${item.firstName} ${item.lastName}` : item.firstName || item.profileCode}</div>
                          <div style={{ color: '#64748b', fontSize: 12 }}>{item.email || 'No email provided'}</div>
                        </td>
                        <td>
                          {linkedUser ? (
                            <div>
                              <div style={{ fontWeight: 700 }}>{linkedUser.name}</div>
                              <div style={{ color: '#64748b', fontSize: 12 }}>{formatLinkedStatus(linkedUser)}</div>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>Not linked</span>
                          )}
                        </td>
                        <td>{normalizeRole(item.role || 'member')}</td>
                        <td>{item.department || 'Unassigned'}</td>
                        <td>{item.storeLabel || item.storeId || 'Unassigned'}</td>
                        <td>
                          <span className={`badge ${item.status === 'approved' ? 'success' : item.status === 'in_review' ? 'info' : 'warning'}`}>
                            {formatStageLabel(item.stage, item.status)}
                          </span>
                        </td>
                        <td>{item.profileCode || 'Loop profile'}</td>
                      </tr>
                    );
                  })
                ) : (
                  <EmptyState colSpan={7} title="No onboarding profiles found" description="Try changing the filters or check for a different applicant status." />
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
