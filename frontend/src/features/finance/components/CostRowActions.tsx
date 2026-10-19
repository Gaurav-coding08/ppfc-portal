import { Pencil, Send, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Cost } from '../types';

export interface CostActions {
  onEdit: (cost: Cost) => void;
  onDelete: (cost: Cost) => void;
  onPost: (cost: Cost) => void;
  onReverse: (cost: Cost) => void;
}

// Drafts: edit, delete, post. Posted expenses: reverse only. Reversal
// entries: nothing (a reversal can't itself be reversed).
export function CostRowActions({ cost, actions }: { cost: Cost; actions: CostActions }) {
  const label = cost.description ?? `cost ${cost.id}`;
  if (cost.status === 'draft') {
    return (
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${label}`}
          onClick={() => actions.onEdit(cost)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${label}`}
          onClick={() => actions.onDelete(cost)}
        >
          <Trash2 className="size-4" />
        </Button>
        <Button variant="outline" size="sm" aria-label={`Post ${label}`} onClick={() => actions.onPost(cost)}>
          <Send className="size-4" />
          Post
        </Button>
      </div>
    );
  }
  if (cost.entryType === 'expense') {
    return (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Reverse ${label}`}
          onClick={() => actions.onReverse(cost)}
        >
          <Undo2 className="size-4" />
          Reverse
        </Button>
      </div>
    );
  }
  return null;
}
