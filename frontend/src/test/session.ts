import { HttpResponse, http } from 'msw';
import { API } from './handlers';
import { server } from './server';

type Role = 'contributor' | 'project_manager' | 'admin';

// Demo users from docs/demo-accounts.md, so test data reads like the seed.
const USERS: Record<Role, { id: number; email: string; fullName: string; departmentId: number }> = {
  admin: { id: 1, email: 'garnet.wiegand@ppfc.demo', fullName: 'Garnet Wiegand', departmentId: 3 },
  project_manager: {
    id: 2,
    email: 'christelle.satterfield@ppfc.demo',
    fullName: 'Christelle Satterfield',
    departmentId: 1,
  },
  contributor: { id: 6, email: 'estell.conroy@ppfc.demo', fullName: 'Estell Conroy', departmentId: 1 },
};

export const sessionUser = USERS;

/** Make `GET /auth/me` return a logged-in session for `role` with the given memberships. */
export function mockSession(
  role: Role,
  memberships: { projectId: number; memberRole: 'manager' | 'contributor' }[] = [],
) {
  server.use(
    http.get(`${API}/auth/me`, () =>
      HttpResponse.json({ data: { user: { ...USERS[role], role }, memberships } }),
    ),
  );
}
