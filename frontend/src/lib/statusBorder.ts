const BORDER_CLASSES: Record<string, string> = {
  active: 'border-l-4 border-l-sky-500',
  planning: 'border-l-4 border-l-slate-300',
  on_hold: 'border-l-4 border-l-amber-400',
  completed: 'border-l-4 border-l-emerald-500',
  cancelled: 'border-l-4 border-l-slate-300',
  // Tasks
  todo: 'border-l-4 border-l-slate-300',
  in_progress: 'border-l-4 border-l-sky-500',
  blocked: 'border-l-4 border-l-rose-500',
  done: 'border-l-4 border-l-emerald-500',
  // Change requests
  submitted: 'border-l-4 border-l-sky-500',
  returned: 'border-l-4 border-l-amber-400',
  approved: 'border-l-4 border-l-emerald-500',
  rejected: 'border-l-4 border-l-rose-500',
  // Costs
  draft: 'border-l-4 border-l-slate-300',
  posted: 'border-l-4 border-l-emerald-500',
  reversed: 'border-l-4 border-l-slate-300',
};

export function statusBorderClass(status: string | null | undefined): string | undefined {
  if (!status) return undefined;
  return BORDER_CLASSES[status];
}
