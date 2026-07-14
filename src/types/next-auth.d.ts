import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: { learnerId: number; oidcSub: string } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    learnerId?: number;
  }
}
