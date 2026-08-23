import { describe, expect, test } from 'vitest';
import { renderReviewEmail, renderReviewText } from '@/lib/review-email';
import { strings } from '@/lib/strings';
import { REVIEW_SECTION_COUNT, REVIEW_SECTION_IDS, assembleReview, weekLabel } from '@/lib/weekly-review';
import { emptyWeek, twoMissedSessions } from './review-fixture';

/**
 * F118: the review holds weight and waist, adherence, activity, sleep,
 * training, nutrition, what went well, what was hard, and the proposal for
 * next week. Nine sections, and they are counted here as a number rather than
 * eyeballed on a capture.
 *
 * ABSENCE IS DRAWN AND NEVER SMOOTHED. A week with no readings prints what is
 * missing where the figure would have been. A figure computed from fewer than
 * seven days carries its count. Neither is a zero, and a zero on this screen
 * would be a claim about a week rather than the absence of one.
 *
 * WHAT WOULD MAKE THIS GO RED. Filling a gap with the last known value, which
 * is what a carry-forward does and what every chart in this product already
 * refuses. The empty-week assertions below walk every row and require an
 * absence sentence on each.
 */

const ORIGIN = 'https://lamberts-mac-mini.tailda76d6.ts.net';

describe('the nine sections', () => {
  test('there are nine, in a fixed order, on a real week', () => {
    const review = assembleReview(twoMissedSessions());
    console.log(`sections: ${review.sections.map((section) => section.id).join(', ')}`);
    expect(REVIEW_SECTION_COUNT).toBe(9);
    expect(review.sections.map((section) => section.id)).toEqual([...REVIEW_SECTION_IDS]);
    expect(review.sections.map((section) => section.title)).toEqual(
      Object.values(strings.review.sections),
    );
  });

  test('there are still nine on a week with nothing in it', () => {
    const review = assembleReview(emptyWeek());
    expect(review.sections).toHaveLength(9);
    // Every section has something to say, even when the answer is that there
    // is nothing. A section that vanished would be a screen whose shape depends
    // on the data, which is the geometry rule screen 00 fixes.
    for (const section of review.sections) {
      expect(section.rows.length + section.paragraphs.length).toBeGreaterThan(0);
    }
  });

  test('the week runs Monday to Sunday and names the next one', () => {
    const review = assembleReview(twoMissedSessions());
    expect(review.weekStart).toBe('2026-08-17');
    expect(review.weekEnd).toBe('2026-08-23');
    expect(review.nextWeekStart).toBe('2026-08-24');
    console.log(`label: ${weekLabel(review)}`);
    expect(weekLabel(review)).toBe('17 Aug to 23 Aug');
  });
});

describe('what each section says on a real week', () => {
  const review = assembleReview(twoMissedSessions());
  const section = (id: string) => review.sections.find((entry) => entry.id === id);

  test('weight and waist, with the change over the week and the goal line', () => {
    const rows = section('body')?.rows ?? [];
    console.log(rows.map((row) => `${row.id}: ${row.value ?? row.absence} (${row.note ?? ''})`).join(' | '));
    expect(rows.find((row) => row.id === 'weight')?.value).toBe('86.4 kg');
    expect(rows.find((row) => row.id === 'waist')?.value).toBe('98.0 cm');
    expect(rows.find((row) => row.id === 'goal-line')).toBeDefined();
  });

  test('adherence is a fraction with its denominator, never a percentage', () => {
    expect(section('adherence')?.rows[0].value).toBe('2 of 4');
  });

  test('activity states the days it was read from, because it is short', () => {
    const row = section('activity')?.rows[0];
    console.log(`activity: ${row?.value} (${row?.note})`);
    expect(row?.value).toContain('a day');
    expect(row?.note).toBe(strings.review.shortWindow(3, 7));
    expect(row?.noteTone).toBe('warn');
  });

  test('sleep renders as hours and minutes, in the shape the app uses elsewhere', () => {
    const row = section('sleep')?.rows[0];
    console.log(`sleep: ${row?.value}`);
    expect(row?.value).toMatch(/\d+ h \d\d/);
  });

  test('training counts sets and the movements they were across', () => {
    expect(section('training')?.rows[0].value).toBe('6 sets across 3 movements');
  });

  test('nutrition reads the plan that exists rather than a food log that does not', () => {
    const rows = section('nutrition')?.rows ?? [];
    expect(rows.find((row) => row.id === 'meals')?.value).toBe('9 of 14');
    expect(rows.find((row) => row.id === 'target')?.value).toBe('2,150 kcal');
  });

  test('what went well is derived from facts, one line each', () => {
    const lines = section('wentWell')?.paragraphs ?? [];
    console.log(lines.join(' | '));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toBe('2 sessions happened this week.');
  });

  test('what was hard names the cause and never the person', () => {
    const lines = section('wasHard')?.paragraphs ?? [];
    console.log(lines.join(' | '));
    expect(lines.some((line) => line.includes('did not happen'))).toBe(true);
    expect(lines.some((line) => line.includes('has sent nothing since'))).toBe(true);
  });

  test('the proposal is three blocks, each with its own state', () => {
    expect(review.proposal.map((block) => block.id)).toEqual([
      'training',
      'nutrition',
      'shopping',
    ]);
    expect(review.proposal.every((block) => block.state === 'proposed')).toBe(true);
    expect(review.proposal[0].headline).toBe('3 sessions, 120 minutes');
    expect(review.proposal[2].headline).toBe('23 items, 7 already in the cupboard');
  });

  test('the one banner is about data going quiet, and names the source', () => {
    console.log(`fix: ${review.fix?.title} ${review.fix?.body}`);
    expect(review.fix).not.toBeNull();
    expect(review.fix?.body).toContain('has sent nothing since');
  });
});

