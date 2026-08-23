import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ShoppingList, type ItemView } from '@/components/ShoppingList';
import { nextWeekStart, readPlan } from '@/db/nutrition';
import { readRules } from '@/db/nutrition';
import { readListForPlan, readStock } from '@/db/shopping';
import { getConfig } from '@/lib/config';
import { AISLE_ORDER, aliasById } from '@/lib/food-aliases';
import { longDate, shortDate } from '@/lib/format';
import { quantityText } from '@/lib/shopping';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';
export const metadata = { title: strings.nutrition.shoppingTitle };

/**
 * The shopping list, screen 10.
 *
 * ONE CONSOLIDATED WEEK, GROUPED THE WAY THE SHOP IS LAID OUT, with what the
 * recipe box brings and what is already in the cupboard visibly deducted. Every
 * deducted line keeps its place with its original quantity struck through and
 * the reason beside it, because a line that vanishes is a line nobody can
 * check.
 *
 * Five states: the skeleton in loading.tsx, the dashed empty card before a week
 * is confirmed, the error card in error.tsx, the offline line the list component
 * draws from the queue depth, and the stale notice when the list was built from
 * a week confirmed days ago.
 */
export default async function ShoppingPage() {
  const { timeZone } = getConfig();
  const now = new Date();
  const weekStart = nextWeekStart(now, timeZone);
  const plan = await readPlan(weekStart);
  const list = plan ? await readListForPlan(plan.id) : null;
  const [stock, rules] = await Promise.all([readStock(), readRules()]);

  const title = (
    <ScreenTitle
      label={strings.nutrition.weekRange(
        shortDate(weekStart, timeZone),
        shortDate(new Date(weekStart.getTime() + 6 * 86_400_000), timeZone),
      )}
      title={strings.nutrition.shoppingTitle}
      sub={strings.nutrition.shoppingSub}
    />
  );

  if (!plan || !list || list.items.length === 0) {
    return (
      <>
        {title}
        <EmptyState
          label={strings.nutrition.shoppingTitle}
          title={strings.nutrition.shoppingEmptyTitle}
          body={strings.nutrition.shoppingEmptyBody}
          actionLabel={strings.nutrition.confirmWeek}
          actionHref="/eat"
        />
      </>
    );
  }

  const stockByAlias = new Map(stock.map((holding) => [holding.aliasId, holding]));
  const dayLabel = (index: number) =>
    longDate(new Date(weekStart.getTime() + index * 86_400_000), timeZone);

  const items: ItemView[] = list.items.map((item) => {
    const alias = aliasById(item.aliasId);
    const holding = stockByAlias.get(item.aliasId);
    const deductionLabel =
      item.deduction === 'box'
        ? strings.nutrition.deductedBox(dayLabel(item.deductionDayIndex ?? 0))
        : item.deduction === 'stock' && holding
          ? strings.nutrition.deductedStock(
              quantityText({
                quantity: holding.quantity,
                unit: holding.unit,
                countNoun: alias?.countNoun ?? null,
              }),
              shortDate(new Date(), timeZone),
            )
          : null;

    const rounded =
      Math.abs(item.neededQuantity - item.originalQuantity) > 0.001
        ? strings.nutrition.roundedFromTo(
            quantityText({
              quantity: Math.round(item.neededQuantity * 100) / 100,
              unit: item.unit,
              countNoun: item.countNoun,
            }),
            quantityText({ quantity: item.originalQuantity, unit: item.unit, countNoun: item.countNoun }),
          )
        : null;

    return {
      id: item.id,
      aliasId: item.aliasId,
      name: item.name,
      aisle: item.aisle,
      unit: item.unit,
      neededQuantity: item.neededQuantity,
      originalQuantity: item.originalQuantity,
      quantity: item.quantity,
      countNoun: item.countNoun,
      deduction: item.deduction,
      deductionLabel,
      checked: item.checked,
      removed: item.removed,
      step: item.step,
      sources: item.sources.map((source) => ({
        recipeName: source.recipeName,
        when: strings.nutrition.mealLine([
          dayLabel(source.dayIndex),
          strings.nutrition.slots[source.slot as keyof typeof strings.nutrition.slots],
        ]),
        quantity: strings.nutrition.quantityMass(String(Math.round(source.grams)), strings.units.g),
      })),
      roundedNote: rounded,
      inStock: holding !== undefined,
    };
  });

  // The subjects an allergy or an exclusion covers, so the aisle they hit can
  // say why nothing from them is on the list. A preference is not here: it
  // removes nothing, so there is nothing for it to explain.
  const excluded = [...rules.allergy, ...rules.exclusion].map(
    (subject) => strings.nutrition.ruleSubjects[subject],
  );

  return (
    <>
      {title}
      <ShoppingList
        listId={list.listId}
        items={items}
        aisles={[...AISLE_ORDER]}
        excludedSubjects={excluded}
      />
      <p className="note centre" style={{ paddingBottom: 'var(--s5)' }}>
        <Link href="/eat/data-sources">{strings.nutrition.dataSourcesFooter}</Link>
      </p>
    </>
  );
}
