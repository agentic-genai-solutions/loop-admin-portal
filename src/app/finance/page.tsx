'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState, TableSkeleton } from '@/components/Loaders';
import { apiFetchWithRetry } from '@/lib/api';

type PayrollRow = {
  id: string;
  entity: string;
  owner: string;
  status: 'Active' | 'Pending Review' | 'Approved' | 'Paid';
  budget: string;
};

export default function FinancePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState({ openPayrollItems: 0, approvalRate: 0, auditExceptions: 0 });
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [sortBy, setSortBy] = useState<'entity' | 'owner' | 'status' | 'budget'>('entity');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const loadFinanceData = async () => {
      setIsLoading(true);

      try {
        const [payrollReport, payrollEntries] = await Promise.all([
          apiFetchWithRetry<{ totalPayroll?: number; approved?: number; pending?: number; paid?: number }>('/director/reports/payroll'),
          apiFetchWithRetry<Array<{ _id?: string; employeeId?: string; status?: string; netSalary?: number; baseSalary?: number }>>('/director/payroll').catch(() => []),
        ]);

        const openPayrollItems = payrollReport?.pending ?? 0;
        const approvalRate = payrollReport && (payrollReport.approved ?? 0) + (payrollReport.pending ?? 0) + (payrollReport.paid ?? 0) > 0
          ? Math.round((((payrollReport.approved ?? 0) + (payrollReport.paid ?? 0)) / Math.max((payrollReport.approved ?? 0) + (payrollReport.pending ?? 0) + (payrollReport.paid ?? 0), 1)) * 100)
          : 0;

        const mappedRows: PayrollRow[] = Array.isArray(payrollEntries)
          ? payrollEntries.map((entry) => {
              const amount = Number(entry.netSalary ?? entry.baseSalary ?? 0);
              const statusValue = String(entry.status ?? 'draft').toLowerCase();
              const status: PayrollRow['status'] = statusValue === 'approved'
                ? 'Approved'
                : statusValue === 'paid'
                  ? 'Paid'
                  : statusValue === 'draft'
                    ? 'Pending Review'
                    : 'Active';

              return {
                id: entry._id ?? entry.employeeId ?? `${entry.employeeId ?? 'payroll'}-${amount}`,
                entity: entry.employeeId ?? 'Employee',
                owner: entry.employeeId ?? 'Finance Team',
                status,
                budget: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount),
              };
            })
          : [];

        setSummary({
          openPayrollItems,
          approvalRate,
          auditExceptions: Math.max(0, openPayrollItems),
        });
        setRows(mappedRows);
      } catch {
        setSummary({ openPayrollItems: 0, approvalRate: 0, auditExceptions: 0 });
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadFinanceData();
  }, []);

  const formattedRows = useMemo(() => {
    const parseBudget = (value: string) => {
      const numeric = Number(value.replace(/[^0-9.-]+/g, ''));
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    return [...rows].sort((first, second) => {
      const comparison = sortBy === 'budget'
        ? parseBudget(first.budget) - parseBudget(second.budget)
        : String(first[sortBy]).localeCompare(String(second[sortBy]), undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [rows, sortBy, sortDirection]);

  const handleSort = (column: 'entity' | 'owner' | 'status' | 'budget') => {
    if (sortBy === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection('asc');
  };

  const getSortArrow = (column: 'entity' | 'owner' | 'status' | 'budget') => {
    if (sortBy !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 28 }}>
      <h1 style={{ marginBottom: 18, fontSize: 30, letterSpacing: '-0.04em' }}>Finance & Payroll Oversight</h1>
      <div className="row" style={{ marginBottom: 20 }}>
        <div className="card metric-card" style={{ flex: '1 1 220px', padding: '18px 20px' }}>
          <span className="metric-icon">🧾</span>
          <div className="metric-body">
            <span className="metric-title">Open Payroll Items</span>
            <span className="metric-value">{summary.openPayrollItems}</span>
            <span className="metric-meta"><strong className="warning">Needs review</strong></span>
          </div>
        </div>
        <div className="card metric-card" style={{ flex: '1 1 220px', padding: '18px 20px' }}>
          <span className="metric-icon">✅</span>
          <div className="metric-body">
            <span className="metric-title">Approval Rate</span>
            <span className="metric-value">{summary.approvalRate}%</span>
            <span className="metric-meta"><strong className="info">Healthy</strong></span>
          </div>
        </div>
        <div className="card metric-card" style={{ flex: '1 1 220px', padding: '18px 20px' }}>
          <span className="metric-icon">⚠️</span>
          <div className="metric-body">
            <span className="metric-title">Audit Exceptions</span>
            <span className="metric-value">{summary.auditExceptions}</span>
            <span className="metric-meta"><strong className="warning">Action needed</strong></span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 18, borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 12px 28px rgba(15,23,42,0.04)' }}>
        {isLoading ? (
          <TableSkeleton columns={4} rows={4} />
        ) : formattedRows.length > 0 ? (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="table" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleSort('entity')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Entity {getSortArrow('entity')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('owner')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Owner {getSortArrow('owner')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('status')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Status {getSortArrow('status')}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort('budget')} style={{ border: 'none', background: 'transparent', color: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                      Budget {getSortArrow('budget')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {formattedRows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.entity}</td>
                    <td>{item.owner}</td>
                    <td><span className={`badge ${item.status === 'Approved' || item.status === 'Paid' ? 'success' : item.status === 'Pending Review' ? 'warning' : 'danger'}`}>{item.status}</span></td>
                    <td>{item.budget}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No payroll data found" description="There are no payroll rows available yet from the database." />
        )}
      </div>
    </main>
  );
}
