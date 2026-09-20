'use client';

import Link from 'next/link';
import OnboardingWorkspace from '@/components/onboarding/OnboardingWorkspace';
import admin from '@/components/admin/admin.module.css';
import styles from '@/components/onboarding/onboarding.module.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FeedbackToast } from '@/components/Feedback';
import { EmptyState } from '@/components/Loaders';
import { apiFetchWithRetry } from '@/lib/api';
import { isStoreScopedRole, normalizeRole } from '@/lib/utils';

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
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [profiles, setProfiles] = useState<OnboardingProfile[]>([]);
  const [linkedUsers, setLinkedUsers] = useState<Record<string, { name: string; role: string; status: string; email: string }>>({});
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
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
        apiFetchWithRetry<Array<{ email?: string; firstName?: string; lastName?: string; role?: string; isActive?: boolean; storeId?: string; department?: string }>>('/users'),
        apiFetchWithRetry<Array<OnboardingProfile>>('/onboarding'),
        apiFetchWithRetry<Array<{ _id?: string; id?: string; name?: string }>>('/stores'),
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
      return matchesQuery && matchesStatus;
    });
  }, [profiles, query, statusFilter]);

  const sortedProfiles = useMemo(() => [...filteredProfiles].sort((a, b) =>
    [a.firstName, a.lastName].filter(Boolean).join(' ').localeCompare(
      [b.firstName, b.lastName].filter(Boolean).join(' '),
    ),
  ), [filteredProfiles]);

  return (
    <OnboardingWorkspace actions={<button className={admin.secondary} disabled={isLoading} onClick={() => void loadData()}>{isLoading ? 'Refreshing…' : 'Refresh'}</button>}>
      {toast && <FeedbackToast title="Unable to refresh" description={toast.message} type={toast.type} onClose={() => setToast(null)} durationMs={3200} />}

      <section className={styles.overviewHero} aria-labelledby="onboarding-heading">
        <div><span className={styles.eyebrow}>PEOPLE & ACCESS</span><h1 id="onboarding-heading">A smooth start for every team member</h1><p>Manage user accounts and follow onboarding progress, all in one place.</p></div>
        <Link className={admin.primary} href="/users">Manage users <span aria-hidden="true">→</span></Link>
      </section>

      <div className={styles.shortcuts}>
        <Link href="/users" className={styles.shortcut}><span className={styles.shortcutIcon} aria-hidden="true">01</span><div><h2>User accounts</h2><p>View team members, update their details and manage account access.</p></div><span aria-hidden="true">↗</span></Link>
        <Link href="/workflow" className={styles.shortcut}><span className={styles.shortcutIcon} aria-hidden="true">02</span><div><h2>Onboarding guide</h2><p>See the recommended steps and responsibilities for each role.</p></div><span aria-hidden="true">↗</span></Link>
      </div>

      {isLoading ? <div className={styles.loading} role="status">Loading onboarding progress…</div> : hasLoadError ? (
        <section className={admin.panel}><EmptyState variant="error" onRetry={loadData} /></section>
      ) : profiles.length === 0 ? (
        <section className={styles.welcome} aria-labelledby="no-applicants">
          <span className={styles.welcomeIcon} aria-hidden="true">✓</span>
          <div><h2 id="no-applicants">No applicants to track yet</h2><p>Onboarding profiles will appear here when they are available. You can manage existing team members from User accounts.</p></div>
        </section>
      ) : <>
        <div className={styles.progressSummary} aria-label="Applicant summary">
          {[['Applicants',stats.total],['Pending',stats.pending],['In review',stats.inReview],['Approved',stats.approved]].map(([label,value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
        </div>
        <section className={admin.panel} aria-labelledby="applicant-heading">
          <div className={admin.panelHeader}><div><h2 id="applicant-heading">Applicants</h2><p>Check each applicant’s progress and linked account.</p></div><span className={admin.count} aria-live="polite">{sortedProfiles.length} of {profiles.length} shown</span></div>
          <div className={styles.applicantFilters}>
            <label>Find an applicant<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name, email or reference" /></label>
            <label>Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="All">All statuses</option>{Array.from(new Set(profiles.map(profile => profile.status).filter(Boolean))).sort().map(status => <option key={status} value={status}>{formatStageLabel(status)}</option>)}</select></label>
          </div>
          {sortedProfiles.length === 0 ? <div className={admin.empty}><p>No applicants match your search.</p><button className={admin.secondary} onClick={() => {setQuery('');setStatusFilter('All');}}>Clear filters</button></div> : (
            <ul className={styles.applicantList}>{sortedProfiles.map(item => {
              const name = [item.firstName, item.lastName].filter(Boolean).join(' ') || item.profileCode || 'Applicant';
              const linkedUser = item.email ? linkedUsers[item.email.trim().toLowerCase()] : undefined;
              return <li key={item._id || item.profileCode}>
                <div className={styles.applicantIdentity}><span className={styles.avatar} aria-hidden="true">{name.slice(0,1).toUpperCase()}</span><div><h3>{name}</h3><p>{item.email || 'No email provided'}</p>{item.profileCode && <small>{item.profileCode}</small>}</div></div>
                <div className={styles.applicantMeta}><strong>{normalizeRole(item.role || 'member')}</strong><p>{[item.department, item.storeLabel || item.storeId].filter(Boolean).join(' · ') || 'No store assigned'}</p></div>
                <div className={styles.applicantStatus}><span className={admin.badge} data-status={item.status}>{formatStageLabel(item.stage, item.status)}</span><small>{formatLinkedStatus(linkedUser)}</small></div>
              </li>;
            })}</ul>
          )}
        </section>
      </>}
    </OnboardingWorkspace>
  );
}
