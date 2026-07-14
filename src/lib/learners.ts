import { pool } from '@/db/pool';

export interface UpsertLearnerInput {
  oidcSub: string;
  email: string | null;
  displayName: string | null;
  picture: string | null;
}

export interface ProvisionedLearner {
  id: number;
  activeCourseId: number | null;
}

/**
 * Auto-provision (first login) or refresh (later logins) a learner keyed on the
 * stable OIDC `sub`. On insert, defaults active_course_id to the ar-leb course
 * if it exists. Called once per sign-in from the NextAuth jwt callback.
 */
export async function upsertLearner(p: UpsertLearnerInput): Promise<ProvisionedLearner> {
  const { rows } = await pool.query<{ id: number; active_course_id: number | null }>(
    `INSERT INTO learner (name, oidc_sub, email, display_name, picture, active_course_id)
     VALUES (
       COALESCE($2, 'learner'), $1, $2, $3, $4,
       (SELECT id FROM course WHERE code = 'ar-leb')
     )
     ON CONFLICT (oidc_sub) WHERE oidc_sub IS NOT NULL DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           picture = EXCLUDED.picture
     RETURNING id, active_course_id`,
    [p.oidcSub, p.email, p.displayName, p.picture],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertLearner returned no row');
  return { id: row.id, activeCourseId: row.active_course_id };
}
