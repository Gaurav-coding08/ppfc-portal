import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { describe, test, expect } from 'vitest';
import { buildDataset } from '../../scripts/generate/index.js';
import { writeDataset, TABLE_ORDER } from '../../scripts/generate/csvWriter.js';

function hashFile(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('generate-data determinism', () => {
  test('building and writing the dataset twice yields byte-identical CSVs', () => {
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'ppfc-csv-1-'));
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ppfc-csv-2-'));

    // Two independent calls in the same process — buildDataset() must
    // reseed faker internally each time, or this would fail.
    writeDataset(buildDataset(), dir1);
    writeDataset(buildDataset(), dir2);

    for (const table of TABLE_ORDER) {
      const file1 = path.join(dir1, `${table}.csv`);
      const file2 = path.join(dir2, `${table}.csv`);
      expect(hashFile(file1)).toBe(hashFile(file2));
    }

    fs.rmSync(dir1, { recursive: true, force: true });
    fs.rmSync(dir2, { recursive: true, force: true });
  });
});
