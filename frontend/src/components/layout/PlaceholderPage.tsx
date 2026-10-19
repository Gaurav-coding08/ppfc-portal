import { PageHeader } from './PageHeader';

// CLAUDE.md Part A.7: "Placeholder routes for every later module (empty
// page with title), so navigation is complete from day one." Replaced
// module-by-module as the later parts/milestones build the real page.
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description="This screen hasn't been built yet." />
      <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
        Coming soon.
      </div>
    </div>
  );
}
