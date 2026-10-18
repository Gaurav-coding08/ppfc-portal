import { faker } from '@faker-js/faker';
import { PROJECTS } from './projects.js';
import { addDays, atTime } from './dates.js';
import type { CostTransactionRow } from './types.js';

type FixedCost = Omit<CostTransactionRow, 'id' | 'reverses_id' | 'created_at' | 'updated_at'> & {
  reversesFixedIndex?: number;
};

// Every amount here is deliberate, not random: they sum to the exact actual
// spend each project's edge case needs (see docs/data-dictionary.md →
// "Edge-case catalogue"). Do not reorder — `reversesFixedIndex` refers to
// the 0-based position of the expense row a reversal corrects.
const FIXED: FixedCost[] = [
  // --- Project 1 (PRJ-001): no posted spend — drafts only -----------------
  { project_id: 1, category_id: 1, txn_date: '2026-02-10', amount: 5000, description: 'Platform licensing quote', vendor: 'Atlas Software', status: 'draft', entry_type: 'expense', created_by: 2, posted_by: null, posted_at: null },
  { project_id: 1, category_id: 2, txn_date: '2026-04-15', amount: 8000, description: 'Staging environment hosting', vendor: 'Meridian Cloud', status: 'draft', entry_type: 'expense', created_by: 6, posted_by: null, posted_at: null },
  { project_id: 1, category_id: 3, txn_date: '2026-06-20', amount: 3000, description: 'Lab workstation quote', vendor: 'Brightline Hardware', status: 'draft', entry_type: 'expense', created_by: 2, posted_by: null, posted_at: null },

  // --- Project 2 (PRJ-002): near budget, 93.75% utilization ---------------
  { project_id: 2, category_id: 4, txn_date: '2026-01-20', amount: 30000, description: 'Site survey — Phase 1', vendor: 'Northline Consulting', status: 'posted', entry_type: 'expense', created_by: 3, posted_by: 3, posted_at: '2026-01-21T00:00:00Z' },
  { project_id: 2, category_id: 1, txn_date: '2026-02-25', amount: 25000, description: 'Install crew — Phase 1', vendor: 'Northline Consulting', status: 'posted', entry_type: 'expense', created_by: 7, posted_by: 3, posted_at: '2026-02-26T00:00:00Z' },
  { project_id: 2, category_id: 2, txn_date: '2026-04-05', amount: 20000, description: 'Switch firmware licensing', vendor: 'Vantage Networks', status: 'posted', entry_type: 'expense', created_by: 3, posted_by: 3, posted_at: '2026-04-06T00:00:00Z' },
  { project_id: 2, category_id: 3, txn_date: '2026-05-18', amount: 35000, description: 'Core switch hardware — batch 1', vendor: 'Vantage Networks', status: 'posted', entry_type: 'expense', created_by: 7, posted_by: 3, posted_at: '2026-05-19T00:00:00Z' },
  { project_id: 2, category_id: 4, txn_date: '2026-07-02', amount: 20000, description: 'Install crew — Phase 2', vendor: 'Northline Consulting', status: 'posted', entry_type: 'expense', created_by: 3, posted_by: 3, posted_at: '2026-07-03T00:00:00Z' },
  { project_id: 2, category_id: 1, txn_date: '2026-08-22', amount: 20000, description: 'Install crew — Phase 3', vendor: 'Northline Consulting', status: 'posted', entry_type: 'expense', created_by: 7, posted_by: 3, posted_at: '2026-08-23T00:00:00Z' },
  { project_id: 2, category_id: 2, txn_date: '2026-08-28', amount: 4000, description: 'Monitoring tool quote', vendor: 'Vantage Networks', status: 'draft', entry_type: 'expense', created_by: 3, posted_by: null, posted_at: null },
  { project_id: 2, category_id: 3, txn_date: '2026-09-10', amount: 6000, description: 'Spare parts quote', vendor: 'Vantage Networks', status: 'draft', entry_type: 'expense', created_by: 7, posted_by: null, posted_at: null },

  // --- Project 3 (PRJ-003): forecast to exceed budget (EAC > budget) -----
  { project_id: 3, category_id: 4, txn_date: '2026-03-10', amount: 20000, description: 'ERP upgrade assessment', vendor: 'Keystone Consulting', status: 'posted', entry_type: 'expense', created_by: 4, posted_by: 4, posted_at: '2026-03-11T00:00:00Z' },
  { project_id: 3, category_id: 1, txn_date: '2026-05-14', amount: 15000, description: 'Data migration — batch 1', vendor: 'Keystone Consulting', status: 'posted', entry_type: 'expense', created_by: 8, posted_by: 4, posted_at: '2026-05-15T00:00:00Z' },
  { project_id: 3, category_id: 2, txn_date: '2026-07-08', amount: 20000, description: 'ERP module licensing', vendor: 'Orbis Systems', status: 'posted', entry_type: 'expense', created_by: 4, posted_by: 4, posted_at: '2026-07-09T00:00:00Z' },
  { project_id: 3, category_id: 3, txn_date: '2026-08-30', amount: 15000, description: 'Data migration — batch 2', vendor: 'Keystone Consulting', status: 'posted', entry_type: 'expense', created_by: 8, posted_by: 4, posted_at: '2026-08-31T00:00:00Z' },
  { project_id: 3, category_id: 4, txn_date: '2026-09-05', amount: 5000, description: 'User acceptance testing quote', vendor: 'Keystone Consulting', status: 'draft', entry_type: 'expense', created_by: 4, posted_by: null, posted_at: null },

  // --- Project 4 (PRJ-004): completed project -----------------------------
  { project_id: 4, category_id: 1, txn_date: '2026-01-25', amount: 20000, description: 'Mobile app build — sprint 1-2', vendor: 'Harborline Studio', status: 'posted', entry_type: 'expense', created_by: 2, posted_by: 2, posted_at: '2026-01-26T00:00:00Z' },
  { project_id: 4, category_id: 2, txn_date: '2026-02-20', amount: 15000, description: 'Mobile device management licensing', vendor: 'Orbis Systems', status: 'posted', entry_type: 'expense', created_by: 9, posted_by: 2, posted_at: '2026-02-21T00:00:00Z' },
  { project_id: 4, category_id: 3, txn_date: '2026-04-10', amount: 25000, description: 'Field test devices', vendor: 'Brightline Hardware', status: 'posted', entry_type: 'expense', created_by: 2, posted_by: 2, posted_at: '2026-04-11T00:00:00Z' },
  { project_id: 4, category_id: 4, txn_date: '2026-05-15', amount: 10000, description: 'Field pilot support', vendor: 'Harborline Studio', status: 'posted', entry_type: 'expense', created_by: 9, posted_by: 2, posted_at: '2026-05-16T00:00:00Z' },
  { project_id: 4, category_id: 1, txn_date: '2026-06-25', amount: 10000, description: 'Mobile app build — sprint 9-10', vendor: 'Harborline Studio', status: 'posted', entry_type: 'expense', created_by: 2, posted_by: 2, posted_at: '2026-06-26T00:00:00Z' },

  // --- Project 5 (PRJ-005): no forecast rows (forecastMissing) -----------
  { project_id: 5, category_id: 2, txn_date: '2026-03-12', amount: 10000, description: 'SIEM licensing — pilot', vendor: 'Sentinel Security', status: 'posted', entry_type: 'expense', created_by: 4, posted_by: 4, posted_at: '2026-03-13T00:00:00Z' },
  { project_id: 5, category_id: 3, txn_date: '2026-05-08', amount: 10000, description: 'SOC workstation hardware', vendor: 'Brightline Hardware', status: 'posted', entry_type: 'expense', created_by: 10, posted_by: 4, posted_at: '2026-05-09T00:00:00Z' },
  { project_id: 5, category_id: 4, txn_date: '2026-07-20', amount: 12000, description: 'Managed detection retainer — Q3', vendor: 'Sentinel Security', status: 'posted', entry_type: 'expense', created_by: 4, posted_by: 4, posted_at: '2026-07-21T00:00:00Z' },
  { project_id: 5, category_id: 1, txn_date: '2026-08-14', amount: 8000, description: 'SOC analyst onboarding', vendor: 'Sentinel Security', status: 'posted', entry_type: 'expense', created_by: 10, posted_by: 4, posted_at: '2026-08-15T00:00:00Z' },
  { project_id: 5, category_id: 2, txn_date: '2026-09-02', amount: 6000, description: 'SIEM licensing — expansion quote', vendor: 'Sentinel Security', status: 'draft', entry_type: 'expense', created_by: 4, posted_by: null, posted_at: null },

  // --- Project 6 (PRJ-006): has a reversal entry --------------------------
  { project_id: 6, category_id: 3, txn_date: '2026-04-10', amount: 40000, description: 'Rack hardware — batch 1 (miscoded, see reversal)', vendor: 'Granite Facilities', status: 'posted', entry_type: 'expense', created_by: 4, posted_by: 4, posted_at: '2026-04-11T00:00:00Z' },
  { project_id: 6, category_id: 3, txn_date: '2026-04-20', amount: 40000, description: 'Reversal — rack hardware batch 1 was billed to the wrong project', vendor: 'Granite Facilities', status: 'posted', entry_type: 'reversal', created_by: 4, posted_by: 4, posted_at: '2026-04-21T00:00:00Z', reversesFixedIndex: 26 },
  { project_id: 6, category_id: 4, txn_date: '2026-02-05', amount: 10000, description: 'Migration planning — site survey', vendor: 'Granite Facilities', status: 'posted', entry_type: 'expense', created_by: 11, posted_by: 4, posted_at: '2026-02-06T00:00:00Z' },
  { project_id: 6, category_id: 1, txn_date: '2026-06-18', amount: 12000, description: 'Migration crew — cutover weekend', vendor: 'Granite Facilities', status: 'posted', entry_type: 'expense', created_by: 4, posted_by: 4, posted_at: '2026-06-19T00:00:00Z' },
  { project_id: 6, category_id: 2, txn_date: '2026-08-09', amount: 8000, description: 'DCIM monitoring licensing', vendor: 'Orbis Systems', status: 'posted', entry_type: 'expense', created_by: 11, posted_by: 4, posted_at: '2026-08-10T00:00:00Z' },
  { project_id: 6, category_id: 3, txn_date: '2026-09-01', amount: 5000, description: 'Spare rack unit quote', vendor: 'Granite Facilities', status: 'draft', entry_type: 'expense', created_by: 4, posted_by: null, posted_at: null },

  // --- Project 7 (PRJ-007): plain + 1 posted cost after the cutoff -------
  { project_id: 7, category_id: 4, txn_date: '2026-07-02', amount: 10000, description: 'UX research sprint', vendor: 'Harborline Studio', status: 'posted', entry_type: 'expense', created_by: 2, posted_by: 2, posted_at: '2026-07-03T00:00:00Z' },
  { project_id: 7, category_id: 1, txn_date: '2026-07-20', amount: 8000, description: 'Design system build-out', vendor: 'Harborline Studio', status: 'posted', entry_type: 'expense', created_by: 12, posted_by: 2, posted_at: '2026-07-21T00:00:00Z' },
  { project_id: 7, category_id: 2, txn_date: '2026-08-25', amount: 7000, description: 'Prototyping tool licensing', vendor: 'Orbis Systems', status: 'posted', entry_type: 'expense', created_by: 2, posted_by: 2, posted_at: '2026-08-26T00:00:00Z' },
  { project_id: 7, category_id: 3, txn_date: '2026-10-05', amount: 5000, description: 'Usability lab equipment (posted after the Sep cutoff)', vendor: 'Brightline Hardware', status: 'posted', entry_type: 'expense', created_by: 12, posted_by: 2, posted_at: '2026-10-06T00:00:00Z' },
  { project_id: 7, category_id: 4, txn_date: '2026-08-29', amount: 4000, description: 'Content strategy quote', vendor: 'Harborline Studio', status: 'draft', entry_type: 'expense', created_by: 2, posted_by: null, posted_at: null },

  // --- Project 8 (PRJ-008): plain -----------------------------------------
  { project_id: 8, category_id: 1, txn_date: '2026-05-11', amount: 10000, description: 'IAM rollout — identity provider setup', vendor: 'Sentinel Security', status: 'posted', entry_type: 'expense', created_by: 3, posted_by: 3, posted_at: '2026-05-12T00:00:00Z' },
  { project_id: 8, category_id: 2, txn_date: '2026-06-22', amount: 10000, description: 'SSO licensing', vendor: 'Orbis Systems', status: 'posted', entry_type: 'expense', created_by: 13, posted_by: 3, posted_at: '2026-06-23T00:00:00Z' },
  { project_id: 8, category_id: 3, txn_date: '2026-07-30', amount: 8000, description: 'MFA hardware tokens — pilot batch', vendor: 'Brightline Hardware', status: 'posted', entry_type: 'expense', created_by: 3, posted_by: 3, posted_at: '2026-07-31T00:00:00Z' },
  { project_id: 8, category_id: 4, txn_date: '2026-08-17', amount: 7000, description: 'Access review facilitation', vendor: 'Sentinel Security', status: 'posted', entry_type: 'expense', created_by: 13, posted_by: 3, posted_at: '2026-08-18T00:00:00Z' },
  { project_id: 8, category_id: 1, txn_date: '2026-09-08', amount: 5000, description: 'Access review follow-up quote', vendor: 'Sentinel Security', status: 'draft', entry_type: 'expense', created_by: 3, posted_by: null, posted_at: null },
];

