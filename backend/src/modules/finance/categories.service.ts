import { withTx } from '../../db/tx.js';
import { businessRule, notFound } from '../../lib/errors.js';
import type { AuthUser } from '../../middleware/authenticate.js';
import * as categoriesRepo from './categories.repository.js';
import type { CategoryRow } from './categories.repository.js';
import type { CreateCategoryBody, UpdateCategoryBody } from './categories.schemas.js';

export async function listCategories(
  caller: AuthUser,
  includeInactive: boolean,
): Promise<CategoryRow[]> {
  // Admin can see inactive; non-admin always gets active only
  const showInactive = caller.role === 'admin' && includeInactive;
  return categoriesRepo.listCategories(showInactive);
}

export async function createCategory(body: CreateCategoryBody): Promise<CategoryRow> {
  return withTx(async (client) => {
    return categoriesRepo.insertCategory(body.code, body.name, client);
  });
}

export async function updateCategory(
  id: number,
  body: UpdateCategoryBody,
): Promise<CategoryRow> {
  return withTx(async (client) => {
    const existing = await categoriesRepo.findCategoryById(id, client);
    if (!existing) throw notFound();

    // Cannot deactivate a category that has draft cost transactions
    if (body.isActive === false && existing.isActive) {
      const hasDrafts = await categoriesRepo.hasDraftCosts(id, client);
      if (hasDrafts) {
        throw businessRule('Cannot deactivate a category used by draft cost transactions');
      }
    }

    const updated = await categoriesRepo.updateCategory(id, body, client);
    return updated!;
  });
}
