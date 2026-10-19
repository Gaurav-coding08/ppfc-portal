import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

// CLAUDE.md design system: "Badges use the soft variant: bg-<color>-50
// text-<color>-700 ring-1 ring-<color>-200." Status is never colour alone
// (WCAG) — callers always pass a text label alongside the tone.
const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-50 text-slate-700 ring-1 ring-slate-200',
  info: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  danger: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
};

export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(TONE_CLASSES[tone], 'border-transparent font-medium', className)}>
      {children}
    </Badge>
  );
}