// Projects whose exact posted-spend total feeds a tested financial edge
// case (no spend at all, or a tight 90-99% utilization band). Filler never
// posts a cost against these two — it only ever adds drafts to them, so
// their pinned sums above stay exact. Every other project has no such
// constraint: more posted spend only reinforces its edge case (overrun,
// forecastMissing, the reversal) or has no constraint at all.
const AMOUNT_LOCKED_PROJECT_IDS = new Set([1, 2]);
const FLEXIBLE_PROJECT_IDS = PROJECTS.map((p) => p.id).filter((id) => !AMOUNT_LOCKED_PROJECT_IDS.has(id));
const OWNER_BY_PROJECT_ID = new Map(PROJECTS.map((p) => [p.id, p.owner_id]));

const DRAFT_FILLER_COUNT = 12;
const POSTED_FILLER_COUNT = 36;
const FILLER_VENDORS = ['Atlas Software', 'Meridian Cloud', 'Orbis Systems', 'Brightline Hardware', 'Northline Consulting'];

function fillerTxnDate(i: number, month: number): string {
  const day = String(1 + (i % 27)).padStart(2, '0');
  return `2026-${String(month).padStart(2, '0')}-${day}`;
}

// Extra DRAFT entries on the two amount-locked projects — never posted, so
// they can't disturb the "no posted spend" / "near budget" fixtures.
function buildDraftFiller(startId: number): CostTransactionRow[] {
  const rows: CostTransactionRow[] = [];
  for (let i = 0; i < DRAFT_FILLER_COUNT; i++) {
    const projectId = i < DRAFT_FILLER_COUNT / 2 ? 1 : 2;
    const month = (i % 9) + 1;
    const txnDate = fillerTxnDate(i, month);
    const createdAt = atTime(txnDate, '08:00:00');
    rows.push({
      id: startId + i,
      project_id: projectId,
      category_id: (i % 4) + 1,
      txn_date: txnDate,
      amount: 500 + ((i * 137) % 8000),
      description: faker.commerce.productName(),
      vendor: FILLER_VENDORS[i % FILLER_VENDORS.length]!,
      status: 'draft',
      entry_type: 'expense',
      reverses_id: null,
      created_by: OWNER_BY_PROJECT_ID.get(projectId)!,
      posted_by: null,
      posted_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    });
  }
  return rows;
}

