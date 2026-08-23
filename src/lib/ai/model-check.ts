import { type AiSettings } from '@/lib/ai/mode';
import type { AiTransport } from '@/lib/ai/transport';
import { strings } from '@/lib/strings';

/**
 * The model identifier, checked once, at boot, against the Models API.
 *
 * F98's last clause and the reason it is there: a snapshot retires, the
 * identifier in the environment file stops naming anything, and every call
 * after that fails. Discovered at 02:00 by a scheduled job, that is a silent
 * outage nobody is awake for. Discovered at boot, it is a container that
 * refuses to start with the identifier printed in the log.
 *
 * IT ASKS ABOUT THE ONE IDENTIFIER, BY NAME. Not a list walk: a list can be
 * paginated or capped and a check that read one page and concluded "absent"
 * would take an installation down over a model that was fine.
 *
 * IN DEMONSTRATION MODE IT DOES NOT CALL AND DOES NOT PRETEND TO. There is no
 * key, nothing is ever sent, and a boot that claimed to have validated a model
 * against an API it never reached would be the exact failure class this run
 * keeps finding: a check that passes by not checking.
 */

export type ModelVerdict =
  | { ok: true; checked: true; model: string }
  | { ok: true; checked: false; model: string; why: 'demo' }
  | { ok: false; message: string };

export async function validateModel(
  settings: AiSettings,
  transport: AiTransport,
): Promise<ModelVerdict> {
  if (settings.mode === 'demo') {
    return { ok: true, checked: false, model: settings.model, why: 'demo' };
  }

  if (settings.model === '') {
    return { ok: false, message: strings.api.boot.noModel };
  }

  const answer = await transport.retrieveModel(settings.model);
  if (answer.ok) return { ok: true, checked: true, model: answer.id };

  /*
   * A 404 is the retired snapshot, which is the case this check exists for. Any
   * other refusal is a key or an outage, and it is also fatal: a container that
   * cannot verify the model it is configured to spend money on has no business
   * serving a screen with a Send button on it.
   */
  const message =
    answer.status === 404
      ? strings.api.boot.unknownModel(settings.model)
      : strings.api.boot.modelUnverified(settings.model, String(answer.status), answer.detail);
  return { ok: false, message };
}
