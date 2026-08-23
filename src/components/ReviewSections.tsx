import { strings } from '@/lib/strings';
import type { ReviewRow, WeeklyReviewView } from '@/lib/weekly-review';

/**
 * The nine sections of the week, drawn as screen 11 frame 1 draws them.
 *
 * WHAT THE MARKUP IS NOT ALLOWED TO DO. There is no class here that could
 * colour a session. A row's figure takes `good` or nothing, and a row's note
 * takes `warn` or nothing, and the assembler in src/lib/weekly-review.ts never
 * hands a session row either. That is DESIGN.md section 5's third decision made
 * structural rather than remembered: a body-composition number that rose is
 * never red, and a session that did not happen is never coloured at all.
 *
 * ABSENCE IS DRAWN. A row with no figure prints what is missing in `--text-3`
 * where the number would have been, rather than a zero, a dash or a gap. The
 * same rule the charts follow, in prose.
 *
 * `data-section` and `data-row` are on every element a capture needs, so the
 * nine sections can be counted from the markup rather than from a screenshot.
 */

function Figure({ row }: { row: ReviewRow }) {
  if (row.value === null) {
    return (
      <span className="sub mut" data-absence>
        {row.absence}
      </span>
    );
  }
  return (
    <span className={row.tone === 'good' ? 'num strong good' : 'num strong'} data-figure>
      {row.value}
    </span>
  );
}

export function ReviewSections({ review }: { review: WeeklyReviewView }) {
  return (
    <>
      {review.sections
        .filter((section) => section.id !== 'proposal')
        .map((section) => (
          <section className="card" key={section.id} data-section={section.id}>
            <span className="lbl">{section.title}</span>
            {section.rows.map((row) => (
              <div className="row" key={row.id} data-row={row.id} data-tone={row.tone}>
                <div className="stack grow">
                  <span>{row.label}</span>
                  {row.note ? (
                    <span
                      className={row.noteTone === 'warn' ? 'note warn' : 'note'}
                      data-note-tone={row.noteTone}
                    >
                      {row.note}
                    </span>
                  ) : null}
                </div>
                <Figure row={row} />
              </div>
            ))}
            {section.paragraphs.map((paragraph) => (
              <p className="sub" key={paragraph} style={{ marginTop: 'var(--s2)' }}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}
    </>
  );
}

/**
 * The nine section titles as a list, so a screen that needs to state its own
 * length can. Used by the email and by the review's own heading count.
 */
export function sectionTitles(): string[] {
  return Object.values(strings.review.sections);
}
