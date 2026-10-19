import { ToneBadge, type Tone } from './ToneBadge';

// CLAUDE.md: "Risk exposure: high (>=15)=danger, medium (8-14)=warning,
// low (<=7)=success." The score→band math is done server-side (the API
// returns `exposure` directly); this only maps the label to its tone.
const EXPOSURE: Record<string, [Tone, string]> = {
  high: ['danger', 'High'],
  medium: ['warning', 'Medium'],
  low: ['success', 'Low'],
};

export function ExposureBadge({ exposure }: { exposure: string }) {
  const [tone, label] = EXPOSURE[exposure] ?? (['neutral', exposure] as [Tone, string]);
  return <ToneBadge tone={tone}>{label}</ToneBadge>;
}
