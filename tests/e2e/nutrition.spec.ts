import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  ensureScratchOwner,
  projectRoot,
  scratchQuery,
  scratchSignInLink,
  testStack,
  waitForScratch,
} from './host';

/**
 * The nutrition week, the targets and the food table, walked in a browser.
 *
 * IT RUNS ON THE SCRATCH INSTANCE, AND THAT IS A DELIBERATE CHOICE WITH A COST.
 * Everything this file grades needs a write: a target row, a generated week,
 * three meal decisions and a confirmed plan. The owner's install holds his own
 * rules, his own target and whatever week he accepted on Sunday, and driving
 * this at the live origin would overwrite all of it on every run. The precedent
 * is `trend-scratch.spec.ts` and `notices.spec.ts`, both of which moved here for
 * the same reason: the state the line needs cannot be created on the owner's
 * database without damaging it.
 *
 * The cost is the engine. The scratch instance answers on plain loopback HTTP
 * and the session cookie is Secure, which WebKit refuses over http, so this runs
 * in Chrome. What is graded here is layout, copy and arithmetic, all of which
 * are engine-independent; the WebKit walk of the same screens at the live origin
 * belongs to whoever is willing to spend the owner's week on it.
 *
 * WHAT WOULD MAKE THIS GO RED. Every assertion below names the number or the
 * word the rubric names, not a selector's existence: 1849 and 2866 for F80, the
 * word "unknown" and not "0" for F78, a rate refusal that offers 0.89 for F81.
 * A screen that rendered but computed the wrong thing fails here.
 */

const CAPTURES = `${projectRoot}.forge/evidence/slice-9/captures`;

const VIEWPORTS = [
  { name: '393x852', width: 393, height: 852 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(CAPTURES, { recursive: true });
  console.log(testStack('reset'));
  await waitForScratch();
  await ensureScratchOwner();
});

async function signIn(page: Page) {
  await page.goto(scratchSignInLink());
  await page.waitForURL(/\/$/);
  await page.waitForLoadState('networkidle');
}

/**
 * Types a value into a field, one keystroke at a time.
 *
 * NEVER `fill()`. A fill sets the whole value in one input event and passed for
 * four rounds of this project over a field that could not be typed into at all.
 * If what is being proven is that a person can put a number in this box, the
 * test has to put it in the way a person does.
 */
async function typeInto(page: Page, selector: string, value: string) {
  const field = page.locator(selector);
  await field.click();
  await field.press('Meta+A').catch(() => undefined);
  await field.press('Control+A').catch(() => undefined);
  await field.press('Backspace');
  await field.pressSequentially(value, { delay: 15 });
  await expect(field).toHaveValue(value);
}

async function setBody(
  page: Page,
  body: { sex: 'male' | 'female'; age: string; height: string; weight: string; level: string; rate: string },
) {
  await page.goto('/eat/targets');
  await page.waitForLoadState('networkidle');
  await page.locator(`[data-sex="${body.sex}"]`).click();
  await typeInto(page, '#target-age', body.age);
  await typeInto(page, '#target-height', body.height);
  await typeInto(page, '#target-weight', body.weight);
  await page.locator(`[data-level="${body.level}"]`).click();
  await typeInto(page, '#target-rate', body.rate);
}

/** The owner, as GOAL.md and the research note both describe him. */
const OWNER = {
  sex: 'male' as const,
  age: '38',
  height: '183',
  weight: '89.0',
  level: 'light',
  rate: '0.33',
};