// POSTED filler on the flexible projects, cycling month = (i % 9) + 1 so
// every calendar month from January through September gets several posted
// rows regardless of what the pinned fixtures above happen to cover —
// that's what guarantees "posted spend in every month Jan-Sep" overall.
function buildPostedFiller(startId: number): CostTransactionRow[] {
  const rows: CostTransactionRow[] = [];
  for (let i = 0; i < POSTED_FILLER_COUNT; i++) {
    const projectId = FLEXIBLE_PROJECT_IDS[i % FLEXIBLE_PROJECT_IDS.length]!;
    const month = (i % 9) + 1;
    const txnDate = fillerTxnDate(i, month);
    const postedAt = atTime(addDays(txnDate, 1));
    const createdAt = atTime(txnDate, '08:00:00');
    rows.push({
      id: startId + i,
      project_id: projectId,
      category_id: (i % 4) + 1,
      txn_date: txnDate,
      amount: 800 + ((i * 193) % 9000),
      description: faker.commerce.productName(),
      vendor: FILLER_VENDORS[(i + 2) % FILLER_VENDORS.length]!,
      status: 'posted',
      entry_type: 'expense',
      reverses_id: null,
      created_by: OWNER_BY_PROJECT_ID.get(projectId)!,
      posted_by: OWNER_BY_PROJECT_ID.get(projectId)!,
      posted_at: postedAt,
      created_at: createdAt,
      updated_at: postedAt,
    });
  }
  return rows;
}

export function buildCostTransactions(): CostTransactionRow[] {
  const fixedIds: number[] = [];
  const fixedRows: CostTransactionRow[] = FIXED.map((row, i) => {
    const id = i + 1;
    fixedIds.push(id);
    const { reversesFixedIndex, ...rest } = row;
    const createdAt = atTime(rest.txn_date, '08:00:00');
    return {
      id,
      ...rest,
      reverses_id: reversesFixedIndex !== undefined ? fixedIds[reversesFixedIndex] ?? null : null,
      created_at: createdAt,
      updated_at: rest.posted_at ?? createdAt,
    };
  });

  const draftFiller = buildDraftFiller(fixedRows.length + 1);
  const postedFiller = buildPostedFiller(fixedRows.length + draftFiller.length + 1);
  return [...fixedRows, ...draftFiller, ...postedFiller];
}
