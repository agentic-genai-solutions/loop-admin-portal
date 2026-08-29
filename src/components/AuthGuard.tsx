'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { normalizeRole, shouldShowStoreField } from '@/lib/utils';
import Sidebar from './Sidebar';

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

function resolveDisplayName(parsedUser: Record<string, any> | null | undefined) {
  const directName = [parsedUser?.title, parsedUser?.firstName, parsedUser?.lastName].filter(Boolean).join(' ');
  if (directName) return directName.trim();

  return (
    parsedUser?.name ||
    parsedUser?.fullName ||
    parsedUser?.displayName ||
    parsedUser?.username ||
    parsedUser?.email?.split('@')[0] ||
    'User'
  );
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userName, setUserName] = useState('User');
  const [userRole, setUserRole] = useState('Team');
  const [userDesignation, setUserDesignation] = useState('Team');
  const [userEmail, setUserEmail] = useState('');
  const [userStore, setUserStore] = useState('Not assigned');

  const shouldDisplayStore = shouldShowStoreField(userRole);

  const publicPaths = useMemo(() => new Set(['/login']), []);
  const isPublicPage = publicPaths.has(pathname || '/');

  useEffect(() => {
    const token = window.sessionStorage.getItem('loop_admin_token');

    if (!token && !isPublicPage) {
      router.replace('/login');
      return;
    }

    if (token) {
      const lastActivity = Number(window.sessionStorage.getItem('loop_admin_last_activity') ?? '0');
      const isExpired = Date.now() - lastActivity > SESSION_TIMEOUT_MS;

      if (isExpired) {
        window.sessionStorage.removeItem('loop_admin_token');
        window.sessionStorage.removeItem('loop_admin_user');
        window.sessionStorage.removeItem('loop_admin_last_activity');
        window.alert('Your session has expired. Please log in again.');
        router.replace('/login');
        return;
      }

      window.sessionStorage.setItem('loop_admin_last_activity', String(Date.now()));
    }

    const storedUser = window.sessionStorage.getItem('loop_admin_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        const resolvedName = resolveDisplayName(parsed);
        const resolvedRole = normalizeRole(parsed?.role || 'Team');
        const resolvedDesignation = String(parsed?.designationLabel ?? '').trim();
        const resolvedEmail = parsed?.email || 'No email';
        const resolvedStore = String(parsed?.storeName || parsed?.store || parsed?.storeId || parsed?.department || parsed?.store_name || '').trim();

        setUserName(resolvedName);
        setUserRole(resolvedRole);
        setUserDesignation(resolvedDesignation || 'Not assigned');
        setUserEmail(resolvedEmail);
        setUserStore(shouldShowStoreField(resolvedRole) ? (resolvedStore || 'Not assigned') : '');
      } catch {
        setUserName('User');
        setUserRole('Team');
        setUserDesignation('Not assigned');
        setUserEmail('');
        setUserStore('Not assigned');
      }
    }

    setIsReady(true);
  }, [isPublicPage, pathname, router]);

  useEffect(() => {
    if (isPublicPage) {
      return;
    }

    const onActivity = () => {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem('loop_admin_token')) {
        window.sessionStorage.setItem('loop_admin_last_activity', String(Date.now()));
      }
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    events.forEach((eventName) => window.addEventListener(eventName, onActivity));

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
    };
  }, [isPublicPage]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.profile-dropdown-shell')) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((value) => value[0]?.toUpperCase() ?? '')
    .join('') || 'L';

  const handleLogout = () => {
    window.sessionStorage.removeItem('loop_admin_token');
    window.sessionStorage.removeItem('loop_admin_user');
    window.sessionStorage.removeItem('loop_admin_last_activity');
    setIsProfileOpen(false);
    router.push('/login');
  };

  const pageMeta = useMemo(() => {
    const currentPath = pathname || '/';

    if (currentPath.startsWith('/master-data/roles')) {
      return { eyebrow: 'Master Data', title: 'Master Data - Roles' };
    }

    if (currentPath.startsWith('/master-data/designations')) {
      return { eyebrow: 'Master Data', title: 'Master Data - Designations' };
    }

    if (currentPath.startsWith('/master-data/access-delegation')) {
      return { eyebrow: 'Master Data', title: 'Master Data - Access Delegation' };
    }

    if (currentPath.startsWith('/master-data')) {
      return { eyebrow: 'Master Data', title: 'Master Data' };
    }

    const routeMap: Record<string, string> = {
      '/': 'Dashboard',
      '/users': 'Users',
      '/employees': 'Employees',
      '/directors': 'Directors',
      '/onboarding': 'Onboarding',
      '/workflow': 'Workflow',
      '/incentives': 'Incentives',
      '/reports': 'Reports',
      '/stores': 'Store Management',
      '/finance': 'Finance',
      '/profile': 'Profile',
    };

    return { eyebrow: 'Overview', title: routeMap[currentPath] || 'Overview' };
  }, [pathname]);

  if (isPublicPage) {
    return <>{children}</>;
  }

  if (!isReady) {
    return null;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="content-wrapper">
        <header className="app-header">
          <div className="app-header-title">
            <span className="eyebrow">{pageMeta.eyebrow}</span>
            <h1>{pageMeta.title}</h1>
          </div>

          <div className="profile-dropdown-shell">
            <button type="button" className="profile-trigger" onClick={() => setIsProfileOpen((open) => !open)}>
              <span className="profile-avatar" aria-label="User avatar">{initials}</span>
              <span className="profile-summary">
                <strong>{userName}</strong>
                <small>{userDesignation}</small>
              </span>
              <svg viewBox="0 0 20 20" aria-hidden="true" className="profile-chevron">
                <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {isProfileOpen && (
              <div className="profile-dropdown" role="menu" aria-label="Account menu">
                <div className="profile-dropdown-header">
                  <span className="profile-dropdown-avatar">{initials}</span>
                  <div>
                    <strong>{userName}</strong>
                    <small>{userDesignation}</small>
                  </div>
                </div>

                <div className="profile-meta-row">
                  <span className="profile-meta-label">Email</span>
                  <span className="profile-meta-value">{userEmail || 'Not available'}</span>
                </div>

                {shouldDisplayStore && (
                  <div className="profile-meta-row">
                    <span className="profile-meta-label">Store</span>
                    <span className="profile-meta-value">{userStore}</span>
                  </div>
                )}

                <div className="profile-dropdown-actions">
                  <Link href="/profile" className="profile-action-link" onClick={() => setIsProfileOpen(false)}>
                    <span aria-hidden="true">👤</span>
                    View profile
                  </Link>
                  <button type="button" className="profile-action-logout" onClick={handleLogout}>
                    <span aria-hidden="true">↩</span>
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="content-shell">{children}</main>
      </div>
    </div>
  );
}