test.describe('F80: the daily target computes from Mifflin-St Jeor and a published band', () => {
  test('38 years, male, 183 cm, 89.0 kg gives 1849 resting and 2866 at level 1.55', async ({ page }) => {
    await signIn(page);
    await setBody(page, OWNER);

    const preview = page.locator('[data-card="preview"]');
    await expect(preview).toBeVisible();
    const rmr = Number(await preview.locator('[data-rmr]').getAttribute('data-rmr'));
    const tdee = Number(await preview.locator('[data-tdee]').getAttribute('data-tdee'));
    console.log(`targets: resting ${rmr} kcal, total ${tdee} kcal at PAL 1.55`);
    expect(Math.abs(rmr - 1849)).toBeLessThanOrEqual(1);
    expect(Math.abs(tdee - 2866)).toBeLessThanOrEqual(1);

    // The equation is named on the screen, not implied by the number.
    await expect(page.locator('[data-card="equation"]')).toContainText('Mifflin-St Jeor');
    await expect(page.locator('[data-card="activity"]')).toContainText('1.40 to 1.90');

    await page.screenshot({ path: `${CAPTURES}/targets-mifflin.png`, fullPage: true });
  });

  test('the four activity levels offered are the FAO/WHO/UNU bands and nothing below them', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/eat/targets');
    const levels = page.locator('[data-level]');
    await expect(levels).toHaveCount(4);
    const text = await page.locator('[data-card="activity"]').innerText();
    console.log(`activity card:\n${text}`);
    expect(text).toContain('1.40');
    expect(text).toContain('1.55');
    expect(text).toContain('1.70');
    expect(text).toContain('1.90');
    expect(text).not.toContain('PAL 1.20');
  });
});

test.describe('F81: the three floors, on the screens that enforce them', () => {
  test('a planned loss above 0.89 kg a week is refused and the compliant rate is offered', async ({
    page,
  }) => {
    await signIn(page);
    await setBody(page, { ...OWNER, rate: '1.2' });

    const refusal = page.locator('[data-state="rate-refused"]');
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText('0.89');
    await expect(page.locator('[data-card="preview"]')).toHaveCount(0);
    await page.screenshot({ path: `${CAPTURES}/target-rate-refused.png`, fullPage: true });

    // The only thing offered is a slower rate. There is no confirm control here.
    await expect(refusal.locator('[data-control="confirm-below-floor"]')).toHaveCount(0);
    await refusal.locator('[data-control="use-compliant-rate"]').click();
    await expect(page.locator('#target-rate')).toHaveValue('0.89');
    await expect(page.locator('[data-card="preview"]')).toBeVisible();
  });

  test('a target below 1500 kcal is blocked behind a screen that names a professional', async ({
    page,
  }) => {
    await signIn(page);
    // A smaller, older, sedentary body, so a fully compliant rate still lands
    // under the floor. The rate is the ceiling for 55 kg, so nothing here is
    // refused for being too fast: the floor is what blocks it.
    await setBody(page, {
      sex: 'male',
      age: '60',
      height: '160',
      weight: '55',
      level: 'sedentary',
      rate: '0.55',
    });

    const blocked = page.locator('[data-state="blocked-below-floor"]');
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText('1,500');
    await expect(blocked.locator('[data-professional]')).toContainText('dietitian');
    await expect(blocked.locator('[data-control="confirm-below-floor"]')).toBeVisible();
    await expect(page.locator('[data-card="preview"]')).toHaveCount(0);
    await page.screenshot({ path: `${CAPTURES}/target-blocked-below-floor.png`, fullPage: true });

    // Nothing is stored until the confirmation is given.
    expect(Number(scratchQuery('select count(*) from nutrition_target'))).toBe(0);
  });

  test('a target below the estimated resting figure is allowed and cautioned', async ({ page }) => {
    await signIn(page);
    await setBody(page, { ...OWNER, level: 'sedentary', rate: '0.89' });
    const preview = page.locator('[data-card="preview"]');
    await expect(preview).toBeVisible();
    await expect(preview.locator('[data-caution="below-resting"]')).toBeVisible();
    const caution = await preview.locator('[data-caution="below-resting"]').innerText();
    console.log(`caution: ${caution}`);
    expect(caution).toContain('resting');
    await page.screenshot({ path: `${CAPTURES}/target-below-resting.png`, fullPage: true });
  });
});

