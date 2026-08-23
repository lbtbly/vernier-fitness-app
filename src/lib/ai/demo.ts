import type { AiTransport } from '@/lib/ai/transport';
import { aliasNameById } from '@/lib/food-aliases';
import { strings } from '@/lib/strings';

/**
 * The demonstration path, whole, with no key and no socket.
 *
 * F95 says the WHOLE photo flow runs in demonstration mode, which is a higher
 * bar than a stub that returns a number. Everything above this file is
 * identical between the two modes: the same consent check, the same pre-flight
 * count, the same ceiling arithmetic, the same parse, the same range, the same
 * confirm, the same ledger row and the same source record. Only the three
 * functions below change, and each of them answers out of this file rather than
 * off the network.
 *
 * IT REPLIES WITH THE SAME JSON THE REAL MODEL IS ASKED FOR, which is what
 * makes the demonstration worth having: a shape change in the prompt breaks the
 * demonstration exactly as it would break the real path, in the same parser,
 * with the same cause on screen. A demonstration that returned an already
 * parsed object would sail past the one thing most likely to go wrong.
 *
 * The plate is screen 09's plate: a salmon fillet, roast potatoes, green beans
 * and the oil they were cooked in. The gram figures are single guesses and not
 * ranges, because turning a guess into a range is this product's job and not
 * the model's, and doing it here would hide the step F96 grades.
 *
 * EVERY WORD IN THE REPLY COMES OUT OF THE CATALOGUE. The item names are the
 * alias names screen 09 draws and the sentence is one key, because a
 * demonstration is this product writing, and C6 does not stop caring because a
 * sentence went out through a JSON document on its way to the screen.
 */

const DEMO_PLATE = [
  { alias: 'salmon', grams: 160 },
  { alias: 'potatoes', grams: 200 },
  { alias: 'green-beans', grams: 105 },
  { alias: 'olive-oil', grams: 20 },
] as const;

/** The demonstration reply, as text, in the shape the prompt asks for. */
export function demoReply(): string {
  return JSON.stringify({
    items: DEMO_PLATE.map((item) => ({
      alias: item.alias,
      text: aliasNameById(item.alias) ?? item.alias,
      grams: item.grams,
    })),
    note: strings.meals.demoNote,
  });
}

/**
 * Token counts a demonstration reports for a call it never made.
 *
 * They are fixed and the ledger row beside them says `demo`, so nobody reads
 * them as a measurement. A real call reports the API's own usage block and
 * nothing here is ever substituted for it.
 */
export const DEMO_INPUT_TOKENS = 1_612;
export const DEMO_OUTPUT_TOKENS = 214;

/** What the demonstration calls itself when no model identifier is configured. */
export const DEMO_MODEL = 'demonstration';

export function demoAiTransport(): AiTransport {
  return {
    async countTokens() {
      return { ok: true, inputTokens: DEMO_INPUT_TOKENS };
    },
    async send(request) {
      return {
        ok: true,
        text: demoReply(),
        inputTokens: DEMO_INPUT_TOKENS,
        outputTokens: DEMO_OUTPUT_TOKENS,
        // The configured identifier when there is one, so the demonstration
        // shows the owner what his own installation would call. With none
        // configured it says what it is.
        model: request.model === '' ? DEMO_MODEL : request.model,
      };
    },
    async retrieveModel(id) {
      // A demonstration validates nothing against a live catalogue and does not
      // pretend to. The boot check never reaches here in demonstration mode; if
      // something ever calls it, it answers with the identifier it was handed
      // and the caller can see for itself that nothing was checked.
      return { ok: true, id };
    },
  };
}
