import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { DateText } from '@/components/display/DateText';
import { ProgressBar } from '@/components/display/ProgressBar';
import { StatusBadge } from '@/components/display/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ProjectDetail } from '../types';

// CLAUDE.md "Detail pages: header card (code, name, status badge, owner,
// dates, progress bar) + tabs". Progress is the backend's weighted
// progress; delivery status comes from fn_project_delivery_status.
export function ProjectHeaderCard({ project, onEdit }: { project: ProjectDetail; onEdit?: () => void }) {
  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-xs font-medium tabular-nums">{project.code}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {project.status && <StatusBadge domain="project" status={project.status} />}
            {project.deliveryStatus && <StatusBadge domain="delivery" status={project.deliveryStatus} />}
          </div>
        </div>
        {onEdit && (
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="size-4" />
            Edit
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <Meta label="Owner">{project.owner?.fullName ?? '—'}</Meta>
        <Meta label="Department">{project.department?.name ?? '—'}</Meta>
        <Meta label="Start">
          <DateText value={project.startDate ?? null} />
        </Meta>
        <Meta label="End">
          <DateText value={project.endDate ?? null} />
        </Meta>
      </dl>

      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs font-medium">Weighted progress</p>
        <ProgressBar value={project.progressPct ?? null} className="max-w-md" />
      </div>
    </Card>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
