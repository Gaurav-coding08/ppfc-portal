import { describe, expect, it } from 'vitest';
import { describeAction } from './activity';

describe('describeAction', () => {
  it('turns `<entity>.<verb>` audit actions into a readable phrase', () => {
    expect(describeAction({ action: 'project_member.add', entityType: 'project_member' })).toBe(
      'added project member',
    );
  });

  it('handles the bare seeded actions (no entity prefix)', () => {
    expect(describeAction({ action: 'decide', entityType: 'change_request' })).toBe('decided change request');
  });

  it('falls back to the raw action for an unknown verb', () => {
    expect(describeAction({ action: 'task.archive', entityType: 'task' })).toBe('task.archive');
  });
});
