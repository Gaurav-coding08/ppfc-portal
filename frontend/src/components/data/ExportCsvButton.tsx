import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type CsvColumn, downloadCsv, toCsv } from '@/lib/csv';

export function ExportCsvButton<T>({
  rows,
  columns,
  filename,
}: {
  rows: T[] | undefined;
  columns: CsvColumn<T>[];
  filename: string;
}) {
  if (!rows || rows.length === 0) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => downloadCsv(toCsv(rows, columns), filename)}
    >
      <Download className="size-4" />
      Export CSV
    </Button>
  );
}