test.describe('F86 and C12: the week generates, and each meal is decided on its own', () => {
  test('a target is stored, then a week of breakfasts, weekday lunches and dinners generates', async ({
    page,
  }) => {
    await signIn(page);
    await setBody(page, OWNER);
    await page.locator('[data-control="save-target"]').click();
    await expect(page.locator('[data-target="saved"]')).toBeVisible();
    expect(Number(scratchQuery('select count(*) from nutrition_target'))).toBe(1);

    await typeInto(page, '#generate-max-cook', '60');
    await page.locator('[data-control="generate-week"]').click();
    await page.waitForURL(/\/eat$/);
    await page.waitForLoadState('networkidle');

    const meals = page.locator('[data-meal]');
    const count = await meals.count();
    const breakfasts = Number(
      scratchQuery("select count(*) from planned_meal where slot = 'breakfast'"),
    );
    const lunches = Number(scratchQuery("select count(*) from planned_meal where slot = 'lunch'"));
    const dinners = Number(scratchQuery("select count(*) from planned_meal where slot = 'dinner'"));
    console.log(
      `week: ${count} meal rows on screen, ${breakfasts} breakfasts, ${lunches} lunches, ${dinners} dinners stored`,
    );
    expect(count).toBeGreaterThan(0);
    expect(breakfasts).toBe(7);
    expect(lunches).toBe(5);
    expect(dinners).toBe(7);
  });

  test('every meal row carries energy and all four macronutrients including fibre', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/eat');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-meal]');
    const total = await rows.count();
    expect(total).toBeGreaterThan(0);
    for (let index = 0; index < total; index += 1) {
      const row = rows.nth(index);
      await expect(row.locator('[data-energy]')).toHaveCount(1);
      const macros = row.locator('[data-macros="true"]');
      await expect(macros).toHaveCount(1);
      const text = await macros.innerText();
      // C12 names fibre explicitly, because fibre is the field every other food
      // table drops and this one was chosen for it.
      expect(text).toContain('Fibre');
      // F82: no decimal place on any macronutrient.
      expect(text).not.toMatch(/\d\.\d/);
    }
    console.log(`walked ${total} meal rows, every one carrying five figures`);
  });

  test('accepting, editing and rejecting are three separate decisions on three rows', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/eat');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-meal]');
    const first = await rows.nth(0).getAttribute('data-meal');
    const second = await rows.nth(1).getAttribute('data-meal');
    const third = await rows.nth(2).getAttribute('data-meal');

    await rows.nth(0).locator('[data-control="accept"]').click();
    await page.waitForLoadState('networkidle');
    await rows.nth(1).locator('[data-control="edit"]').click();
    await page.waitForLoadState('networkidle');
    await rows.nth(2).locator('[data-control="reject"]').click();
    await page.waitForLoadState('networkidle');

    const states = scratchQuery(
      `select id || '=' || state from planned_meal where id in ('${first}','${second}','${third}') order by id`,
    );
    console.log(`three decisions:\n${states}`);
    expect(states).toContain('accepted');
    expect(states).toContain('edited');
    expect(states).toContain('rejected');

    // And the rest of the week is untouched: one decision is one decision.
    const stillProposed = Number(
      scratchQuery("select count(*) from planned_meal where state = 'proposed'"),
    );
    expect(stillProposed).toBeGreaterThan(0);
    await page.screenshot({ path: `${CAPTURES}/week-three-decisions.png`, fullPage: true });
  });

  test('two generations at 20 and 60 minutes differ, and neither exceeds its limit', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/eat');
    await page.waitForLoadState('networkidle');

    const at60 = scratchQuery(
      'select string_agg(recipe_id, %s order by day_index, position) from planned_meal'.replace(
        '%s',
        "','",
      ),
    );
    const longest60 = Number(
      scratchQuery(
        'select max(r.cook_minutes) from planned_meal m join recipe r on r.id = m.recipe_id',
      ),
    );

    await typeInto(page, '#max-cook', '20');
    await page.locator('.stickybar .btn.quiet').click();
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');

    const at20 = scratchQuery(
      'select string_agg(recipe_id, %s order by day_index, position) from planned_meal'.replace(
        '%s',
        "','",
      ),
    );
    const longest20 = Number(
      scratchQuery(
        'select max(r.cook_minutes) from planned_meal m join recipe r on r.id = m.recipe_id',
      ),
    );

    console.log(`60 min week longest recipe: ${longest60} min`);
    console.log(`20 min week longest recipe: ${longest20} min`);
    expect(at60.length).toBeGreaterThan(0);
    expect(at20.length).toBeGreaterThan(0);
    expect(at20).not.toBe(at60);
    expect(longest60).toBeLessThanOrEqual(60);
    expect(longest20).toBeLessThanOrEqual(20);
  });

  test('C12: the nutrition week matches screen 08 at three viewports', async ({ page }) => {
    await signIn(page);
    // Put the week back to the limit the screens were designed against.
    await page.goto('/eat');
    await page.waitForLoadState('networkidle');
    await typeInto(page, '#max-cook', '60');
    await page.locator('.stickybar .btn.quiet').click();
    await page.waitForLoadState('networkidle');

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/eat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-card="target"]')).toBeVisible();
      await expect(page.locator('[data-card="rules"]')).toBeVisible();
      await expect(page.locator('[data-meal]').first()).toBeVisible();
      await page.screenshot({
        path: `${CAPTURES}/08-nutrition-week-${viewport.name}.png`,
        fullPage: true,
      });
    }
  });
});

