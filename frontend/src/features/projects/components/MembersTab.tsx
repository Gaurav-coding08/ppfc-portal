import { Trash2, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/data/EmptyState';
import { DateText } from '@/components/display/DateText';
import { ToneBadge } from '@/components/display/ToneBadge';
import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toastApiError } from '@/lib/notify';
import { useRemoveMember } from '../hooks/useProjectMutations';
import type { ProjectDetail, ProjectMember } from '../types';
import { AddMemberDialog } from './AddMemberDialog';

// Members come embedded in `GET /projects/:id`, so this tab needs no query
// of its own; add/remove invalidate the project, which refetches them.
// `canManage` only decides whether the buttons render — a 403/422 from
// the backend is still shown as a toast if it disagrees.
export function MembersTab({ project, canManage }: { project: ProjectDetail; canManage: boolean }) {
  const members = project.members ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const [toRemove, setToRemove] = useState<ProjectMember | null>(null);
  const remove = useRemoveMember(project.id!);

  async function confirmRemove() {
    if (!toRemove) return;
    try {
      await remove.mutateAsync(toRemove.userId!);
      toast.success(`${toRemove.fullName} removed from the project`);
      setToRemove(null);
    } catch (err) {
      // e.g. 422 "member has open assigned tasks" — keep the dialog's
      // consequence text out of the way and surface the backend reason.
      setToRemove(null);
      toastApiError(err);
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" />
            Add member
          </Button>
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState icon={Users} message="No members yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Project role</TableHead>
                <TableHead>Added</TableHead>
                {canManage && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const isOwner = m.userId === project.owner?.id;
                return (
                  <TableRow key={m.userId}>
                    <TableCell className="font-medium">
                      {m.fullName}
                      {isOwner && (
                        <ToneBadge tone="info" className="ml-2">
                          Owner
                        </ToneBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>{m.memberRole === 'manager' ? 'Manager' : 'Contributor'}</TableCell>
                    <TableCell>
                      <DateText value={m.addedAt ?? null} kind="dateTime" />
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {/* The owner can never be removed (backend 422), so no button. */}
                        {!isOwner && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${m.fullName}`}
                            onClick={() => setToRemove(m)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {canManage && (
        <>
          <AddMemberDialog
            projectId={project.id!}
            existing={members}
            open={addOpen}
            onOpenChange={setAddOpen}
          />
          <ConfirmDialog
            open={toRemove !== null}
            onOpenChange={(open) => !open && setToRemove(null)}
            title="Remove member?"
            description={`${toRemove?.fullName ?? 'This person'} will lose access to ${project.code}. Members with open tasks on this project can't be removed until those tasks are reassigned or done.`}
            confirmLabel="Remove"
            destructive
            pending={remove.isPending}
            onConfirm={confirmRemove}
          />
        </>
      )}
    </div>
  );
}
