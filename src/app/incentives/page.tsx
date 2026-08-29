'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FeedbackToast } from '@/components/Feedback';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { fetchIncentives } from '@/lib/admin-data';

type IncentiveProgram = { name: string; type: string; payout: string; target: string; status: string };
type StaffIncentiveEntry = { employee: string; program: string; amount: string; period: string; status: string };

const emptySummary = { monthlyPayout: '$0', activePrograms: 0, approvalRate: '0%', staffEntries: 0 };

export default function IncentivesPage() {
  const [programs, setPrograms] = useState<IncentiveProgram[]>([]);
  const [entries, setEntries] = useState<StaffIncentiveEntry[]>([]);
  const [programSortBy, setProgramSortBy] = useState<'name' | 'type' | 'payout' | 'target' | 'status'>('name');
  const [programSortDirection, setProgramSortDirection] = useState<'asc' | 'desc'>('asc');
  const [entrySortBy, setEntrySortBy] = useState<'employee' | 'program' | 'amount' | 'period' | 'status'>('employee');
  const [entrySortDirection, setEntrySortDirection] = useState<'asc' | 'desc'>('asc');
  const [summary, setSummary] = useState(emptySummary);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setHasLoadError(false);
    try {
      const data = await fetchIncentives();
      setPrograms(data.programs);
      setEntries(data.entries);
      setSummary(data.summary);
    } catch {
      setHasLoadError(true);
      showToast('Failed to load incentives after 3 attempts. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedPrograms = useMemo(() => {
    const parseAmount = (value: string) => {
      const numeric = Number(value.replace(/[^0-9.-]+/g, ''));
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    return [...programs].sort((first, second) => {
      const comparison = programSortBy === 'payout'
        ? parseAmount(first.payout) - parseAmount(second.payout)
        : String(first[programSortBy]).localeCompare(String(second[programSortBy]), undefined, { sensitivity: 'base' });
      return programSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [programSortBy, programSortDirection, programs]);

  const sortedEntries = useMemo(() => {
    const parseAmount = (value: string) => {
      const numeric = Number(value.replace(/[^0-9.-]+/g, ''));
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    return [...entries].sort((first, second) => {
      const comparison = entrySortBy === 'amount'
        ? parseAmount(first.amount) - parseAmount(second.amount)
        : String(first[entrySortBy]).localeCompare(String(second[entrySortBy]), undefined, { sensitivity: 'base' });
      return entrySortDirection === 'asc' ? comparison : -comparison;
    });
  }, [entries, entrySortBy, entrySortDirection]);

  const handleProgramSort = (column: 'name' | 'type' | 'payout' | 'target' | 'status') => {
    if (programSortBy === column) {
      setProgramSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setProgramSortBy(column);
    setProgramSortDirection('asc');
  };

  const getProgramSortArrow = (column: 'name' | 'type' | 'payout' | 'target' | 'status') => {
    if (programSortBy !== column) return '↕';
    return programSortDirection === 'asc' ? '↑' : '↓';
  };

  const handleEntrySort = (column: 'employee' | 'program' | 'amount' | 'period' | 'status') => {
    if (entrySortBy === column) {
      setEntrySortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setEntrySortBy(column);
    setEntrySortDirection('asc');
  };

  const getEntrySortArrow = (column: 'employee' | 'program' | 'amount' | 'period' | 'status') => {
    if (entrySortBy !== column) return '↕';
    return entrySortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 28 }}>
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
        <button style={{ padding: '10px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>+ Add Incentive</button>
      </div>

      <div className="row" style={{ marginBottom: 24 }}>
        <div className="card metric-card" style={{ flex: '1 1 200px', padding: '18px 20px' }}>
          <span className="metric-icon">💵</span>
          <div className="metric-body">
            <span className="metric-title">Monthly payout</span>
            <span className="metric-value">{summary.monthlyPayout}</span>
            <span className="metric-meta"><strong className="success">Current cycle</strong></span>
          </div>
        </div>
        <div className="card metric-card" style={{ flex: '1 1 200px', padding: '18px 20px' }}>
          <span className="metric-icon">🏆</span>
          <div className="metric-body">
            <span className="metric-title">Active programs</span>
            <span className="metric-value">{summary.activePrograms}</span>
            <span className="metric-meta"><strong className="info">Running</strong></span>
          </div>
        </div>
        <div className="card metric-card" style={{ flex: '1 1 200px', padding: '18px 20px' }}>
          <span className="metric-icon">📈</span>
          <div className="metric-body">
            <span className="metric-title">Approval rate</span>
            <span className="metric-value">{summary.approvalRate}</span>
            <span className="metric-meta"><strong className="success">On target</strong></span>
          </div>
        </div>
        <div className="card metric-card" style={{ flex: '1 1 200px', padding: '18px 20px' }}>
          <span className="metric-icon">👤</span>
          <div className="metric-body">
            <span className="metric-title">Staff entries</span>
            <span className="metric-value">{summary.staffEntries}</span>
            <span className="metric-meta"><strong className="info">Updated</strong></span>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        <div className="card" style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15,23,42,0.04)' }}>
          <div className="form-grid">
            <label>
              <span>Program name</span>
              <input type="text" placeholder="Retail Sales Sprint" />
            </label>
            <label>
              <span>Program type</span>
              <select defaultValue="">
                <option value="">Select type</option>
                <option value="Store">Store</option>
                <option value="Warehouse">Warehouse</option>
                <option value="Operations">Operations</option>
                <option value="Management">Management</option>
              </select>
            </label>
            <label>
              <span>Bonus amount</span>
              <input type="text" placeholder="$1,200" />
            </label>
            <label>
              <span>Eligibility target</span>
              <input type="text" placeholder="15 sales per store" />
            </label>
            <label>
              <span>Status</span>
              <select defaultValue="">
                <option value="">Select status</option>
                <option value="Active">Active</option>
                <option value="Draft">Draft</option>
                <option value="Paused">Paused</option>
                <option value="Completed">Completed</option>
              </select>
            </label>
            <button className="primary-form-button" type="button">Save program</button>
          </div>
        </div>

        <div className="card">
          <div className="form-grid">
            <label>
              <span>Employee</span>
              <select defaultValue="">
                <option value="">Select employee</option>
                <option value="Imran Khan">Imran Khan</option>
                <option value="Nora Ahmed">Nora Ahmed</option>
                <option value="Javed Ali">Javed Ali</option>
                <option value="Sana Noor">Sana Noor</option>
              </select>
            </label>
            <label>
              <span>Program</span>
              <select defaultValue="">
                <option value="">Select program</option>
                <option value="Retail Sales Sprint">Retail Sales Sprint</option>
                <option value="Warehouse Accuracy Bonus">Warehouse Accuracy Bonus</option>
                <option value="Attendance Reliability">Attendance Reliability</option>
                <option value="Leadership Coaching Bonus">Leadership Coaching Bonus</option>
              </select>
            </label>
            <label>
              <span>Amount</span>
              <input type="text" placeholder="$180" />
            </label>
            <label>
              <span>Period</span>
              <input type="text" placeholder="May 2026" />
            </label>
            <label>
              <span>Status</span>
              <select defaultValue="">
                <option value="">Select status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Review">Review</option>
                <option value="Rejected">Rejected</option>
              </select>
            </label>
            <button className="primary-form-button" type="button">Save entry</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 28, padding: 18, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15,23,42,0.04)' }}>
        {isLoading ? (
          <TableSkeleton columns={5} rows={4} />
        ) : hasLoadError ? (
          <EmptyState variant="error" onRetry={loadData} />
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleProgramSort('name')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Program {getProgramSortArrow('name')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleProgramSort('type')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Type {getProgramSortArrow('type')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleProgramSort('payout')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Payout {getProgramSortArrow('payout')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleProgramSort('target')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Target {getProgramSortArrow('target')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleProgramSort('status')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Status {getProgramSortArrow('status')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPrograms.length > 0 ? (
                  sortedPrograms.map((program) => (
                  <tr key={program.name}>
                    <td>{program.name}</td>
                    <td>{program.type}</td>
                    <td>{program.payout}</td>
                    <td>{program.target}</td>
                    <td>
                      <span className={`badge ${program.status === 'Active' ? 'success' : program.status === 'Draft' ? 'info' : 'warning'}`}>
                        {program.status}
                      </span>
                    </td>
                  </tr>
                  ))
                ) : (
                  <EmptyState colSpan={5} title="No incentive programs found" description="Programs you create will appear here." />
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        {isLoading ? (
          <TableSkeleton columns={5} rows={4} />
        ) : hasLoadError ? (
          <EmptyState variant="error" onRetry={loadData} />
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleEntrySort('employee')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Employee {getEntrySortArrow('employee')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleEntrySort('program')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Program {getEntrySortArrow('program')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleEntrySort('amount')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Amount {getEntrySortArrow('amount')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleEntrySort('period')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Period {getEntrySortArrow('period')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleEntrySort('status')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Status {getEntrySortArrow('status')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length > 0 ? (
                  sortedEntries.map((entry) => (
                  <tr key={`${entry.employee}-${entry.program}`}>
                    <td>{entry.employee}</td>
                    <td>{entry.program}</td>
                    <td>{entry.amount}</td>
                    <td>{entry.period}</td>
                    <td>
                      <span className={`badge ${entry.status === 'Approved' ? 'success' : entry.status === 'Pending' ? 'warning' : 'info'}`}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                  ))
                ) : (
                  <EmptyState colSpan={5} title="No staff incentive entries found" description="Entries you record will appear here." />
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
