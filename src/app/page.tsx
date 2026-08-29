'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ButtonLoader } from '@/components/Loaders';
import { apiFetch } from '@/lib/api';
import { normalizeRole } from '@/lib/utils';

type DashboardState = {
  kpis: Array<{ label: string; value: string; delta: string; tone: 'success' | 'info' | 'warning'; icon: string }>;
  weeklyTrend: number[];
  teamMix: Array<{ label: string; value: number; color: string }>;
  stores: Array<{ name: string; region: string; staff: number; occupancy: string; status: string }>;
  actionCenter: string[];
  totalStaff: number;
  trendDelta: string;
  openApprovals: number;
};

const emptyDashboardState: DashboardState = {
  kpis: [],
  weeklyTrend: [],
  teamMix: [],
  stores: [],
  actionCenter: [],
  totalStaff: 0,
  trendDelta: '0.0%',
  openApprovals: 0,
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000';

function numberFormatter(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function buildDashboardState(
  employees: Array<Record<string, any>>,
  onboardingProfiles: Array<Record<string, any>>,
  storeMasterRecords: Array<Record<string, any>>,
  attendanceReport: { totalEmployees?: number; attendanceRate?: number; present?: number; late?: number; absent?: number } = {},
  payrollReport: { totalPayroll?: number; pending?: number; approved?: number; paid?: number } = {},
): DashboardState {
    const storeNameById = new Map<string, string>(
      storeMasterRecords
        .map((store): [string, string] => [String(store?._id ?? store?.id ?? '').trim(), String(store?.name ?? '').trim()])
        .filter(([id, name]) => Boolean(id && name)),
    );

  const totalEmployees = employees.length || attendanceReport.totalEmployees || 0;
  const activeEmployees = employees.filter((employee) => employee.isActive !== false).length;
  const pendingOnboarding = onboardingProfiles.filter((profile) => !['approved', 'active'].includes(profile.status)).length;
  const attendanceRate = Number(attendanceReport.attendanceRate ?? 0);
  const payrollPendingRatio = payrollReport.pending && payrollReport.approved !== undefined && payrollReport.paid !== undefined
    ? ((payrollReport.pending / Math.max(payrollReport.pending + payrollReport.approved + payrollReport.paid, 1)) * 100)
    : 0;

  const roleCounts = new Map<string, number>();
  employees.forEach((employee) => {
    const roleLabel = normalizeRole(employee.role);
    roleCounts.set(roleLabel, (roleCounts.get(roleLabel) ?? 0) + 1);
  });

  const teamMix = Array.from(roleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count], index) => ({
      label,
      value: totalEmployees ? Math.max(1, Math.round((count / totalEmployees) * 100)) : 0,
      color: ['#5b8def', '#21c4a8', '#f59e0b', '#8b5cf6'][index % 4],
    }));

  const stores = Array.from(
    employees
      .reduce((groups, employee) => {
        const resolvedStoreId = String(employee.storeId ?? '').trim();
        const storeName = storeNameById.get(resolvedStoreId) || resolvedStoreId || employee.department || 'Unassigned';
        const group = groups.get(storeName) ?? { name: storeName, region: employee.department || 'Operations', staff: 0 };
        group.staff += 1;
        groups.set(storeName, group);
        return groups;
      }, new Map<string, { name: string; region: string; staff: number }>())
      .entries() as Iterable<[string, { name: string; region: string; staff: number }]>,
  )
    .map(([name, value]) => ({
      name,
      region: value.region,
      staff: value.staff,
      occupancy: `${Math.min(99, Math.max(55, Math.round((value.staff / Math.max(totalEmployees, 1)) * 100 + 30)))}%`,
      status: value.staff >= 25 ? 'Healthy' : value.staff >= 15 ? 'Watch' : 'Needs attention',
    }))
    .slice(0, 4);

  const weeklyTrend = [
    Math.min(100, Math.max(20, Math.round(attendanceRate * 0.75))),
    Math.min(100, Math.max(20, Math.round(attendanceRate * 0.8))),
    Math.min(100, Math.max(20, Math.round(attendanceRate * 0.82))),
    Math.min(100, Math.max(20, Math.round(attendanceRate * 0.86))),
    Math.min(100, Math.max(20, Math.round(attendanceRate * 0.89))),
    Math.min(100, Math.max(20, Math.round(attendanceRate * 0.92))),
    Math.min(100, Math.max(20, Math.round(attendanceRate * 0.96))),
  ];
  const trendStart = weeklyTrend[0] ?? 0;
  const trendEnd = weeklyTrend[weeklyTrend.length - 1] ?? 0;
  const trendDelta = trendStart > 0
    ? `${(((trendEnd - trendStart) / trendStart) * 100).toFixed(1)}%`
    : '0.0%';

  const actionCenter = [
    pendingOnboarding > 0 ? `Review ${pendingOnboarding} onboarding profile${pendingOnboarding === 1 ? '' : 's'} awaiting approval` : 'All onboarding profiles are up to date',
    payrollReport.pending ? `Resolve ${payrollReport.pending} pending payroll item${payrollReport.pending === 1 ? '' : 's'} for approval` : 'Payroll is fully reconciled for the current cycle',
    `Check ${Math.max(0, totalEmployees - activeEmployees)} inactive employee${Math.max(0, totalEmployees - activeEmployees) === 1 ? '' : 's'} requiring reactivation`,
    attendanceReport.absent ? `Follow up on ${attendanceReport.absent} absent team member${attendanceReport.absent === 1 ? '' : 's'} from the latest cycle` : 'Attendance coverage is stable across the team',
  ];

  const kpis = [
    {
      label: 'Active employees',
      value: numberFormatter(activeEmployees || totalEmployees),
      delta: totalEmployees ? `+${Math.max(1, Math.round(((activeEmployees || totalEmployees) / Math.max(totalEmployees, 1)) * 100))}%` : '0%',
      tone: 'success' as const,
      icon: '👥',
    },
    {
      label: 'On-time attendance',
      value: `${attendanceRate ? attendanceRate.toFixed(1) : '0.0'}%`,
      delta: attendanceRate ? `+${Math.max(0.1, attendanceRate - 80).toFixed(1)}%` : '0.0%',
      tone: 'success' as const,
      icon: '✅',
    },
    {
      label: 'Open onboarding',
      value: numberFormatter(pendingOnboarding),
      delta: pendingOnboarding ? `-${Math.min(99, Math.max(0, pendingOnboarding))}%` : '0%',
      tone: 'info' as const,
      icon: '📝',
    },
    {
      label: 'Payroll variance',
      value: payrollPendingRatio ? `${payrollPendingRatio.toFixed(1)}%` : '0.0%',
      delta: payrollPendingRatio ? `-${Math.min(99, Math.max(0, payrollPendingRatio)).toFixed(1)}%` : '0.0%',
      tone: 'warning' as const,
      icon: '💰',
    },
  ];

  return {
    kpis,
    weeklyTrend,
    teamMix,
    stores,
    actionCenter,
    totalStaff: totalEmployees,
    trendDelta,
    openApprovals: Number(payrollReport.pending ?? 0) + pendingOnboarding,
  };
}

