// The backend stores notification links as resource paths
// (backend outboxDispatcher.ts):
//   /projects/:projectId/tasks/:taskId
//   /projects/:projectId/change-requests/:crId
// The SPA has no task detail page and shows CRs at /change-requests/:id,
// so each is mapped to the screen that shows that record. Anything else
// gets no link rather than a route that would 404.
export function notificationHref(link: string | null | undefined): string | null {
  if (!link) return null;
  const task = /^\/projects\/(\d+)\/tasks\/\d+$/.exec(link);
  if (task) return `/projects/${task[1]}?tab=tasks`;
  const cr = /^\/projects\/\d+\/change-requests\/(\d+)$/.exec(link);
  if (cr) return `/change-requests/${cr[1]}`;
  return null;
}
