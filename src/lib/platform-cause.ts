/**
 * The browser's own words, carried to the markup as the object the browser
 * handed us and never as a copy of it.
 *
 * C6 puts text the product did not author outside its line, on condition that
 * the check excusing such text establishes it BY PROVENANCE and fails every
 * fragment whose provenance it cannot establish. Five rounds of that check
 * compared strings, and every version was beaten the same way: a string is the
 * one thing a product can manufacture. A marker plus a word list fell to a span
 * marked platform holding a copy of what WebKit says. A marker plus a named
 * request fell to that same wording assembled from four pieces at run time, on
 * the marked branch, in a browser that words it differently, so the screen
 * contradicted the browser it was quoting.
 *
 * So nothing here is about text. `carryTheCaughtObject` puts the caught value
 * itself on the DOM node, under a property rather than an attribute, because an
 * attribute can only hold a string and a string is what was being forged. The
 * check reads that property in the page and asks whether it is, by IDENTITY,
 * one of the objects this browser rejected a fetch with in this document. A
 * literal assembled at runtime is not that object. An Error the product built
 * with the same message is not that object either. And a rejection that
 * belonged to another screen is that object but carries the wrong timestamp,
 * so it is refused where it did not happen.
 *
 * What the product gives up for this is the habit of copying `error.message`
 * into state. The object goes into state and the message is read off it at
 * render, so the words on the screen and the words in the object cannot drift
 * apart: they are the same read.
 */

/** The property the caught object travels on. One name, used by both readers. */
export const PLATFORM_CAUSE = 'vernierPlatformCause';

/**
 * A ref callback that hands the node the object the catch block received.
 *
 * Inline at the call site, so React re-attaches it on every render: the object
 * on the node is the one this render is printing, not the one an earlier render
 * caught.
 */
export function carryTheCaughtObject(caught: unknown): (node: HTMLElement | null) => void {
  return (node: HTMLElement | null) => {
    if (node) Reflect.set(node, PLATFORM_CAUSE, caught);
  };
}

/**
 * What the browser called it. The only place the product reads words out of a
 * rejection, and it reads them at render, from the object it is carrying.
 */
export function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}
