import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { RegisterServiceWorker } from './register-sw';

export const metadata: Metadata = {
  title: 'Franca',
  description: 'Learn Lebanese Arabic',
  appleWebApp: {
    capable: true,
    title: 'Franca',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icons/icon-512.png',
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#58CC02',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-[100dvh]">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