describe('absence, drawn', () => {
  test('an empty week prints what is missing on every row and never a zero', () => {
    const review = assembleReview(emptyWeek());
    const rows = review.sections.flatMap((section) =>
      section.rows.map((row) => ({ id: `${section.id}.${row.id}`, value: row.value, absence: row.absence })),
    );
    console.log(`walked ${rows.length} row(s) over a week with nothing in it`);
    console.log(rows.map((row) => `${row.id}=${row.value ?? row.absence}`).join(' | '));
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((row) => row.value === null)).toBe(true);
    expect(rows.every((row) => (row.absence ?? '').trim() !== '')).toBe(true);
    // Not one of them says zero.
    expect(rows.some((row) => (row.absence ?? '').includes('0'))).toBe(false);
  });

  test('an empty week has no banner, because nothing is stale', () => {
    expect(assembleReview(emptyWeek()).fix).toBeNull();
  });

  test('a waist measured once in the week still gives the row a figure', () => {
    const review = assembleReview(twoMissedSessions());
    const waist = review.sections.find((section) => section.id === 'body')?.rows.find((row) => row.id === 'waist');
    expect(waist?.value).toBe('98.0 cm');
    expect(waist?.note).toContain('Measured');
  });
});

describe('the email is the same review', () => {
  test('carries all nine section titles and the proposal', () => {
    const review = assembleReview(twoMissedSessions());
    const html = renderReviewEmail(review, ORIGIN);
    const missing = Object.values(strings.review.sections).filter((title) => !html.includes(title));
    console.log(`email is ${html.length} bytes; ${Object.values(strings.review.sections).length} titles checked`);
    expect(missing).toEqual([]);
    expect(html).toContain(strings.review.nextTitle);
  });

  test('fetches nothing: no script, no stylesheet link, no image', () => {
    const html = renderReviewEmail(assembleReview(twoMissedSessions()), ORIGIN);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<img');
    // No custom properties either: an email client that does not resolve var()
    // would render the whole thing black on black.
    expect(html).not.toContain('var(--');
  });

  test('the plain-text part carries the same figures', () => {
    const review = assembleReview(twoMissedSessions());
    const text = renderReviewText(review, ORIGIN);
    console.log(text.split('\n').slice(0, 6).join(' / '));
    expect(text).toContain('86.4 kg');
    expect(text).toContain('2 of 4');
    expect(text).toContain(`${ORIGIN}/review`);
  });

  test('an empty week still renders an email rather than an empty document', () => {
    const html = renderReviewEmail(assembleReview(emptyWeek()), ORIGIN);
    expect(html.length).toBeGreaterThan(1000);
    expect(html).toContain(strings.review.noReading);
  });
});
