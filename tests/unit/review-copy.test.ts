import { describe, expect, test } from 'vitest';
import { GUILT_DENYLIST, guiltMatches, isGuiltFree, looksLikeAScore } from '@/lib/review-copy';
import { renderReviewEmail, renderReviewText, reviewSubject } from '@/lib/review-email';
import { strings } from '@/lib/strings';
import { assembleReview } from '@/lib/weekly-review';
import { emptyWeek, twoMissedSessions } from './review-fixture';

/**
 * F121's denylist, and the week it exists for.
 *
 * THE PANEL'S FINDING IS THE TEST. Two missed sessions because Thursday ran
 * late is Tuesday, not a failure state. So the fixture walked here is not a
 * clean week: two sessions did not happen, four days of steps are missing,
 * five meals were never decided, and one source has gone quiet. That is the
 * week a product like this is most tempted to editorialise about, and it is
 * the one every string is checked over.
 *
 * A ZERO IS EVIDENCE ONLY BESIDE THE POPULATION IT COVERED. Every assertion
 * that finds nothing prints how many strings it walked first, and the counts
 * are asserted to be non-trivial, so a clean run cannot be a run over an empty
 * review.
 *
 * AND THE MATCHER IS PROVED TO STILL BITE. A denylist that has quietly stopped
 * matching reads exactly like copy that is clean. The positive controls at the
 * bottom feed it the five phrases PLAN.md names and require every one to be
 * caught.
 */

const ORIGIN = 'https://lamberts-mac-mini.tailda76d6.ts.net';

/** Every string a review can put on a screen, from a week with two gaps in it. */
function everyReviewString(): string[] {
  const review = assembleReview(twoMissedSessions());
  const found: string[] = [];
  if (review.fix) found.push(review.fix.title, review.fix.body);
  for (const section of review.sections) {
    found.push(section.title);
    for (const row of section.rows) {
      found.push(row.label);
      if (row.value) found.push(row.value);
      if (row.absence) found.push(row.absence);
      if (row.note) found.push(row.note);
    }
    found.push(...section.paragraphs);
  }
  for (const block of review.proposal) {
    found.push(block.label, block.headline);
    if (block.detail) found.push(block.detail);
    if (block.cause) found.push(block.cause);
  }
  return found;
}

/** Every leaf of `strings.review`, with templates rendered from real arguments. */
function everyCatalogueString(): string[] {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      found.push(node);
      return;
    }
    if (typeof node === 'function') {
      // Templates take one to three arguments, all of which are a date label,
      // a number or a formatted figure in this section. Rendered with real
      // shapes so what is checked is what a screen prints.
      const asFunction = node as (...args: unknown[]) => string;
      const attempts: unknown[][] = [
        ['17 Aug', '23 Aug'],
        [3, 4],
        ['86.4'],
        [3],
        ['silent from 22:00 until 07:00'],
        ['Thursday 20 August', 'Your calendar was full from 18:00 to 23:00.'],
        ['Apple Health', '19 August'],
        [3, 7],
      ];
      for (const args of attempts) {
        try {
          const rendered = asFunction(...args);
          if (typeof rendered === 'string' && rendered !== '') {
            found.push(rendered);
            break;
          }
        } catch {
          // Wrong arity for this template. The next attempt covers it.
        }
      }
      return;
    }
    if (node && typeof node === 'object') {
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(strings.review);
  walk(strings.reminders);
  return found;
}

describe('the assembled review, over a week with two gaps in it', () => {
  test('says nothing on the denylist', () => {
    const walked = everyReviewString();
    const offences = walked.flatMap((text) =>
      guiltMatches(text).map((match) => `"${match.phrase}" in ${JSON.stringify(match.context)}`),
    );
    console.log(`walked ${walked.length} rendered string(s) from a week with two sessions that did not happen`);
    console.log(`denylist holds ${GUILT_DENYLIST.length} phrase(s)`);
    if (offences.length > 0) console.log(offences.join('\n'));
    expect(walked.length).toBeGreaterThan(30);
    expect(offences).toEqual([]);
  });

  test('the catalogue section says nothing on it either', () => {
    const walked = everyCatalogueString();
    const offences = walked.flatMap((text) =>
      guiltMatches(text).map((match) => `"${match.phrase}" in ${JSON.stringify(match.context)}`),
    );
    console.log(`walked ${walked.length} catalogue string(s) under strings.review and strings.reminders`);
    if (offences.length > 0) console.log(offences.join('\n'));
    expect(walked.length).toBeGreaterThan(80);
    expect(offences).toEqual([]);
  });

  test('the email and its plain-text part say nothing on it', () => {
    const review = assembleReview(twoMissedSessions());
    const html = renderReviewEmail(review, ORIGIN);
    const text = renderReviewText(review, ORIGIN);
    const words = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    console.log(`email is ${html.length} bytes, text part is ${text.length} bytes`);
    console.log(`subject: ${reviewSubject(review)}`);
    expect(words.length).toBeGreaterThan(400);
    expect(guiltMatches(words)).toEqual([]);
    expect(guiltMatches(text)).toEqual([]);
    expect(guiltMatches(reviewSubject(review))).toEqual([]);
  });

  test('carries no score anywhere', () => {
    const walked = everyReviewString();
    const scored = walked.filter(looksLikeAScore);
    console.log(`walked ${walked.length} string(s); ${scored.length} read as a score`);
    if (scored.length > 0) console.log(scored.join(' | '));
    expect(walked.length).toBeGreaterThan(30);
    expect(scored).toEqual([]);
    // Adherence is "2 of 4", which is a fraction with its denominator on the
    // screen and is what F118 asks for. A percentage of a plan is a mark out of
    // a hundred whatever it is called, and it is not here.
    const adherence = assembleReview(twoMissedSessions()).sections.find(
      (section) => section.id === 'adherence',
    );
    expect(adherence?.rows[0].value).toBe('2 of 4');
  });
});

