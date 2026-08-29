'use client';

import { useEffect, type ReactNode } from 'react';

type ToastType = 'success' | 'error';

export function FeedbackToast({
  title,
  description,
  type,
  onClose,
  durationMs = 3000,
}: {
  title: string;
  description: string;
  type: ToastType;
  onClose: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onClose(), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 2000,
        minWidth: 280,
        padding: '14px 16px',
        borderRadius: 12,
        background: type === 'success' ? '#14532d' : '#7f1d1d',
        color: '#fff',
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.2)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
      role="status"
      aria-live="polite"
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{type === 'success' ? '✅' : '⚠️'}</span>
      <div>
        <div style={{ fontWeight: 800, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.95 }}>{description}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  isProcessing = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  isProcessing?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          background: '#fff',
          borderRadius: 18,
          boxShadow: '0 28px 80px rgba(15, 23, 42, 0.28)',
          border: '1px solid rgba(148,163,184,0.2)',
          padding: 22,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 24 }}>{title}</h2>
        <p style={{ margin: '10px 0 0', color: '#475569', lineHeight: 1.6 }}>{description}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-danger" disabled={isProcessing} onClick={onConfirm}>
            {isProcessing ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