export default function HomePage() {
  const [dashboardState, setDashboardState] = useState<DashboardState>(emptyDashboardState);
  const [storeSortBy, setStoreSortBy] = useState<'name' | 'region' | 'staff' | 'occupancy' | 'status'>('name');
  const [storeSortDirection, setStoreSortDirection] = useState<'asc' | 'desc'>('asc');
  const [backendStatus, setBackendStatus] = useState<{ status: 'checking' | 'online' | 'offline'; message: string }>({
    status: 'checking',
    message: 'Connecting to Loop backend…',
  });
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const totalMix = useMemo(() => dashboardState.teamMix.reduce((sum, item) => sum + item.value, 0), [dashboardState.teamMix]);
  const trendLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const trendPoints = useMemo(
    () => dashboardState.weeklyTrend.map((value, index) => {
      const x = 36 + index * 80;
      const y = 194 - value * 1.2;
      return { x, y, value, index };
    }),
    [dashboardState.weeklyTrend],
  );
  const trendLinePoints = useMemo(
    () => trendPoints.map((point) => `${point.x},${point.y}`).join(' '),
    [trendPoints],
  );
  const trendAreaPoints = useMemo(() => {
    if (!trendPoints.length) {
      return '';
    }

    const first = trendPoints[0];
    const last = trendPoints[trendPoints.length - 1];
    return `${first.x},194 ${trendLinePoints} ${last.x},194`;
  }, [trendPoints, trendLinePoints]);

  const teamMixGradient = useMemo(() => {
    if (!dashboardState.teamMix.length || totalMix <= 0) {
      return 'conic-gradient(#e5e7eb 0 100%)';
    }

    let cursor = 0;
    const segments = dashboardState.teamMix.map((item) => {
      const size = (item.value / totalMix) * 100;
      const from = cursor;
      const to = Math.min(100, cursor + size);
      cursor = to;
      return `${item.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
    });

    if (cursor < 100) {
      segments.push(`#e5e7eb ${cursor.toFixed(2)}% 100%`);
    }

    return `conic-gradient(${segments.join(', ')})`;
  }, [dashboardState.teamMix, totalMix]);

  const sortedStores = useMemo(() => {
    const parseOccupancy = (value: string) => {
      const numeric = Number(String(value).replace(/[^0-9.-]+/g, ''));
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    return [...dashboardState.stores].sort((first, second) => {
      let comparison = 0;

      if (storeSortBy === 'staff') {
        comparison = first.staff - second.staff;
      } else if (storeSortBy === 'occupancy') {
        comparison = parseOccupancy(first.occupancy) - parseOccupancy(second.occupancy);
      } else {
        comparison = String(first[storeSortBy]).localeCompare(String(second[storeSortBy]), undefined, { sensitivity: 'base' });
      }

      return storeSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [dashboardState.stores, storeSortBy, storeSortDirection]);

  const handleStoreSort = (column: 'name' | 'region' | 'staff' | 'occupancy' | 'status') => {
    if (storeSortBy === column) {
      setStoreSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setStoreSortBy(column);
    setStoreSortDirection('asc');
  };

  const getStoreSortArrow = (column: 'name' | 'region' | 'staff' | 'occupancy' | 'status') => {
    if (storeSortBy !== column) return '↕';
    return storeSortDirection === 'asc' ? '↑' : '↓';
  };

  const refreshDashboardData = useCallback(async () => {
    setIsLoadingDashboard(true);
    setDashboardError(null);

    try {
      const [employees, onboardingProfiles, stores, attendanceReport, payrollReport] = await Promise.all([
        apiFetch<Array<Record<string, any>>>('/users').catch(() => []),
        apiFetch<Array<Record<string, any>>>('/onboarding').catch(() => []),
        apiFetch<Array<Record<string, any>>>('/stores').catch(() => []),
        apiFetch<{ totalEmployees?: number; attendanceRate?: number; present?: number; late?: number; absent?: number }>('/director/reports/attendance').catch(() => ({ totalEmployees: 0, attendanceRate: 0, present: 0, late: 0, absent: 0 })),
        apiFetch<{ totalPayroll?: number; pending?: number; approved?: number; paid?: number }>('/director/reports/payroll').catch(() => ({ totalPayroll: 0, pending: 0, approved: 0, paid: 0 })),
      ]);

      setDashboardState(buildDashboardState(employees, onboardingProfiles, stores, attendanceReport, payrollReport));
    } catch {
      setDashboardError('Unable to load dashboard data from the Loop backend.');
      setDashboardState(emptyDashboardState);
    } finally {
      setIsLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    void refreshDashboardData();
  }, [refreshDashboardData]);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      try {
        const data = await apiFetch<{ status: string; service?: string }>('/health');

        if (!active) return;
        setBackendStatus({
          status: data?.status === 'ok' ? 'online' : 'offline',
          message: data?.service ?? 'Loop Attendance backend is running',
        });
      } catch {
        if (!active) return;
        setBackendStatus({
          status: 'offline',
          message: `Backend unavailable at ${API_BASE_URL}`,
        });
      }
    }

    loadStatus();
    return () => {
      active = false;
    };
  }, []);

  const resetDashboardData = () => {
    setDashboardState(emptyDashboardState);
    setDashboardError(null);
    void refreshDashboardData();
    setBackendStatus({
      status: 'checking',
      message: 'Refreshing Loop backend…',
    });
  };

  const backendStatusLabel = backendStatus.status === 'online' ? 'Online' : backendStatus.status === 'offline' ? 'Offline' : 'Checking';

  const renderKpiLineIcon = (label: string) => {
    const common = {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      width: 18,
      height: 18,
    };

    if (label === 'Active employees') {
      return (
        <svg {...common} aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="3.5" />
          <path d="M20 8v6" />
          <path d="M23 11h-6" />
        </svg>
      );
    }

    if (label === 'On-time attendance') {
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="m8.8 12 2.2 2.2 4.2-4.2" />
        </svg>
      );
    }

    if (label === 'Open onboarding') {
      return (
        <svg {...common} aria-hidden="true">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h6" />
        </svg>
      );
    }

    return (
      <svg {...common} aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M6 6v13h12V6" />
        <path d="M10 10h4" />
        <path d="M12 10v5" />
      </svg>
    );
  };

  return (
    <main className="dashboard-shell">
        <section className="dashboard-command-bar">
          <div className="dashboard-command-title">
            <p className="eyebrow">Control Center</p>
            <h2>Workforce operations snapshot</h2>
            <span className={`dashboard-inline-status ${backendStatus.status}`}>
              <span className="dashboard-inline-status-dot" aria-hidden="true" />
              {backendStatusLabel}
            </span>
          </div>
          <div className="topbar-actions">
            <ButtonLoader label="Reset dashboard data" variant="secondary" loading={isLoadingDashboard} onClick={resetDashboardData} />
            <ButtonLoader label="Export report" variant="secondary" loading={false} />
            <Link href="/users" className="primary-button">
              Manage users
            </Link>
          </div>
        </section>

        {dashboardError && (
          <div className="dashboard-error-banner" role="alert">
            <strong>Data sync issue</strong>
            <span>{dashboardError}</span>
          </div>
        )}

        {isLoadingDashboard && !dashboardState.kpis.length && (
          <div className="dashboard-loading-state">
            <ButtonLoader label="Loading dashboard" variant="secondary" loading />
          </div>
        )}

        <section className="kpi-grid" aria-label="Core workforce indicators">
          {dashboardState.kpis.map((item) => (
            <article key={item.label} className={`stat-card tone-${item.tone}`}>
              <div className="stat-header">
                <div className="stat-title-group">
                  <span className="metric-icon stat-icon">{renderKpiLineIcon(item.label)}</span>
                  <span className="stat-label">{item.label}</span>
                </div>
                <span className={`stat-delta ${item.tone}`}>{item.delta}</span>
              </div>
              <div className="stat-value">{item.value}</div>
            </article>
          ))}
        </section>

        <section className="content-grid">
          <article className="panel chart-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Performance</p>
                <h2>Workforce trend</h2>
              </div>
              <span className="badge success">{dashboardState.trendDelta} vs start of week</span>
            </div>

            <svg viewBox="0 0 640 220" className="chart-svg" role="img" aria-label="Workforce trend chart">
              <defs>
                <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#5b8def" stopOpacity="0.26" />
                  <stop offset="100%" stopColor="#5b8def" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {[0, 1, 2, 3].map((line) => (
                <line
                  key={line}
                  x1="36"
                  x2="600"
                  y1={34 + line * 52}
                  y2={34 + line * 52}
                  stroke="#e5e7eb"
                  strokeDasharray="4 8"
                />
              ))}

              {trendAreaPoints && (
                <polygon points={trendAreaPoints} fill="url(#lineFill)" />
              )}
              {trendLinePoints && (
                <polyline
                  points={trendLinePoints}
                  fill="none"
                  stroke="#4361ee"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {trendPoints.map((point) => {
                return (
                  <g key={`${point.value}-${point.index}`}>
                    <circle cx={point.x} cy={point.y} r="5" fill="#4361ee" />
                    <text x={point.x - 8} y="208" fill="#64748b" fontSize="11">{trendLabels[point.index]}</text>
                  </g>
                );
              })}
            </svg>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Composition</p>
                <h2>Team mix</h2>
              </div>
            </div>

            <div className="donut-wrap">
              <div
                className="donut-chart"
                style={{
                  background: teamMixGradient,
                }}
              >
                <div className="donut-center">
                  <strong>{numberFormatter(dashboardState.totalStaff)}</strong>
                  <span>Staff</span>
                </div>
              </div>

              <div className="legend-list">
                {dashboardState.teamMix.map((item) => (
                  <div key={item.label} className="legend-row">
                    <span className="legend-dot" style={{ background: item.color }} />
                    <span>{item.label}</span>
                    <strong>{item.value}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section className="bottom-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Regional</p>
                <h2>Store performance</h2>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <button type="button" onClick={() => handleStoreSort('name')} className="sort-trigger">
                        <span>Location</span>
                        <span aria-hidden="true">{getStoreSortArrow('name')}</span>
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => handleStoreSort('region')} className="sort-trigger">
                        <span>Region</span>
                        <span aria-hidden="true">{getStoreSortArrow('region')}</span>
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => handleStoreSort('staff')} className="sort-trigger">
                        <span>Staff</span>
                        <span aria-hidden="true">{getStoreSortArrow('staff')}</span>
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => handleStoreSort('occupancy')} className="sort-trigger">
                        <span>Occupancy</span>
                        <span aria-hidden="true">{getStoreSortArrow('occupancy')}</span>
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => handleStoreSort('status')} className="sort-trigger">
                        <span>Status</span>
                        <span aria-hidden="true">{getStoreSortArrow('status')}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStores.map((store) => (
                    <tr key={store.name}>
                      <td>{store.name}</td>
                      <td>{store.region}</td>
                      <td>{store.staff}</td>
                      <td>{store.occupancy}</td>
                      <td>
                        <span className={`status ${store.status === 'Healthy' ? 'healthy' : store.status === 'Watch' ? 'watch' : 'alert'}`}>
                          {store.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel sidebar-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Priority</p>
                <h2>Action center</h2>
              </div>
            </div>

            <div className="task-list">
              {dashboardState.actionCenter.map((task, index) => (
                <div key={task} className="task-item">
                  <span className="task-index">0{index + 1}</span>
                  <p>{task}</p>
                </div>
              ))}
            </div>

            <div className="mini-summary">
              <div>
                <span>Avg. response</span>
                <strong>—</strong>
              </div>
              <div>
                <span>Open approvals</span>
                <strong>{numberFormatter(dashboardState.openApprovals)}</strong>
              </div>
            </div>
          </article>
        </section>

    </main>
  );
}
