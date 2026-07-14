import NextAuth, { type NextAuthConfig } from 'next-auth';

const config: NextAuthConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 }, // 30 days
  providers: [
    {
      id: 'oidc',
      name: 'Franca SSO',
      type: 'oidc',
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      authorization: { params: { scope: 'openid profile email' } },
      // checks default to ["pkce","state","nonce"] for oidc — leave as-is.
      // Do NOT pass `wellKnown` (known discovery bug); `issuer` alone is correct.
    },
  ],
  callbacks: {
    // `account` + `profile` are present only on the first call right after a
    // successful sign-in — provision exactly once per sign-in there.
    async jwt({ token, account, profile }) {
      if (account && profile) {
        // Dynamic import: this file is also bundled into the edge middleware
        // (src/middleware.ts re-exports `auth`), and `@/lib/learners` pulls in
        // `pg`, which needs Node's crypto. Sign-in only ever runs in the Node
        // route handler, so deferring the import keeps the edge bundle clean.
        const { upsertLearner } = await import('@/lib/learners');
        const learner = await upsertLearner({
          oidcSub: String(profile.sub),
          email: typeof profile.email === 'string' ? profile.email : null,
          displayName:
            typeof profile.name === 'string'
              ? profile.name
              : typeof profile.preferred_username === 'string'
                ? profile.preferred_username
                : null,
          picture: typeof profile.picture === 'string' ? profile.picture : null,
        });
        token.learnerId = learner.id;
        token.sub = String(profile.sub);
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.learnerId === 'number') session.user.learnerId = token.learnerId;
      session.user.oidcSub = typeof token.sub === 'string' ? token.sub : '';
      return session;
    },
    // Coarse route gate consumed by middleware (Task 4).
    authorized({ auth, request }) {
      if (auth?.user) return true;
      // API routes want a 401 JSON response, not a redirect to sign-in.
      // (/api/auth/* never reaches middleware — excluded by the matcher —
      // but the pathname check is kept for defense in depth.)
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }
      return false;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
