export { auth as middleware } from '@/auth';

export const config = {
  // Everything EXCEPT: auth endpoints, Next internals, static assets, PWA files.
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)',
  ],
};
