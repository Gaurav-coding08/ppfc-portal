import { describe, expect, it } from 'vitest';
import { listQuery, toPageMeta } from '../../src/lib/pagination.js';

describe('listQuery', () => {
  const schema = listQuery({ sortable: ['name', 'created_at', 'status'] });

  it('applies defaults for missing fields', () => {
    const result = schema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.order).toBe('asc');
    expect(result.sort).toBeUndefined();
  });

  it('coerces string numbers to integers', () => {
    const result = schema.parse({ page: '3', pageSize: '50' });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it('rejects unknown sort column', () => {
    expect(() => schema.parse({ sort: 'hacked_column' })).toThrow();
  });

  it('accepts a valid sort column', () => {
    const result = schema.parse({ sort: 'name', order: 'desc' });
    expect(result.sort).toBe('name');
    expect(result.order).toBe('desc');
  });

  it('caps pageSize at 100', () => {
    expect(() => schema.parse({ pageSize: '101' })).toThrow();
  });

  it('rejects page < 1', () => {
    expect(() => schema.parse({ page: '0' })).toThrow();
  });

  it('rejects invalid order', () => {
    expect(() => schema.parse({ order: 'sideways' })).toThrow();
  });
});

describe('toPageMeta', () => {
  it('returns correct meta shape', () => {
    const meta = toPageMeta({ page: 2, pageSize: 20, order: 'asc' as const }, 55);
    expect(meta).toEqual({ page: 2, pageSize: 20, total: 55 });
  });
});
