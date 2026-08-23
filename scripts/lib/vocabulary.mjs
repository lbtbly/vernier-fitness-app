// One vocabulary, two checkers.
//
// scripts/strings.mjs reads the source and scripts/rendered-strings.mjs reads
// the screen. Neither one closes C6 alone; the union does. That only holds if
// the two agree on what a person can read, and for three verifications they did
// not: `SPOKEN_ATTRIBUTES` existed twice with the same six entries, both copies
// missing `aria-roledescription`, and nothing anywhere kept them equal. A rule
// one checker holds and the other does not is the defect class behind every C6
// failure this slice has had.
//
// So the lists live here and both checkers import them. Add an attribute once
// and both see it.

/**
 * Every attribute whose value a person reads or a screen reader speaks.
 *
 * Text-valued only. `aria-labelledby` and `aria-describedby` are absent on
 * purpose: they carry element ids, and the text they point at is already read
 * where it is written. `aria-valuenow` and `aria-level` are numbers. What is
 * here is authored copy, and authored copy needs a key.
 */
export const SPOKEN_ATTRIBUTES = [
  'alt',
  'aria-braillelabel',
  'aria-brailleroledescription',
  'aria-description',
  'aria-keyshortcuts',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'placeholder',
  'title',
];

/**
 * Elements whose `value` attribute is drawn on the control rather than sent
 * with the form. A `<button>` carries its label as children and is read by the
 * text walk; these three carry it as an attribute and are not.
 */
export const VALUE_AS_LABEL = ['input[type="submit"]', 'input[type="button"]', 'input[type="reset"]'];

/**
 * Controls whose `value` is the text drawn inside them.
 *
 * A `<button>` carries its label as children and the text walk reads it. The
 * three above carry a label as an attribute. These carry CONTENT: whatever the
 * value holds is what the owner reads in the field, and neither checker read a
 * word of it. `<input type="text" value="waist due at the weekend">` rendered
 * 200 by 20 pixels on a walked screen and both checks stayed green, which is a
 * sentence on a screen with no key, exactly like a sentence in a paragraph.
 *
 * The value may be the owner's typing, and then it is data and the data
 * anchors account for it, the same way a correction reason on the value sheet
 * is accounted for. It may also be a default the product wrote, and that is
 * copy and needs a key.
 *
 * `password` is not here, and neither is `hidden` or `file`. A password value
 * is a credential and nothing in this repository prints one; a hidden input is
 * not drawn; a file input reports a fake path the browser invents.
 */
export const VALUE_AS_CONTENT = [
  'input[type="text"]',
  'input[type="search"]',
  'input[type="url"]',
  'input[type="tel"]',
  'input[type="email"]',
  'input[type="number"]',
  'input[type="date"]',
  'input[type="time"]',
  'input[type="datetime-local"]',
  'input[type="month"]',
  'input[type="week"]',
  'input:not([type])',
  'textarea',
];

/** Elements whose `label` attribute is drawn in a menu or a track list. */
export const LABEL_ATTRIBUTE_ELEMENTS = ['optgroup', 'track'];

/**
 * Inside an svg, the elements that hold words. C8 puts a `<title>` and a
 * `<desc>` in every chart and those are the strings VoiceOver actually speaks;
 * `<text>` is what a sighted reader sees on the axis. Everything else in an svg
 * is geometry, and `path` and `defs` stay out.
 */
export const SVG_TEXT_ELEMENTS = ['title', 'desc', 'text', 'tspan', 'textPath'];

/** Inside an svg, subtrees that are never rendered where they sit. */
export const SVG_EXCLUDED_SUBTREES = ['defs', 'clipPath', 'mask', 'pattern', 'marker'];

/**
 * Inside an svg, the one subtree that is not svg at all.
 *
 * A `<foreignObject>` holds ordinary HTML and draws it where it sits, which is
 * how a chart puts a legend, a tooltip or a label block over its own geometry.
 * The svg rule above asks for `title, desc, text, tspan, textPath` and a div
 * inside a foreignObject matches none of them, so every word in one was
 * skipped: "row 12, page 6" rendered at 200 by 20 pixels on a walked screen
 * with both checks green. Inside here the ordinary rules apply again.
 */
export const SVG_FOREIGN_HTML = 'foreignObject';

/**
 * THERE IS NO ELEMENT EXEMPTION. `code`, `kbd`, `samp` and `pre` used to be
 * listed here as "machine notation rather than prose", and every kebab, snake
 * or dotted run inside one of them tiled as a value. That is position and not
 * provenance: `<code>{helperNote()}</code>` returning `'sign-in'` rendered at
 * 45 px and both checks passed. `element.closest('code')` establishes where a
 * fragment landed, never who wrote it, and A4 refused exactly that shape as an
 * exclusion. Notation a screen prints on purpose is still copy: it takes a
 * catalogue key, or it comes out of a column and is read as owner data, or it
 * is one of the value shapes below. Nothing is excused for the element it sits
 * in.
 */

