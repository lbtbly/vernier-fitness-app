import type { AiRequest } from '@/lib/ai/transport';
import { allAliases } from '@/lib/food-aliases';
import { strings } from '@/lib/strings';

/**
 * What actually leaves this machine, assembled in one place so the consent
 * screen and the source record can both quote it.
 *
 * THE ALIAS LIST IS THE POINT OF THE PROMPT. Claude is asked to name what it
 * sees using this product's own food identifiers, so the nutrition comes off
 * Anses rows and never out of the model. A reply naming a food this build has
 * no row for is counted as unresolved and says so on the screen, which is the
 * same rule slice 9 applies to an ingredient that matches nothing.
 *
 * NOTHING PERSONAL IS IN HERE AND THERE IS NO BRANCH THAT COULD PUT IT THERE.
 * No name, no age, no weight, no waist, no laboratory value, no location, no
 * other photo. The request is a photograph, the word for the meal slot, the
 * identifier list and one question. That is exactly what the consent screen
 * lists, because the screen renders from the same two catalogue blocks this
 * builds from.
 */

/** The identifiers the model may name, in a stable order. */
export function aliasIdList(): string[] {
  return allAliases()
    .map((alias) => alias.id)
    .sort();
}

export function photoEstimateRequest(input: {
  model: string;
  maxOutputTokens: number;
  slotLabel: string;
  imageBase64: string;
}): AiRequest {
  return {
    purpose: 'photo_analysis',
    model: input.model,
    maxOutputTokens: input.maxOutputTokens,
    system: `${strings.meals.prompt.system} ${strings.meals.prompt.aliasList(aliasIdList())}`,
    userText: strings.meals.prompt.user(input.slotLabel),
    image: { mediaType: 'image/jpeg', base64: input.imageBase64 },
  };
}
