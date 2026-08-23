import { once } from '@/db/idempotency';
import {
  addItem,
  clearStock,
  readItem,
  rebuildListsHolding,
  setItemChecked,
  setItemQuantity,
  setItemRemoved,
  setStock,
} from '@/db/shopping';
import { aliasById } from '@/lib/food-aliases';
import { csrfFailure } from '@/lib/csrf';
import { NO_STORE, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * One line of the shopping list, changed.
 *
 * KEYED, BECAUSE THIS IS A WRITE FROM A SHOP. The tick goes through the same
 * offline outbox every other write in this app uses, so it lands on the phone
 * first and uploads on the way out, and a retry whose first response was lost
 * on the way home applies once. A write with no key is refused rather than
 * quietly applied, exactly as /api/log refuses one.
 *
 * A deducted line cannot be ticked, and the refusal says why rather than
 * silently ignoring the tap: the line is already covered by the recipe box or
 * by the cupboard, and it stays on the list so the owner can see that it is.
 */
const HEADER = 'idempotency-key';
const ROUTE = '/api/shopping/item';

export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const key = request.headers.get(HEADER)?.trim();
  if (!key) return refuse(400, strings.api.log.noKey, strings.api.log.noKeyDetail);

  let body: {
    action?: unknown;
    listId?: unknown;
    id?: unknown;
    checked?: unknown;
    quantity?: unknown;
    removed?: unknown;
    aliasId?: unknown;
    inStock?: unknown;
    stockQuantity?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.shopping.bodyDetail);
  }

  const { handled } = await once(key, ROUTE, async () => {
    // The cupboard, which is a fact about the owner's kitchen and not about
    // this week's list. Marked by hand and never inferred.
    if (typeof body.aliasId === 'string' && typeof body.inStock === 'boolean') {
      const alias = aliasById(body.aliasId);
      if (!alias) {
        return {
          handled: {
            status: 404,
            body: { error: strings.api.shopping.noItem, detail: strings.api.shopping.noItemDetail },
          },
          outcome: 'refused' as const,
        };
      }
      if (body.inStock) {
        const quantity = Number(body.stockQuantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return {
            handled: {
              status: 422,
              body: {
                error: strings.api.shopping.badQuantity,
                detail: strings.api.shopping.badQuantityDetail,
              },
            },
            outcome: 'refused' as const,
          };
        }
        await setStock(alias.id, quantity, alias.unit);
      } else {
        await clearStock(alias.id);
      }
      /*
       * And the list is rebuilt, because the cupboard is an input to it.
       *
       * F89 asks that an item marked in stock renders as visibly deducted.
       * `deduction` is decided in `buildShoppingList` when the list is built, so
       * writing `stock_item` and stopping left the line looking exactly as it
       * did before the tap: measured on the scratch instance at box 5, none 32,
       * stock 0 with the row already written. The rebuild is the shipped one and
       * it keeps every tick and every adjusted quantity it can.
       */
      const rebuilt = await rebuildListsHolding(alias.id);
      return {
        handled: {
          status: 200,
          body: { stock: { aliasId: alias.id, inStock: body.inStock }, rebuilt: rebuilt.length },
        },
        outcome: 'applied' as const,
      };
    }

    // A line the owner added by hand. It has no id yet, so it is matched on the
    // list it joins rather than on a row that does not exist.
    if (body.action === 'add') {
      const listId = typeof body.listId === 'string' ? body.listId : '';
      const aliasId = typeof body.aliasId === 'string' ? body.aliasId : '';
      const quantity = Number(body.quantity);
      if (listId === '' || !Number.isFinite(quantity) || quantity <= 0) {
        return {
          handled: {
            status: 422,
            body: {
              error: strings.api.shopping.badQuantity,
              detail: strings.api.shopping.badQuantityDetail,
            },
          },
          outcome: 'refused' as const,
        };
      }
      const added = await addItem(listId, aliasId, quantity);
      if (!added) {
        return {
          handled: {
            status: 404,
            body: { error: strings.api.shopping.noItem, detail: strings.api.shopping.noItemDetail },
          },
          outcome: 'refused' as const,
        };
      }
      return {
        handled: { status: 200, body: { item: { id: added.id, quantity: added.quantity } } },
        outcome: 'applied' as const,
      };
    }

    const id = typeof body.id === 'string' ? body.id : '';
    const item = id === '' ? null : await readItem(id);
    if (!item) {
      return {
        handled: {
          status: 404,
          body: { error: strings.api.shopping.noItem, detail: strings.api.shopping.noItemDetail },
        },
        outcome: 'refused' as const,
      };
    }

    if (typeof body.checked === 'boolean') {
      if (item.deduction !== 'none') {
        return {
          handled: {
            status: 422,
            body: {
              error: strings.api.shopping.deductedNotTickable,
              detail: strings.api.shopping.deductedNotTickableDetail,
            },
          },
          outcome: 'refused' as const,
        };
      }
      const row = await setItemChecked(id, body.checked);
      return {
        handled: { status: 200, body: { item: { id, checked: row?.checked ?? false } } },
        outcome: 'applied' as const,
      };
    }

    if (typeof body.removed === 'boolean') {
      const row = await setItemRemoved(id, body.removed);
      return {
        handled: { status: 200, body: { item: { id, removed: row?.removed ?? false } } },
        outcome: 'applied' as const,
      };
    }

    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        handled: {
          status: 422,
          body: {
            error: strings.api.shopping.badQuantity,
            detail: strings.api.shopping.badQuantityDetail,
          },
        },
        outcome: 'refused' as const,
      };
    }
    const row = await setItemQuantity(id, quantity);
    return {
      handled: { status: 200, body: { item: { id, quantity: row?.quantity ?? quantity } } },
      outcome: 'applied' as const,
    };
  });

  return NextResponse.json(handled.body, { status: handled.status, headers: { ...NO_STORE } });
}
