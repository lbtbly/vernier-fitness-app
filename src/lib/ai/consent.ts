/**
 * The four things this product may ask a model to do, and the switch on each
 * one.
 *
 * FOUR CATEGORIES, FOUR SWITCHES, AND NONE OF THEM IMPLIES ANOTHER. F94 is
 * explicit that photo analysis, menu generation, health explanations and
 * calendar event titles toggle independently, and the reason is that they send
 * different things: a photo of a plate, a list of recipe names, the name of an
 * analyte, and the title of a training session. Somebody who will send a
 * photograph of his lunch may not want the word "HbA1c" leaving the machine,
 * and a single "AI on" switch cannot express that.
 *
 * THE SWITCH IS CHECKED BEFORE THE REQUEST EXISTS, NOT AFTER. `assertConsent`
 * runs above the transport, so with a category off there is no socket, no
 * token count and no ledger row. F94's evidence is a request log, not a screen
 * state, and a check that runs after the call would pass that test while
 * failing the line.
 */

export const AI_CATEGORIES = [
  'photo_analysis',
  'menu_generation',
  'health_explanations',
  'calendar_titles',
] as const;

export type AiCategory = (typeof AI_CATEGORIES)[number];

export function isAiCategory(value: string): value is AiCategory {
  return (AI_CATEGORIES as readonly string[]).includes(value);
}

/** The stored answer, one boolean per category. */
export type ConsentSet = Record<AiCategory, boolean>;

/**
 * Everything off until the owner says otherwise.
 *
 * A default of "on" would mean the first photograph left the machine before the
 * consent screen had ever been read, which is the one thing F94's "before the
 * first send" forbids.
 */
export const CONSENT_DEFAULT: ConsentSet = {
  photo_analysis: false,
  menu_generation: false,
  health_explanations: false,
  calendar_titles: false,
};

/**
 * What each category actually sends, as catalogue keys rather than sentences.
 *
 * The consent screen renders these lists, so the screen cannot drift from the
 * code: a category that starts sending something new has to add a line here,
 * and the line is what the owner reads before he agrees.
 */
export const CATEGORY_SENDS: Record<AiCategory, readonly string[]> = {
  photo_analysis: ['photo', 'mealContext', 'question'],
  menu_generation: ['recipeNames', 'targets', 'rules'],
  health_explanations: ['analyteName', 'unit'],
  calendar_titles: ['sessionKind', 'duration'],
};

/** What never leaves, whatever is switched on. The same list for every category. */
export const NEVER_SENT = ['identity', 'labResults', 'location', 'credentials'] as const;

export function consentOf(row: Partial<ConsentSet> | null | undefined): ConsentSet {
  return {
    photo_analysis: row?.photo_analysis ?? false,
    menu_generation: row?.menu_generation ?? false,
    health_explanations: row?.health_explanations ?? false,
    calendar_titles: row?.calendar_titles ?? false,
  };
}