test.describe('F84: no generated menu contains shellfish', () => {
  test('four weeks of stored meals hold no shellfish ingredient, over a walked population', async ({
    page,
  }) => {
    await signIn(page);
    // Four generations, so the walk covers four different weeks rather than one.
    for (const generation of [0, 1, 2, 3]) {
      await page.goto('/eat');
      await page.waitForLoadState('networkidle');
      await typeInto(page, '#max-cook', String(45 + generation));
      await page.locator('.stickybar .btn.quiet').click();
      await page.waitForLoadState('networkidle');

      const walked = scratchQuery(
        `select count(*) from planned_meal m
           join recipe_ingredient i on i.recipe_id = m.recipe_id`,
      );
      const shellfish = scratchQuery(
        `select count(*) from planned_meal m
           join recipe_ingredient i on i.recipe_id = m.recipe_id
           join food f on f.id = i.food_id
          where f.subgroup_code in ('0407','0408')`,
      );
      const available = scratchQuery(
        `select count(distinct r.id) from recipe r
           join recipe_ingredient i on i.recipe_id = r.id
           join food f on f.id = i.food_id
          where f.subgroup_code in ('0407','0408')`,
      );
      console.log(
        `generation ${generation + 1}: ${walked} ingredient lines walked, ` +
          `${available} shellfish recipes in the catalogue, ${shellfish} shellfish lines placed`,
      );
      // A zero is evidence only beside the population it covered.
      expect(Number(walked)).toBeGreaterThan(0);
      expect(Number(available)).toBeGreaterThan(0);
      expect(Number(shellfish)).toBe(0);
    }
  });
});

test.describe('F85: every dairy item offers a lactose-free alternative that recomputes', () => {
  test('the before and after macro sets are both on the screen and they differ', async ({ page }) => {
    await signIn(page);
    await page.goto('/eat');
    await page.waitForLoadState('networkidle');

    const recipeId = scratchQuery(
      `select distinct m.recipe_id from planned_meal m
         join recipe_ingredient i on i.recipe_id = m.recipe_id
        where i.alias_id in ('greek-yoghurt','fromage-blanc','semi-skimmed-milk')
        limit 1`,
    );
    expect(recipeId.length).toBeGreaterThan(0);
    const mealId = scratchQuery(
      `select id from planned_meal where recipe_id = '${recipeId}' order by day_index limit 1`,
    );

    await page.goto(`/eat/recipe/${encodeURIComponent(recipeId)}?meal=${encodeURIComponent(mealId)}`);
    await page.waitForLoadState('networkidle');

    const before = page.locator('[data-macros-set="before"]');
    const after = page.locator('[data-macros-set="after"]');
    await expect(before).toBeVisible();
    await expect(after).toBeVisible();
    const beforeText = await before.innerText();
    const afterText = await after.innerText();
    console.log(`before the swap:\n${beforeText}\nafter the swap:\n${afterText}`);
    expect(beforeText).not.toBe(afterText);

    await page.screenshot({ path: `${CAPTURES}/lactose-free-before-and-after.png`, fullPage: true });

    // And choosing it moves the meal onto the recomputed snapshot.
    const control = page.locator('[data-control="lactose-free"]');
    await expect(control).toBeVisible();
    const wasSnapshot = scratchQuery(`select snapshot_id from planned_meal where id = '${mealId}'`);
    await control.click();
    await page.waitForLoadState('networkidle');
    const nowSnapshot = scratchQuery(`select snapshot_id from planned_meal where id = '${mealId}'`);
    console.log(`snapshot ${wasSnapshot} -> ${nowSnapshot}`);
    expect(nowSnapshot).not.toBe(wasSnapshot);
  });
});

