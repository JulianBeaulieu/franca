import { redirect } from 'next/navigation';
import { auth } from '@/auth';

/** API route handlers: learner id or null (caller returns 401 JSON). */
export async function getSessionLearnerId(): Promise<number | null> {
  const session = await auth();
  return session?.user.learnerId ?? null;
}

/** Server Components / Server Actions: throw-to-login when unauthenticated. */
export async function requireLearner(): Promise<{
  learnerId: number;
  oidcSub: string;
  email: string | null;
  displayName: string | null;
  picture: string | null;
}> {
  const session = await auth();
  if (!session?.user.learnerId) redirect('/api/auth/signin');
  return {
    learnerId: session.user.learnerId,
    oidcSub: session.user.oidcSub,
    email: session.user.email ?? null,
    displayName: session.user.name ?? null,
    picture: session.user.image ?? null,
  };
}

/** Server Components: learner id, redirecting to sign-in if unauthenticated. */
export async function requireLearnerId(): Promise<number> {
  return (await requireLearner()).learnerId;
}
