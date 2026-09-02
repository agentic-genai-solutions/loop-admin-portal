import type { CSSProperties } from 'react';

export const inlineFieldErrorStyle: CSSProperties = {
  color: '#b91c1c',
};

export const getFieldBorder = (hasError: boolean) => `1px solid ${hasError ? '#dc2626' : 'rgba(148,163,184,.35)'}`;
