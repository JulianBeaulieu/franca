import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { RegisterServiceWorker } from './register-sw';
import { SettingsProvider } from '@/components/SettingsProvider';
import { getLearnerSettings } from '@/db/repo';
import { DEFAULT_SETTINGS, mergeSettings } from '@/lib/settings';
import { getSessionLearnerId } from '@/lib/session';
import { buildNoFoucScript } from '@/lib/theme-script';

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#58CC02' },
    { media: '(prefers-color-scheme: dark)', color: '#131F24' },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<React.JSX.Element> {
  // Unauthenticated render (e.g. mid sign-in redirect) still has to work, so
  // this uses the nullable session helper and falls back to defaults rather
  // than requireLearner's redirect-on-null.
  const learnerId = await getSessionLearnerId();
  const initialSettings =
    learnerId === null ? DEFAULT_SETTINGS : mergeSettings(await getLearnerSettings(learnerId));

  // Effective theme precedence mirrors the inline script: explicit cookie
  // first, else the DB-resolved settings (`initialSettings.theme`, itself
  // 'system' when unauthenticated/unset), else 'system'. Render the `dark`
  // class server-side only for an explicit 'dark' outcome — 'system' can't be
  // resolved server-side (no prefers-color-scheme), so the inline script
  // resolves it before paint; suppressHydrationWarning covers the class the
  // script may add that React did not render.
  const dbTheme = initialSettings.theme;
  const themeCookie = (await cookies()).get('franca-theme')?.value;
  const effectiveTheme = themeCookie ?? dbTheme;
  const htmlClass = effectiveTheme === 'dark' ? 'dark' : undefined;

  return (
    <html lang="en" className={htmlClass} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: buildNoFoucScript(dbTheme) }} />
      </head>
      <body className="min-h-[100dvh]">
        <SettingsProvider initialSettings={initialSettings}>{children}</SettingsProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
