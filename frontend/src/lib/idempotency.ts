// CLAUDE.md "Double submit": a consequential POST generates its
// Idempotency-Key once when the dialog/form opens, and reuses the same key
// on every retry (including a manual resubmit after a failed attempt) so a
// duplicate request replays the original response instead of double-acting.
// `crypto.randomUUID()` is available in every browser this app targets.
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