test.describe('F87: the versioned snapshot and its two coverage numbers', () => {
  test('a recipe screen carries provenance, mass coverage and a separate fibre coverage', async ({
    page,
  }) => {
    await signIn(page);
    const recipeId = scratchQuery('select recipe_id from planned_meal order by day_index limit 1');
    await page.goto(`/eat/recipe/${encodeURIComponent(recipeId)}`);
    await page.waitForLoadState('networkidle');

    const card = page.locator('[data-card="per-serving"]');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-fibre-coverage]')).toBeVisible();
    const text = await card.innerText();
    console.log(`per-serving card:\n${text}`);
    expect(text).toContain('Mass covered');
    expect(text).toContain('Fibre covered');
    expect(text).toMatch(/Version \d+/);

    const stored = scratchQuery(
      `select provenance || ' ' || coverage_pct::int || ' ' || fibre_coverage_pct::int || ' ' || source_food_ids_hash
         from recipe_nutrition where recipe_id = '${recipeId}' and superseded_at is null and variant = 'base'`,
    );
    console.log(`stored snapshot: ${stored}`);
    expect(stored.length).toBeGreaterThan(0);
    await page.screenshot({ path: `${CAPTURES}/recipe-snapshot.png`, fullPage: true });
  });

  test('the stored figures cannot be rewritten, so a changed source has to raise a question', async ({
    page,
  }) => {
    await signIn(page);
    const recipeId = scratchQuery('select recipe_id from planned_meal order by day_index limit 1');
    // The database refuses the overwrite outright. This is the half of F87 that
    // no handler can be trusted with, so it is asserted against Postgres.
    const refusal = scratchQuery(
      `do $$ begin
         begin
           update recipe_nutrition set per_serving_kcal = 1 where recipe_id = '${recipeId}';
           raise notice 'the overwrite was accepted';
         exception when others then
           raise notice 'refused: %', sqlerrm;
         end;
       end $$;`,
    );
    console.log(`overwrite attempt: ${refusal}`);
    expect(refusal).toContain('append only');
  });
});

