'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FeedbackToast } from '@/components/Feedback';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { fetchReports } from '@/lib/admin-data';

const emptyReportData = {
  attendance: { totalEmployees: 0, present: 0, late: 0, absent: 0, attendanceRate: 0 },
  leave: { totalLeaveRequests: 0, approved: 0, pending: 0, rejected: 0 },
  payroll: { totalPayroll: 0, totalSundayExtraPay: 0, approved: 0, pending: 0, paid: 0 },
  rows: [] as Array<{ department: string; region: string; active: number; present: number; approvals: number; compliance: string; status: string }>,
};

export default function ReportsPage() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState('All');
  const [status, setStatus] = useState('All');
  const [sortBy, setSortBy] = useState<'department' | 'region' | 'active' | 'present' | 'approvals' | 'compliance' | 'status'>('department');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [reportData, setReportData] = useState(emptyReportData);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setHasLoadError(false);
    try {
      const data = await fetchReports();
      setReportData(data);
    } catch {
      setHasLoadError(true);
      showToast('Failed to load reports after 3 attempts. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const filteredRows = useMemo(() => {
    return reportData.rows.filter((row) => {
      const matchesQuery =
        row.department.toLowerCase().includes(query.toLowerCase()) ||
        row.region.toLowerCase().includes(query.toLowerCase());
      const matchesView = view === 'All' || row.region === view || row.department === view;
      const matchesStatus = status === 'All' || row.status === status;
      return matchesQuery && matchesView && matchesStatus;
    });
  }, [query, view, status, reportData.rows]);

  const sortedRows = useMemo(() => {
    const parseCompliance = (value: string) => {
      const numeric = Number(String(value).replace(/[^0-9.-]+/g, ''));
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    return [...filteredRows].sort((first, second) => {
      let comparison = 0;

      if (sortBy === 'active' || sortBy === 'present' || sortBy === 'approvals') {
        comparison = first[sortBy] - second[sortBy];
      } else if (sortBy === 'compliance') {
        comparison = parseCompliance(first.compliance) - parseCompliance(second.compliance);
      } else {
        comparison = String(first[sortBy]).localeCompare(String(second[sortBy]), undefined, { sensitivity: 'base' });
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRows, sortBy, sortDirection]);

  const handleSort = (column: 'department' | 'region' | 'active' | 'present' | 'approvals' | 'compliance' | 'status') => {
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection('asc');
  };

  const getSortArrow = (column: 'department' | 'region' | 'active' | 'present' | 'approvals' | 'compliance' | 'status') => {
    if (sortBy !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const reportCards = useMemo(
    () => [
      {
        label: 'Attendance Compliance',
        value: `${(reportData.attendance.attendanceRate || 0).toFixed(1)}%`,
        delta: '+0.0%',
        tone: 'success',
        icon: '📊',
      },
      {
        label: 'Leave Utilization',
        value: `${reportData.leave.totalLeaveRequests || 0}`,
        delta: `${reportData.leave.approved || 0} approved`,
        tone: 'info',
        icon: '🌴',
      },
      {
        label: 'Payroll Total',
        value: `$${(reportData.payroll.totalPayroll || 0).toLocaleString()}`,
        delta: `Sunday extra $${(reportData.payroll.totalSundayExtraPay || 0).toLocaleString()}`,
        tone: 'success',
        icon: '💸',
      },
      {
        label: 'Pending Actions',
        value: `${(reportData.payroll.pending || 0) + (reportData.leave.pending || 0)}`,
        delta: `${reportData.leave.pending || 0} leave / ${(reportData.payroll.pending || 0)} payroll`,
        tone: 'warning',
        icon: '⚡',
      },
    ],
    [reportData],
  );

  const exportCsv = () => {
    const csv = [
      ['Department', 'Region', 'Active Staff', 'Present Today', 'Pending Approvals', 'Compliance', 'Status'],
      ...filteredRows.map((row) => [
        row.department,
        row.region,
        row.active,
        row.present,
        row.approvals,
        row.compliance,
        row.status,
      ]),
    ]
      .map((cols) => cols.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'loop-reports.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    window.alert('PDF export is ready for integration with the reporting backend.');
  };

  return (
    <main style={{ maxWidth: 1300, margin: '0 auto', padding: 28 }}>
      {toast && (
        <FeedbackToast
          title={toast.type === 'success' ? 'Success' : 'Error'}
          description={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          durationMs={3200}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={exportCsv} style={{ padding: '11px 16px', border: '1px solid #dfe6f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 700 }}>
            Export CSV
          </button>
          <button type="button" onClick={exportPdf} style={{ padding: '11px 16px', border: 'none', borderRadius: 10, background: '#111827', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
            Export PDF
          </button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 20 }}>
        {reportCards.map((card) => (
          <div key={card.label} className="card metric-card" style={{ flex: '1 1 220px', padding: '18px 20px' }}>
            <span className="metric-icon">{card.icon}</span>
            <div className="metric-body">
              <span className="metric-title">{card.label}</span>
              <span className="metric-value">{card.value}</span>
              <span className="metric-meta"><strong className={card.tone}>{card.delta}</strong> vs last month</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 24, padding: 18, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15,23,42,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search department or region"
              style={{ minWidth: 220, padding: '10px 12px', borderRadius: 10, border: '1px solid #dfe6f0', background: '#fff' }}
            />

            <select value={view} onChange={(event) => setView(event.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #dfe6f0', background: '#fff' }}>
              <option>All</option>
              <option>Retail Stores</option>
              <option>Warehouse</option>
              <option>Finance</option>
              <option>Leadership</option>
              <option>Support</option>
              <option>North</option>
              <option>Central</option>
              <option>West</option>
              <option>Head Office</option>
              <option>Corporate</option>
              <option>South</option>
            </select>

            <select value={status} onChange={(event) => setStatus(event.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #dfe6f0', background: '#fff' }}>
              <option>All</option>
              <option>Healthy</option>
              <option>Watch</option>
              <option>At Risk</option>
            </select>

          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          {isLoading ? (
            <TableSkeleton columns={7} rows={4} />
          ) : hasLoadError ? (
            <EmptyState variant="error" onRetry={loadReports} />
          ) : (
            <table className="table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleSort('department')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Department {getSortArrow('department')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('region')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Region {getSortArrow('region')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('active')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Active Staff {getSortArrow('active')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('present')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Present Today {getSortArrow('present')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('approvals')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Pending Approvals {getSortArrow('approvals')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('compliance')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Compliance {getSortArrow('compliance')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('status')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Status {getSortArrow('status')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length > 0 ? (
                  sortedRows.map((row) => (
                    <tr key={`${row.department}-${row.region}`}>
                      <td>{row.department}</td>
                      <td>{row.region}</td>
                      <td>{row.active}</td>
                      <td>{row.present}</td>
                      <td>{row.approvals}</td>
                      <td>{row.compliance}</td>
                      <td>
                        <span className={`badge ${row.status === 'Healthy' ? 'success' : row.status === 'Watch' ? 'warning' : 'danger'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyState colSpan={7} title="No report data found" description="No rows match the current search or filters." />
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
