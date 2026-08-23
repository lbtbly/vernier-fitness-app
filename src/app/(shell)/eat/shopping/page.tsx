import Link from 'next/link';
import { EmptyState } from '@/components/EmptyState';
import { ScreenTitle } from '@/components/ScreenTitle';
import { ShoppingList, type ItemView } from '@/components/ShoppingList';
import { nextWeekStart, readPlan, readPlanMeals } from '@/db/nutrition';
import { readRules } from '@/db/nutrition';
import { readListForPlan, readStock } from '@/db/shopping';
import { getConfig } from '@/lib/config';
import { AISLE_ORDER, aliasById } from '@/lib/food-aliases';
import { daysBetween, longDate, shortDate } from '@/lib/format';
import { quantityText } from '@/lib/shopping';
import { strings } from '@/lib/strings';
import { WarnIcon } from '@/components/icons';

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

  /*
   * The stale state: a list built before the last meal decision.
   *
   * Accepting one more meal after the list was built does not rebuild it, and
   * it should not: the owner may already be in the shop with half of it ticked.
   * What the screen owes him is to say that the list is behind the week, name
   * how far behind, and offer the rebuild rather than doing it under him.
   */
  const meals = await readPlanMeals(plan.id);
  const lastDecision = meals
    .map((meal) => meal.decidedAt)
    .filter((when): when is Date => when !== null)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const stale = lastDecision !== undefined && lastDecision.getTime() > list.builtAt.getTime();
  const staleDays = stale ? Math.max(1, daysBetween(list.builtAt, new Date(), timeZone)) : 0;

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
      {stale ? (
        <div className="banner w" data-state="stale">
          <WarnIcon />
          <div className="grow">
            <p>
              <b>{strings.nutrition.shoppingStaleTitle(staleDays)}</b>
            </p>
            <p className="note warn">{strings.nutrition.shoppingStaleBody}</p>
          </div>
        </div>
      ) : null}
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