test.describe('F78 and F79: the food table, its publisher, and the two markers', () => {
  test('the data-sources screen names the publisher, the version and the row count', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/eat/data-sources');
    await page.waitForLoadState('networkidle');

    const rows = Number(
      await page.locator('[data-food-rows]').first().getAttribute('data-food-rows'),
    );
    const stored = Number(scratchQuery('select count(*) from food'));
    const allFive = Number(
      scratchQuery(
        `select count(*) from food where kcal_100g is not null and protein_g is not null
           and carb_g is not null and fat_g is not null and fibre_g is not null`,
      ),
    );
    console.log(`food table: ${rows} on screen, ${stored} stored, ${allFive} carrying all five`);
    expect(rows).toBe(stored);
    expect(allFive).toBeGreaterThanOrEqual(2298);

    await expect(page.locator('[data-publisher]')).toContainText('Anses');
    await expect(page.locator('[data-table-version]')).toContainText('ciqual-2025');
    await expect(page.locator('[data-card="ciqual"]')).toContainText('Licence Ouverte');
    await expect(page.locator('[data-card="ciqual"]')).toContainText('not endorsed');
    await page.screenshot({ path: `${CAPTURES}/data-sources.png`, fullPage: true });
  });

  test('a food with no fibre value renders the word and never a zero', async ({ page }) => {
    await signIn(page);
    await page.goto('/eat/data-sources');
    await page.waitForLoadState('networkidle');

    const nullFibre = Number(scratchQuery('select count(*) from food where fibre_g is null'));
    console.log(`food table: ${nullFibre} rows carry no fibre value`);
    expect(nullFibre).toBeGreaterThan(0);

    await page.locator('[data-example="null-fibre"]').click();
    await page.waitForLoadState('networkidle');

    const macros = page.locator('[data-macros="true"]').first();
    const text = await macros.innerText();
    console.log(`food row macros: ${text}`);
    expect(text).toContain('unknown');
    // The fibre cell specifically, so a stray "unknown" elsewhere cannot pass.
    const fibre = macros.locator('[data-macro="Fibre"]');
    await expect(fibre).toContainText('unknown');
    await expect(fibre).not.toContainText('0 g');
    await page.screenshot({ path: `${CAPTURES}/food-unknown-fibre.png`, fullPage: true });
  });

  test('a food whose energy Vernier computed carries the marker one tap from the number', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/eat/data-sources');
    await page.waitForLoadState('networkidle');

    const computed = Number(
      scratchQuery("select count(*) from food where energy_source = 'computed_atwater'"),
    );
    console.log(`food table: ${computed} rows carry an energy Vernier computed`);
    expect(computed).toBeGreaterThan(0);

    await page.locator('[data-example="computed-energy"]').click();
    await page.waitForLoadState('networkidle');

    const flag = page.locator('[data-flag="computed_atwater"]');
    await expect(flag).toBeVisible();
    const computedChip = (await flag.innerText()).trim();
    // One tap: the summary opens the panel on the same screen as the number.
    await flag.click();
    const explanation = await page.locator('[data-card="per-100g"]').innerText();
    console.log(`computed-energy panel:\n${explanation}`);
    expect(explanation).toContain('1169/2011');
    await page.screenshot({ path: `${CAPTURES}/food-computed-energy.png`, fullPage: true });

    /*
     * AND THE OTHER SIDE OF THE COMPARISON, which is the whole of F79.
     *
     * The chip rendered unconditionally, so a food whose energy Anses published
     * wore the same words, the same colour and the same background as one this
     * app computed: the marker marked every food and therefore marked nothing.
     * Both foods are opened here, by the links the data-sources screen offers,
     * and the two chips are read and compared with each other.
     */
    const publishedRows = Number(
      scratchQuery("select count(*) from food where energy_source = 'published'"),
    );
    console.log(`food table: ${publishedRows} rows carry an energy Anses published`);
    expect(publishedRows).toBeGreaterThan(0);

    await page.goto('/eat/data-sources');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-example="published-energy"]').click();
    await page.waitForLoadState('networkidle');

    const publishedFlag = page.locator('[data-flag="published"]');
    await expect(publishedFlag).toBeVisible();
    await expect(page.locator('[data-flag="computed_atwater"]')).toHaveCount(0);
    const publishedChip = (await publishedFlag.innerText()).trim();
    const border = await publishedFlag.evaluate((node) => getComputedStyle(node).borderStyle);
    const computedBorder = 'dashed';
    console.log(
      `computed chip "${computedChip}" against published chip "${publishedChip}", ` +
        `published border ${border}`,
    );
    expect(publishedChip).not.toBe(computedChip);
    expect(border).not.toBe(computedBorder);

    await publishedFlag.click();
    const publishedPanel = await page.locator('[data-card="per-100g"]').innerText();
    console.log(`published-energy panel:\n${publishedPanel}`);
    expect(publishedPanel).not.toContain('1169/2011');
    // The recipe sentence used to ship here, on a screen with no ingredients.
    expect(publishedPanel).not.toContain('ingredient');
    await page.screenshot({ path: `${CAPTURES}/food-published-energy.png`, fullPage: true });
  });
});

test.describe('F83: four rules, four behaviours', () => {
  test('the four kinds are stored apart and each one states what it does', async ({ page }) => {
    await signIn(page);
    await page.goto('/eat/targets');
    await page.waitForLoadState('networkidle');

    const stored = scratchQuery('select kind || %s || subject from dietary_rule order by kind'.replace('%s', "':'"));
    console.log(`stored rules:\n${stored}`);
    expect(stored).toContain('exclusion:shellfish');
    expect(stored).toContain('intolerance:lactose');
    expect(stored).toContain('preference:nuts');

    const card = page.locator('[data-card="rules"]');
    const text = await card.innerText();
    console.log(`rules card:\n${text}`);
    expect(text).toContain('Refused');
    expect(text).toContain('Substituted');
    expect(text).toContain('Omitted');
    expect(text).toContain('Ranked');

    // The database refuses a fifth kind, so the four cannot quietly become five.
    const refusal = scratchQuery(
      `do $$ begin
         begin
           insert into dietary_rule (id, kind, subject) values ('x', 'dislike', 'nuts');
           raise notice 'a fifth kind was accepted';
         exception when others then
           raise notice 'refused: %', sqlerrm;
         end;
       end $$;`,
    );
    console.log(`fifth kind: ${refusal}`);
    expect(refusal).toContain('dietary_rule_kind_is_one_of_four');
  });
});
