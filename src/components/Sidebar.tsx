'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { normalizeRole } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/employees', label: 'Employees' },
  { href: '/directors', label: 'Directors' },
  { href: '/incentives', label: 'Incentives' },
  { href: '/reports', label: 'Reports' },
  { href: '/stores', label: 'Store Management' },
  { href: '/finance', label: 'Finance' },
];

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

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [userName, setUserName] = useState('User');
  const [userRole, setUserRole] = useState('Team');
  const [userStore, setUserStore] = useState('');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isMasterDataOpen, setIsMasterDataOpen] = useState(false);

  const canViewMasterData = true;
  const canViewOnboarding = true;
  const canViewWorkflow = true;
  const canViewDirectors = true;

  useEffect(() => {
    const isCurrentOnboardingRoute = pathname === '/onboarding' || pathname === '/users' || pathname === '/workflow';
    setIsOnboardingOpen(isCurrentOnboardingRoute || pathname.startsWith('/onboarding/'));
  }, [pathname]);

  useEffect(() => {
    const isCurrentMasterDataRoute = pathname === '/master-data' || pathname.startsWith('/master-data/');
    setIsMasterDataOpen(isCurrentMasterDataRoute);
  }, [pathname]);

  const visibleNavItems = useMemo(() => navItems, []);

  useEffect(() => {
    const storedUser = window.sessionStorage.getItem('loop_admin_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        const resolvedName = resolveDisplayName(parsed);
        const resolvedRole = normalizeRole(parsed?.role || 'Team');
        const resolvedStore = String(parsed?.storeName || parsed?.store || parsed?.storeId || parsed?.department || parsed?.store_name || '').trim();
        setUserName(resolvedName);
        setUserRole(resolvedRole);
        setUserStore(resolvedStore);
      } catch {
        setUserName('User');
        setUserRole('Team');
        setUserStore('');
      }
    }
  }, []);

  const isActiveLink = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem('loop_admin_token');
    window.sessionStorage.removeItem('loop_admin_user');
    window.sessionStorage.removeItem('loop_admin_last_activity');
    router.push('/login');
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="brand-block">
        <div className="brand-mark" aria-label="Loop logo">
          <img src="/loop-logo-white.png" alt="Loop" className="brand-logo-image" />
          <div className="brand-subtitle">Admin portal</div>
        </div>
      </div>

      <button
        type="button"
        className="mobile-menu-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="sidebar-nav"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        <span className="hamburger" aria-hidden="true">
          <span className="bar bar-1" />
          <span className="bar bar-2" />
          <span className="bar bar-3" />
        </span>
      </button>

      <nav id="sidebar-nav" className={`sidebar-nav ${isOpen ? 'visible' : ''}`} aria-label="Sidebar navigation">
        {visibleNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActiveLink(item.href) ? 'active' : ''}`}
            onClick={() => setIsOpen(false)}
          >
            {item.label}
          </Link>
        ))}

        {canViewMasterData && (
          <div className="nav-group">
            <button
              type="button"
              className={`nav-group-toggle ${pathname.startsWith('/master-data') ? 'active' : ''}`}
              onClick={() => {
                if (!isMasterDataOpen) {
                  router.push('/master-data/roles');
                }
                setIsMasterDataOpen((open) => !open);
                setIsOpen(false);
              }}
              aria-expanded={isMasterDataOpen}
            >
              <span>Master Data</span>
              <span className="nav-group-caret">{isMasterDataOpen ? '▾' : '▸'}</span>
            </button>

            {isMasterDataOpen && (
              <div className="nav-group-children">
                <Link
                  href="/master-data/roles"
                  className={`nav-item nav-item-sub ${isActiveLink('/master-data/roles') ? 'active' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  Roles
                </Link>
                <Link
                  href="/master-data/designations"
                  className={`nav-item nav-item-sub ${isActiveLink('/master-data/designations') ? 'active' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  Designations
                </Link>
                <Link
                  href="/master-data/access-delegation"
                  className={`nav-item nav-item-sub ${isActiveLink('/master-data/access-delegation') ? 'active' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  Access Delegation
                </Link>
              </div>
            )}
          </div>
        )}

        {canViewOnboarding && (
          <div className="nav-group">
            <button
              type="button"
              className={`nav-group-toggle ${isActiveLink('/onboarding') || pathname === '/users' || (pathname === '/workflow' && canViewWorkflow) ? 'active' : ''}`}
              onClick={() => {
                if (!isOnboardingOpen) {
                  router.push('/onboarding');
                }
                setIsOnboardingOpen((open) => !open);
                setIsOpen(false);
              }}
              aria-expanded={isOnboardingOpen}
            >
              <span>Onboarding</span>
              <span className="nav-group-caret">{isOnboardingOpen ? '▾' : '▸'}</span>
            </button>

            {isOnboardingOpen && (
              <div className="nav-group-children">
                <Link
                  href="/users"
                  className={`nav-item nav-item-sub ${isActiveLink('/users') ? 'active' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  Users
                </Link>
                {canViewWorkflow && (
                  <Link
                    href="/workflow"
                    className={`nav-item nav-item-sub ${isActiveLink('/workflow') ? 'active' : ''}`}
                    onClick={() => setIsOpen(false)}
                  >
                    Workflow
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </nav>

    </aside>
  );
}
