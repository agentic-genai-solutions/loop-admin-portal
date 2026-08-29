type ButtonLoaderProps = {
  label?: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: () => void;
};

export function ButtonLoader({
  label = 'Loading...',
  loading = false,
  variant = 'primary',
  type = 'button',
  disabled = false,
  onClick,
}: ButtonLoaderProps) {
  const isSecondary = variant === 'secondary';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: '12px 18px',
        borderRadius: 12,
        border: 'none',
        background: isSecondary ? '#e2e8f0' : '#111827',
        color: isSecondary ? '#0f172a' : '#fff',
        fontWeight: 700,
        cursor: disabled || loading ? 'wait' : 'pointer',
        opacity: loading ? 0.72 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {loading && (
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.35)',
            borderTopColor: isSecondary ? '#0f172a' : '#fff',
            display: 'inline-block',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      )}
      {label}
    </button>
  );
}

type TableSkeletonProps = {
  columns: number;
  rows?: number;
};

export function TableSkeleton({ columns, rows = 4 }: TableSkeletonProps) {
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(140px, 1fr))`,
          gap: 12,
          marginBottom: 12,
        }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <div
            key={`header-${index}`}
            style={{
              height: 16,
              borderRadius: 8,
              background: 'linear-gradient(90deg, #e2e8f0 25%, #f8fafc 50%, #e2e8f0 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s ease infinite',
            }}
          />
        ))}
      </div>

      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(140px, 1fr))`,
            gap: 12,
            marginBottom: 12,
          }}
        >
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <div
              key={`cell-${rowIndex}-${columnIndex}`}
              style={{
                height: 18,
                borderRadius: 8,
                background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.4s ease infinite',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ title }: { title: string }) {
  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: 32 }}>
      <div style={{ marginBottom: 18, height: 18, width: 120, borderRadius: 8, background: 'linear-gradient(90deg, #e2e8f0 25%, #f8fafc 50%, #e2e8f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease infinite' }} />
      <div style={{ marginBottom: 24, height: 32, width: 220, borderRadius: 10, background: 'linear-gradient(90deg, #e2e8f0 25%, #f8fafc 50%, #e2e8f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={`${title}-meta-${index}`} style={{ height: 120, borderRadius: 16, background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease infinite' }} />
        ))}
      </div>
      <div style={{ height: 340, borderRadius: 16, background: 'linear-gradient(90deg, #f8fafc 25%, #e2e8f0 50%, #f8fafc 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s ease infinite' }} />
    </main>
  );
}

type EmptyStateProps = {
  variant?: 'empty' | 'error';
  title?: string;
  description?: string;
  colSpan?: number;
  onRetry?: () => void;
};

/** Renders inside a table body (as a full-width row) or standalone, for empty/error data states. */
export function EmptyState({ variant = 'empty', title, description, colSpan, onRetry }: EmptyStateProps) {
  const isError = variant === 'error';
  const resolvedTitle = title ?? (isError ? 'Unable to load data' : 'No data found');
  const resolvedDescription =
    description ?? (isError ? 'We could not reach the server. Please try again.' : 'There is nothing to show here yet.');

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 16px', color: isError ? '#991b1b' : '#667085', textAlign: 'center' }}>
      <span aria-hidden="true" style={{ fontSize: 26 }}>{isError ? '⚠️' : '📭'}</span>
      <strong style={{ fontSize: 15, color: isError ? '#991b1b' : '#334155' }}>{resolvedTitle}</strong>
      <span style={{ fontSize: 13 }}>{resolvedDescription}</span>
      {isError && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{ marginTop: 4, padding: '8px 16px', borderRadius: 10, border: 'none', background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          Retry
        </button>
      )}
    </div>
  );

  if (colSpan) {
    return (
      <tr>
        <td colSpan={colSpan}>{content}</td>
      </tr>
    );
  }

  return content;
}

export function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(148,163,184,0.2)' }}>
      <span style={{ color: '#475569', fontWeight: 700, fontSize: 13 }}>
        Showing {totalItems === 0 ? 0 : (currentPage - 1) * 8 + 1}–{Math.min(currentPage * 8, totalItems)} of {totalItems}
      </span>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} style={{ padding: '8px 12px', borderRadius: 10, background: currentPage === 1 ? '#e2e8f0' : '#fff', color: '#0f172a', border: '1px solid rgba(148,163,184,0.35)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
          Prev
        </button>

        {pageNumbers.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            style={{
              minWidth: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.35)',
              background: page === currentPage ? '#111827' : '#fff',
              color: page === currentPage ? '#fff' : '#0f172a',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {page}
          </button>
        ))}

        <button type="button" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} style={{ padding: '8px 12px', borderRadius: 10, background: currentPage === totalPages ? '#e2e8f0' : '#fff', color: '#0f172a', border: '1px solid rgba(148,163,184,0.35)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
          Next
        </button>
      </div>
    </div>
  );
}