/** Subtrees that never reach a reader at all. */
export const NEVER_RENDERED = ['script', 'style', 'noscript', 'template'];

/**
 * Space and punctuation between two things that are accounted for.
 *
 * Glue is skipped rather than matched, so it can never be the reason a fragment
 * passes: a fragment made only of glue reads as empty and is not counted.
 */
export const GLUE = /^[\s,.;:!?·•|/\\()[\]{}"'“”‘’«»–—+*=%~@#&<>$£€-]+/;

/**
 * Shapes that are values rather than words.
 *
 * There used to be a ninth, `machine identifier`,
 * `/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+/`, and it swallowed "sign-in",
 * "check-in", "opt-out", "follow-up" and "day-to-day". Any lowercase hyphenated
 * English word tiled as a value and never as copy, which is a hole a real
 * inline string walks through. It is deleted rather than narrowed, because the
 * three things it legitimately covered are already covered better and by name:
 * a value this check sent itself is an echo anchor, a value read out of a
 * column is a data anchor, and notation a screen prints on purpose sits in a
 * `<code>` and is read under MACHINE_TOKENS below. A bare run of prose is never
 * a machine identifier again.
 */
export const TOKENS = [
  ['uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ['id', /^(?:src_|q_|demo_)[A-Za-z0-9_.:-]+/],
  ['url', /^https?:\/\/[^\s]+/],
  ['zone', /^[A-Z][A-Za-z]+(?:\/[A-Za-z_]+)+/],
  ['dotted identifier', /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+/],
  ['host', /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+/],
  /*
   * A hash, printed on purpose. Slice 6's ingest diagnostics screen exists to
   * show one: it prints a fixed canonical string and the 64 lower-case hex
   * characters this machine computes for it, so the owner can run four shell
   * lines with the secret from his shortcut and see whether the two agree. A
   * digest is a value in the plainest sense, it has no words in it, and there
   * is nothing about it to translate.
   *
   * It sits above `number` because `tokenAt` takes the FIRST shape that matches
   * rather than the longest, and a digest beginning with a digit would
   * otherwise be eaten as a number and leave its letters behind.
   *
   * It cannot swallow a phrase, and that is a property of the class rather than
   * a hope. Thirty-two or more characters with no space in them, drawn only
   * from 0 to 9 and a to f: reaching that length in English would need a word
   * built from six letters and no others, and the tiler anchors at the start of
   * a run, so a sentence opening "added" stops at its first letter outside the
   * class. `machine identifier` was deleted from this list for exactly the
   * opposite reason, that it accepted "sign-in" and "follow-up".
   */
  ['hash', /^[0-9a-f]{32,}/],
  ['number', /^[+-]?\d+(?:[.,:]\d+)*/],
];

/** Two letters in a row is copy. One letter, punctuation or a numeral is glue. */
export const LOOKS_LIKE_COPY = /[A-Za-z]{2,}/;

/**
 * A CSS `content` declaration, and the words it paints.
 *
 * A stylesheet is a place a sentence can be written, and it was the widest hole
 * the union of these two checks had: `.chip::after{content:" Not synced yet"}`
 * painted on every chip on every screen, `getComputedStyle` read it straight
 * back, and `innerText`, `textContent` and a SHOW_TEXT TreeWalker all missed it
 * by construction. The source checker read no .css file at all and the rendered
 * checker read no pseudo-element. Both do now, and both use this.
 *
 * `justify-content` is not a match, which is why the property is anchored on
 * something that is not a name character. The empty string, `none`, `normal`,
 * `counter()`, `attr()` and the quote keywords carry no words and are left
 * alone: what is caught is a string literal with letters in it.
 */
export const CSS_CONTENT_DECLARATION = /(^|[^-\w])content\s*:\s*([^;}]*)/gi;

/**
 * A string literal inside a CSS value, as source text.
 *
 * It is a source string rather than a regular expression because the rendered
 * checker's page function is serialised into WebKit and can close over nothing:
 * it rebuilds this there. One definition, two sides, which is the whole reason
 * this module exists.
 */
export const CSS_STRING_SOURCE = String.raw`"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'`;

/** Every string literal in one CSS value, unescaped enough to read. */
export function cssContentStrings(value) {
  const found = [];
  for (const match of value.matchAll(new RegExp(CSS_STRING_SOURCE, 'g'))) {
    const text = (match[1] ?? match[2] ?? '').replace(/\\(?=.)/g, '');
    if (text.trim() !== '') found.push(text);
  }
  return found;
}

/** Words that are markup, not language. */
export const NOT_COPY = new Set(['px', 'em', 'rem']);
