import './globals.css';
import type { Metadata } from 'next';
import AuthGuard from '../components/AuthGuard';

export const metadata: Metadata = {
  title: 'Loop Admin Portal',
  description: 'Enterprise attendance and workforce management dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
