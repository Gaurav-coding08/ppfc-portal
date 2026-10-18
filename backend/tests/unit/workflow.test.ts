import { describe, expect, test } from 'vitest';
import { nextStatus, type CrAction, type CrStatus } from '../../src/modules/change-requests/changeRequests.workflow.js';

describe('nextStatus — legal transitions', () => {
  const legal: [CrStatus, CrAction, CrStatus][] = [
    ['submitted', 'approve', 'approved'],
    ['submitted', 'reject', 'rejected'],
    ['submitted', 'return', 'returned'],
    ['returned', 'resubmit', 'submitted'],
  ];

  test.each(legal)('%s + %s → %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });
});

describe('nextStatus — illegal transitions', () => {
  const illegal: [CrStatus, CrAction][] = [
    // Terminal states: approved and rejected accept no action
    ['approved', 'approve'],
    ['approved', 'reject'],
    ['approved', 'return'],
    ['approved', 'resubmit'],
    ['rejected', 'approve'],
    ['rejected', 'reject'],
    ['rejected', 'return'],
    ['rejected', 'resubmit'],
    // submitted cannot be resubmitted
    ['submitted', 'resubmit'],
    // returned cannot be approved/rejected/returned
    ['returned', 'approve'],
    ['returned', 'reject'],
    ['returned', 'return'],
  ];

  test.each(illegal)('%s + %s → null', (from, action) => {
    expect(nextStatus(from, action)).toBeNull();
  });
});
