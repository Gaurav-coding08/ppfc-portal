import pg from 'pg';
import supertest from 'supertest';
import { buildApp } from '../../src/app.js';
import { DEMO_PASSWORD } from '../../scripts/generate/users.js';

export interface LoggedInUser {
  token: string;
  // A persistent-cookie supertest agent, already carrying the ppfc_token
  // cookie Set-Cookie'd by this login — later requests on it stay signed
  // in without resending credentials.
  agent: ReturnType<typeof supertest.agent>;
  user: { id: number; email: string; fullName: string; role: string; departmentId: number | null };
}

// Logs in through the real HTTP endpoint (not a DB shortcut), so every test
// that uses this helper is exercising the actual auth flow it's asserting
// other behaviour on top of.
export async function loginAs(email: string, password = DEMO_PASSWORD): Promise<LoggedInUser> {
  const agent = supertest.agent(buildApp());
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.data.token as string, agent, user: res.body.data.user };
}

async function withTestClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const connString = process.env.DATABASE_URL_TEST;
  if (!connString) throw new Error('DATABASE_URL_TEST is not set');

  const client = new pg.Client({ connectionString: connString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// One seeded project whose owning PM, at least one contributor member, and
// at least one non-member contributor can all be resolved — the shared
// fixture for the four role-based helpers below. Queried (not hard-coded)
// so it keeps working if the generator's data ever changes, and memoized
// since the seeded IDs are stable across a test run (resetDb() reloads the
// same deterministic CSVs every time).
interface FixtureProject {
  projectId: number;
  projectCode: string;
  pmEmail: string;
  memberEmail: string;
  nonMemberEmail: string;
}

let fixtureProjectPromise: Promise<FixtureProject> | null = null;

async function resolveFixtureProject(): Promise<FixtureProject> {
  if (!fixtureProjectPromise) {
    fixtureProjectPromise = withTestClient(async (client) => {
      const { rows: projects } = await client.query<{ id: number; code: string; owner_email: string }>(
        `SELECT p.id, p.code, u.email AS owner_email
         FROM projects p
         JOIN users u ON u.id = p.owner_id
         WHERE u.role = 'project_manager'
         ORDER BY p.id`,
      );

      for (const project of projects) {
        const { rows: members } = await client.query<{ email: string }>(
          `SELECT u.email FROM project_members pm
           JOIN users u ON u.id = pm.user_id
           WHERE pm.project_id = $1 AND u.role = 'contributor'
           ORDER BY u.id LIMIT 1`,
          [project.id],
        );
        if (members.length === 0) continue;

        const { rows: nonMembers } = await client.query<{ email: string }>(
          `SELECT u.email FROM users u
           WHERE u.role = 'contributor'
             AND u.id NOT IN (SELECT user_id FROM project_members WHERE project_id = $1)
           ORDER BY u.id LIMIT 1`,
          [project.id],
        );
        if (nonMembers.length === 0) continue;

        return {
          projectId: project.id,
          projectCode: project.code,
          pmEmail: project.owner_email,
          memberEmail: members[0]!.email,
          nonMemberEmail: nonMembers[0]!.email,
        };
      }

      throw new Error('No seeded project has both a contributor member and a non-member contributor');
    });
  }
  return fixtureProjectPromise;
}

export async function asAdmin(): Promise<LoggedInUser> {
  const email = await withTestClient(async (client) => {
    const { rows } = await client.query<{ email: string }>(
      `SELECT email FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`,
    );
    if (!rows[0]) throw new Error('No seeded admin user found');
    return rows[0].email;
  });
  return loginAs(email);
}

export async function asProjectManager(): Promise<LoggedInUser & { projectId: number; projectCode: string }> {
  const fixture = await resolveFixtureProject();
  const logged = await loginAs(fixture.pmEmail);
  return { ...logged, projectId: fixture.projectId, projectCode: fixture.projectCode };
}

// A contributor who is a member of asProjectManager()'s project.
export async function asProjectMember(): Promise<LoggedInUser> {
  const fixture = await resolveFixtureProject();
  return loginAs(fixture.memberEmail);
}

// A contributor who is NOT a member of asProjectManager()'s project.
export async function asNonMember(): Promise<LoggedInUser> {
  const fixture = await resolveFixtureProject();
  return loginAs(fixture.nonMemberEmail);
}