describe('no colour on a session that did not happen', () => {
  test('every adherence row is neutral, figure and note alike', () => {
    const review = assembleReview(twoMissedSessions());
    const adherence = review.sections.find((section) => section.id === 'adherence');
    expect(adherence).toBeDefined();
    const rows = adherence?.rows ?? [];
    console.log(
      `walked ${rows.length} adherence row(s): ${rows.map((row) => `${row.id}=${row.tone}/${row.noteTone}`).join(' ')}`,
    );
    // One count row plus one row per session that did not happen. The fixture
    // has two of those, so this walk is not over an empty section.
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.tone === 'neutral')).toBe(true);
    expect(rows.every((row) => row.noteTone === 'neutral')).toBe(true);
  });

  test('a session that did not happen carries its cause and no verdict', () => {
    const review = assembleReview(twoMissedSessions());
    const adherence = review.sections.find((section) => section.id === 'adherence');
    const thursday = adherence?.rows.find((row) => row.id === 'session-thu');
    console.log(`thursday reads: ${thursday?.absence}`);
    expect(thursday?.absence).toContain('did not happen');
    expect(thursday?.absence).toContain('Your calendar was full from 18:00 to 23:00.');
    expect(isGuiltFree(thursday?.absence ?? '')).toBe(true);
  });

  test('a session with no recorded cause says that, rather than inventing one', () => {
    const review = assembleReview(twoMissedSessions());
    const adherence = review.sections.find((section) => section.id === 'adherence');
    const saturday = adherence?.rows.find((row) => row.id === 'session-sat');
    expect(saturday?.absence).toBe('Saturday 22 August did not happen.');
  });

  test('the only warn in the whole review is about data being short', () => {
    const review = assembleReview(twoMissedSessions());
    const warned = review.sections.flatMap((section) =>
      section.rows.filter((row) => row.noteTone === 'warn').map((row) => `${section.id}.${row.id}: ${row.note}`),
    );
    console.log(`rows carrying warn: ${warned.join(' | ') || 'none'}`);
    // Steps and sleep, both read from fewer than seven days in this fixture.
    expect(warned.length).toBeGreaterThan(0);
    expect(warned.every((line) => line.startsWith('activity.') || line.startsWith('sleep.'))).toBe(true);
  });

  test('good is only ever a trend going the way the owner wants', () => {
    const review = assembleReview(twoMissedSessions());
    const good = review.sections.flatMap((section) =>
      section.rows.filter((row) => row.tone === 'good').map((row) => `${section.id}.${row.id}`),
    );
    console.log(`rows carrying good: ${good.join(', ') || 'none'}`);
    expect(good).toEqual(['body.weight', 'body.waist']);
  });
});

describe('the matcher still bites', () => {
  test('the five phrases PLAN.md names are all caught', () => {
    const controls = [
      'You failed to log two days.',
      'You were 300 kcal over your missed target.',
      'You only managed two sessions.',
      'That is behind last week.',
      'Your streak broken after eleven days.',
    ];
    const caught = controls.map((text) => guiltMatches(text).map((match) => match.phrase));
    console.log(`positive controls: ${caught.map((phrases, index) => `${index}=${phrases.join('+')}`).join(' ')}`);
    expect(caught.every((phrases) => phrases.length > 0)).toBe(true);
    expect(controls.every((text) => !isGuiltFree(text))).toBe(true);
  });

  test('word boundaries, so ordinary English is not cried wolf over', () => {
    // "only" inside "commonly" and "score" inside "underscored" are not the
    // words. A matcher that fired on them is a matcher somebody turns off.
    expect(isGuiltFree('This is commonly the case.')).toBe(true);
    expect(isGuiltFree('The point was underscored twice.')).toBe(true);
    // And "missed" on its own is allowed, because screen 11 draws it with a
    // cause beside it. What is banned is "missed target".
    expect(isGuiltFree('Wednesday was missed, your calendar was full 18:00 to 22:30.')).toBe(true);
    expect(isGuiltFree('You were over your missed target again.')).toBe(false);
  });

  test('a score is caught in both of its shapes', () => {
    expect(looksLikeAScore('Adherence 75%')).toBe(true);
    expect(looksLikeAScore('You scored 7 out of 10 this week')).toBe(true);
    expect(looksLikeAScore('3 of 4')).toBe(false);
    expect(looksLikeAScore('5 of 7 days')).toBe(false);
  });
});

describe('a week with nothing in it', () => {
  test('says so, and says nothing on the denylist while doing it', () => {
    const review = assembleReview(emptyWeek());
    const strings = [
      ...review.sections.flatMap((section) => [
        section.title,
        ...section.rows.map((row) => row.absence ?? row.value ?? ''),
        ...section.paragraphs,
      ]),
      ...review.proposal.map((block) => block.headline),
    ].filter((text) => text !== '');
    console.log(`empty week produced ${strings.length} string(s)`);
    console.log(strings.join(' | '));
    expect(strings.length).toBeGreaterThan(15);
    expect(strings.flatMap(guiltMatches)).toEqual([]);
    // Absence is drawn as absence and never as a zero.
    const body = review.sections.find((section) => section.id === 'body');
    expect(body?.rows.every((row) => row.value === null)).toBe(true);
    expect(body?.rows.every((row) => (row.absence ?? '').length > 0)).toBe(true);
  });
});
