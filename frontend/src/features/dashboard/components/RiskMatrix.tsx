import { cn } from '@/lib/cn';
import type { DrillRequest } from '../drill';
import type { RiskMatrixData } from '../types';

// CLAUDE.md: "risk matrix is a CSS grid, not a chart lib." Probability on
// the vertical axis (5 at the top), impact on the horizontal. The API
// returns only non-empty cells, each with its count and exposure band
// (computed in SQL by fn_exposure_band), so empty cells stay neutral
// rather than the browser deriving a band from probability × impact.

const BAND_CLASSES: Record<string, string> = {
  high: 'bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100',
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100',
};
const BAND_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

const LEVELS = [1, 2, 3, 4, 5];

export function RiskMatrix({
  data,
  onDrill,
}: {
  data: RiskMatrixData;
  onDrill: (request: DrillRequest) => void;
}) {
  const cellAt = (probability: number, impact: number) =>
    data.cells.find((c) => c.probability === probability && c.impact === impact);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {/* Vertical axis title */}
        <div className="text-muted-foreground flex w-4 items-center justify-center">
          <span className="-rotate-90 text-xs font-medium whitespace-nowrap">Probability</span>
        </div>
        <div
          className="grid flex-1 grid-cols-[1.5rem_repeat(5,minmax(0,1fr))] gap-1.5"
          role="grid"
          aria-label="Risk matrix: probability by impact"
        >
          {[...LEVELS].reverse().map((probability) => (
            <div key={probability} role="row" className="contents">
              <span
                className="text-muted-foreground flex items-center justify-center text-xs tabular-nums"
                role="rowheader"
              >
                {probability}
              </span>
              {LEVELS.map((impact) => {
                const cell = cellAt(probability, impact);
                if (!cell) {
                  return (
                    <div
                      key={impact}
                      role="gridcell"
                      aria-label={`Probability ${probability}, impact ${impact}: no open risks`}
                      className="text-muted-foreground flex h-12 items-center justify-center rounded-md bg-slate-50 text-xs ring-1 ring-slate-200"
                    >
                      –
                    </div>
                  );
                }
                const label = `Probability ${probability}, impact ${impact}: ${cell.count} open ${cell.count === 1 ? 'risk' : 'risks'}, ${BAND_LABEL[cell.band]} exposure`;
                return (
                  <div key={impact} role="gridcell">
                    <button
                      type="button"
                      aria-label={label}
                      title={label}
                      onClick={() =>
                        onDrill({
                          kind: 'risks',
                          params: { kind: 'cell', probability, impact },
                          title: `Open risks — probability ${probability} × impact ${impact}`,
                          includeCategory: false,
                          reconcile: { label: 'Matrix cell', value: cell.count },
                        })
                      }
                      className={cn(
                        'focus-visible:ring-ring flex h-12 w-full flex-col items-center justify-center rounded-md ring-1 transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        BAND_CLASSES[cell.band],
                      )}
                    >
                      <span className="text-sm font-semibold tabular-nums">{cell.count}</span>
                      <span className="text-[10px] leading-none font-medium">{BAND_LABEL[cell.band]}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          <span aria-hidden />
          {LEVELS.map((impact) => (
            <span key={impact} className="text-muted-foreground text-center text-xs tabular-nums" aria-hidden>
              {impact}
            </span>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground text-center text-xs font-medium">Impact</p>
      <p className="text-xs text-slate-700">
        {data.totalOpenRisks} open {data.totalOpenRisks === 1 ? 'risk' : 'risks'} in total
      </p>
    </div>
  );
}
