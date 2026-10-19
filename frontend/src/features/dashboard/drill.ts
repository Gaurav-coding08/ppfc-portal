import type { ReactNode } from 'react';

// What a drill-down drawer should load. Each source (a KPI card, a chart
// bar, a risk-matrix cell) builds one of these with the dashboard filters
// it was itself computed with, so the records in the drawer are exactly
// the rows behind the number that was clicked.
//
// `includeCategory`: whether the source widget honoured the category
// filter (from its meta.appliedFilters). Actual spend KPI ignores it, so
// its drill must too — otherwise "N records" would not reconcile with the
// card.
export type DrillTarget =
  | {
      kind: 'costs';
      params: { drillProjectId?: number; drillCategoryId?: number };
    }
  | {
      kind: 'tasks';
      params: { kind: 'overdue' | 'blocked' | 'all'; ownerId?: number; drillProjectId?: number };
    }
  | {
      kind: 'risks';
      params: { kind: 'high-exposure' | 'cell' | 'all'; probability?: number; impact?: number };
    }
  | {
      kind: 'change-requests';
      params: Record<string, never>;
    };

export type DrillRequest = DrillTarget & {
  /** Drawer heading, e.g. "Actual spend". */
  title: string;
  includeCategory: boolean;
  /**
   * The figure the records should add up to, as the API returned it
   * (e.g. the KPI value or the bar's amount). Shown next to the record
   * count so the KPI can be checked against its rows by eye.
   */
  reconcile?: { label: string; value: ReactNode };
};

export const DRILL_PAGE_SIZE = 20;
