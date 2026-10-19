import { ToneBadge, type Tone } from './ToneBadge';

// Not in CLAUDE.md's fixed status-colour table (that table only covers
// status fields), so this is a reasonable extension of the same soft-badge
// pattern for task priority: severity rises with the tone.
const PRIORITY: Record<string, [Tone, string]> = {
  low: ['neutral', 'Low'],
  medium: ['info', 'Medium'],
  high: ['warning', 'High'],
  critical: ['danger', 'Critical'],
};

export function PriorityBadge({ priority }: { priority: string }) {
  const [tone, label] = PRIORITY[priority] ?? (['neutral', priority] as [Tone, string]);
  return <ToneBadge tone={tone}>{label}</ToneBadge>;
}
