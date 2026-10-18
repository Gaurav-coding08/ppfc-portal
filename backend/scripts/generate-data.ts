// Writes the deterministic demo dataset to data/csv/*.csv. Re-run any time
// with `npm run data:generate` — same seed, same fixed dates, so the output
// is byte-identical and safe to commit.
import path from 'node:path';
import { buildDataset } from './generate/index.js';
import { writeDataset, rowCounts } from './generate/csvWriter.js';

const outDir = path.resolve(import.meta.dirname, '../../data/csv');
const dataset = buildDataset();
writeDataset(dataset, outDir);

console.log(`Wrote CSVs to ${outDir}`);
for (const [table, count] of Object.entries(rowCounts(dataset))) {
  console.log(`  ${table}: ${count}`);
}
