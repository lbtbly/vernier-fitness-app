import { dayLabel } from '@/lib/format';
import { strings } from '@/lib/strings';
import type { WeeklyReviewView } from '@/lib/weekly-review';

/**
 * The Sunday email, as one finished document and as plain text beside it.
 *
 * IT RENDERS WITH NO MAIL TRANSPORT AND THAT IS THE POINT OF F118. Nothing here
 * needs a host, a port or a credential: the preview route serves exactly the
 * bytes the mail adapter would send, so the thing the owner reads on a Sunday
 * evening is the thing that has been proved to render, months before an SMTP
 * host exists. When one is configured, this same function is what is handed to
 * it. There is no second renderer for the real send and so no second thing to
 * keep true.
 *
 * SELF CONTAINED, AND NOT BECAUSE OF TASTE. An email client fetches nothing:
 * no stylesheet, no font, no script, and images only if the reader allows them.
 * So the CSS is inline, the type stack is the same one DESIGN.md section 3
 * names, and there is not one external reference anywhere in the document. The
 * colours are literals rather than custom properties for the same reason: an
 * email client that does not resolve `var()` would render the whole thing
 * black on black.
 *
 * The copy is the catalogue's, the same keys the screen uses, so the email and
 * the screen cannot drift.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Dark ink on white paper, and the light theme's values from DESIGN.md section
 * 3 rather than a second palette. An email is read in a client this app does
 * not control, so it takes the theme that survives a white background.
 */
const INK = '#101013';
const INK_2 = '#4A4A52';
const INK_3 = '#6B6B73';
const LINE = '#DCDCE2';
const GOOD = '#157F4E';
const WARN = '#8A5A00';
const SURFACE = '#FFFFFF';
const PAPER = '#F2F2F5';

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';

export function reviewSubject(review: WeeklyReviewView): string {
  return strings.review.emailSubject(dayLabel(review.weekStart), dayLabel(review.weekEnd));
}

function rowMarkup(row: {
  label: string;
  value: string | null;
  absence: string | null;
  note: string | null;
  tone: 'neutral' | 'good';
  noteTone: 'neutral' | 'warn';
}): string {
  const figure =
    row.value === null
      ? `<span style="color:${INK_3}">${escapeHtml(row.absence ?? '')}</span>`
      : `<span style="color:${row.tone === 'good' ? GOOD : INK};font-weight:600">${escapeHtml(row.value)}</span>`;
  const note =
    row.note === null
      ? ''
      : `<div style="font-size:13px;line-height:19px;color:${row.noteTone === 'warn' ? WARN : INK_2};margin-top:2px">${escapeHtml(row.note)}</div>`;
  return `<tr>
<td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:15px;line-height:20px;color:${INK}">${escapeHtml(row.label)}${note}</td>
<td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:15px;line-height:20px;text-align:right;white-space:nowrap">${figure}</td>
</tr>`;
}

