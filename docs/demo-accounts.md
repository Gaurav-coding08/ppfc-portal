# Demo accounts

Seeded by `npm run data:generate` + `npm run db:import` (feature 03). This table is
generated from the imported CSV data, not hand-typed — regenerate it by re-running the
query below after any change to `backend/scripts/generate/users.ts` or `projects.ts`.

**Password for every seeded user:** `Demo@1234`

> **DEV-ONLY.** The password hash is a fixed bcrypt hash committed to the repo so the
> generated dataset is byte-identical on every run. Never do this for a real deployment —
> production passwords must never be derived from a value hard-coded in source control.

| Email | Role | Department | Projects (member of) |
|---|---|---|---|
| garnet.wiegand@ppfc.demo | admin | Enterprise IT | — |
| christelle.satterfield@ppfc.demo | project_manager | Digital Platforms | PRJ-001, PRJ-004, PRJ-007 |
| lavinia.crist@ppfc.demo | project_manager | Network Engineering | PRJ-002, PRJ-005, PRJ-008 |
| isabell.bradtke@ppfc.demo | project_manager | Enterprise IT | PRJ-003, PRJ-006 |
| anderson.streich@ppfc.demo | project_manager | Digital Platforms | — |
| estell.conroy@ppfc.demo | contributor | Digital Platforms | PRJ-001, PRJ-008 |
| melissa.aufderhar@ppfc.demo | contributor | Network Engineering | PRJ-001, PRJ-002 |
| anabelle.reichertsipes@ppfc.demo | contributor | Enterprise IT | PRJ-001, PRJ-002, PRJ-003 |
| trevion.abbott@ppfc.demo | contributor | Digital Platforms | PRJ-001, PRJ-002, PRJ-003, PRJ-004 |
| cheyenne.deckowmosciski@ppfc.demo | contributor | Network Engineering | PRJ-002, PRJ-003, PRJ-004, PRJ-005 |
| elliott.leffler@ppfc.demo | contributor | Enterprise IT | PRJ-003, PRJ-004, PRJ-005, PRJ-006 |
| adaline.bahringer@ppfc.demo | contributor | Digital Platforms | PRJ-004, PRJ-005, PRJ-006, PRJ-007 |
| einar.moore@ppfc.demo | contributor | Network Engineering | PRJ-005, PRJ-006, PRJ-007, PRJ-008 |
| gregg.beahan@ppfc.demo | contributor | Enterprise IT | PRJ-006, PRJ-007, PRJ-008 |
| eladio.hilllfeest@ppfc.demo | contributor | Digital Platforms | PRJ-007, PRJ-008 |

To regenerate this table from the imported dev DB:

```sql
SELECT u.email, u.role, d.name,
  COALESCE(string_agg(DISTINCT p.code, ', ' ORDER BY p.code), '') AS projects
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN project_members pm ON pm.user_id = u.id
LEFT JOIN projects p ON p.id = pm.project_id
GROUP BY u.id, u.email, u.role, d.name
ORDER BY u.id;
```