export function renderReviewEmail(review: WeeklyReviewView, appUrl: string): string {
  const from = dayLabel(review.weekStart);
  const to = dayLabel(review.weekEnd);

  /*
   * EIGHT CARDS HERE, AND THE NINTH IS THE BLOCK BELOW.
   *
   * `assembleReview` returns nine sections and the ninth is the proposal, whose
   * rows live somewhere else: on screen they are on the next screen, and an
   * email has no next screen, so they are printed here under the same title.
   * Mapping all nine AND printing that block put "Next week" in this document
   * twice, the first time as a card holding nothing but the note the second one
   * repeats. F118 counts nine sections and this preview carried ten, one of
   * them empty.
   *
   * `data-section` carries the same nine ids the screen uses, so the sections
   * can be counted off the markup rather than off a screenshot and the two
   * renderings of one review cannot drift without a test seeing it. An email
   * client ignores an attribute it does not know.
   */
  const sections = review.sections
    .filter((section) => section.id !== 'proposal')
    .map((section) => {
      const rows =
        section.rows.length === 0
          ? ''
          : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:6px">${section.rows.map(rowMarkup).join('')}</table>`;
      const paragraphs = section.paragraphs
        .map(
          (text) =>
            `<p style="margin:8px 0 0;font-size:15px;line-height:21px;color:${INK_2}">${escapeHtml(text)}</p>`,
        )
        .join('');
      return `<div data-section="${escapeHtml(section.id)}" style="background:${SURFACE};border:1px solid ${LINE};border-radius:16px;padding:16px;margin-bottom:12px">
<div style="font-size:11px;line-height:14px;letter-spacing:.06em;text-transform:uppercase;color:${INK_3};font-weight:600">${escapeHtml(section.title)}</div>
${rows}${paragraphs}
</div>`;
    })
    .join('');

  const proposal = review.proposal
    .map(
      (block) => `<tr>
<td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:15px;line-height:20px;color:${INK}">${escapeHtml(block.label)}
<div style="font-size:13px;line-height:19px;color:${INK_2};margin-top:2px">${escapeHtml(block.headline)}</div>
${block.cause ? `<div style="font-size:12px;line-height:18px;color:${INK_3};margin-top:4px">${escapeHtml(block.cause)}</div>` : ''}</td>
<td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:13px;line-height:19px;text-align:right;color:${INK_3};white-space:nowrap">${escapeHtml(strings.review.proposalStates[block.state])}</td>
</tr>`,
    )
    .join('');

  const fix = review.fix
    ? `<div style="background:#FDF6E7;border:1px solid ${WARN};border-radius:12px;padding:12px;margin-bottom:12px;font-size:14px;line-height:20px;color:${INK}">
<b>${escapeHtml(review.fix.title)}</b> ${escapeHtml(review.fix.body)}
</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(reviewSubject(review))}</title>
</head>
<body style="margin:0;padding:24px 16px;background:${PAPER};font-family:${FONT};-webkit-font-smoothing:antialiased">
<div style="max-width:560px;margin:0 auto">
<div style="font-size:11px;line-height:14px;letter-spacing:.14em;text-transform:uppercase;color:${INK_3};font-weight:600">${escapeHtml(strings.common.productName)}</div>
<h1 style="margin:6px 0 2px;font-size:30px;line-height:33px;letter-spacing:-.02em;color:${INK}">${escapeHtml(strings.review.title)}</h1>
<div style="font-size:13px;line-height:19px;color:${INK_2};margin-bottom:16px">${escapeHtml(strings.review.weekOf(from, to))}</div>
<p style="margin:0 0 16px;font-size:15px;line-height:21px;color:${INK_2}">${escapeHtml(strings.review.emailIntro(from, to))}</p>
${fix}
${sections}
<div data-section="proposal" style="background:${SURFACE};border:1px solid ${LINE};border-radius:16px;padding:16px;margin-bottom:12px">
<div style="font-size:11px;line-height:14px;letter-spacing:.06em;text-transform:uppercase;color:${INK_3};font-weight:600">${escapeHtml(strings.review.nextTitle)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:6px">${proposal}</table>
<p style="margin:12px 0 0;font-size:13px;line-height:19px;color:${INK_2}">${escapeHtml(strings.review.proposalNote)}</p>
<p style="margin:12px 0 0"><a href="${escapeHtml(appUrl)}/review" style="color:#0A6CD0;font-size:15px;line-height:20px">${escapeHtml(strings.review.open)}</a></p>
</div>
<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:${INK_3}">${escapeHtml(strings.review.emailFooter)}</p>
</div>
</body>
</html>
`;
}

/**
 * The same review as text, which is what a mail adapter sends as the
 * alternative part. Not a fallback nobody reads: a plain-text part is what a
 * watch, a screen reader and a client with images off actually render.
 */
export function renderReviewText(review: WeeklyReviewView, appUrl: string): string {
  const from = dayLabel(review.weekStart);
  const to = dayLabel(review.weekEnd);
  const lines: string[] = [
    strings.review.title,
    strings.review.weekOf(from, to),
    '',
    strings.review.emailIntro(from, to),
    '',
  ];

  if (review.fix) lines.push(`${review.fix.title} ${review.fix.body}`, '');

  // The proposal is held back here for the same reason it is in the HTML: it is
  // the ninth section and the block below is what carries its rows, so printing
  // both put the heading and the note in this part twice.
  for (const section of review.sections.filter((candidate) => candidate.id !== 'proposal')) {
    lines.push(section.title.toUpperCase());
    for (const row of section.rows) {
      lines.push(`  ${row.label}: ${row.value ?? row.absence ?? ''}`);
      if (row.note) lines.push(`    ${row.note}`);
    }
    for (const paragraph of section.paragraphs) lines.push(`  ${paragraph}`);
    lines.push('');
  }

  lines.push(strings.review.nextTitle.toUpperCase());
  for (const block of review.proposal) {
    lines.push(`  ${block.label}: ${block.headline} (${strings.review.proposalStates[block.state]})`);
    if (block.cause) lines.push(`    ${block.cause}`);
  }
  lines.push(`  ${strings.review.proposalNote}`);
  lines.push('', `${strings.review.open}: ${appUrl}/review`, '', strings.review.emailFooter);

  return lines.join('\n');
}
