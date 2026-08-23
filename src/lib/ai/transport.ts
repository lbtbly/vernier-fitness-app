import type { AiCategory } from '@/lib/ai/consent';

/**
 * The one place this product opens a socket to Anthropic, and the seam every
 * test drives instead.
 *
 * The shape is `src/lib/withings/network.ts` again and for the same two
 * reasons. A transport that is an argument means a test can assert that NO
 * request was made, which is exactly what F94 asks for: "with a toggle off no
 * outbound request is made for that category", proven by a request log rather
 * than by a screen state. And a failure comes back as an answer rather than as
 * a thrown exception, so a caller cannot forget to catch it and a provider that
 * went away is a named cause on screen rather than a spinner, which is F99.
 *
 * NOTHING ABOVE THIS FILE KNOWS ABOUT THE SDK. The model identifier arrives as
 * a string from configuration, the sizes arrive as numbers from configuration,
 * and the reply leaves as text and two token counts. That is the whole surface.
 */

export type AiImage = { mediaType: 'image/jpeg'; base64: string };

export type AiRequest = {
  purpose: AiCategory;
  model: string;
  maxOutputTokens: number;
  system: string;
  userText: string;
  image?: AiImage;
};

export type AiFailure = {
  reason: 'unreachable' | 'timeout' | 'refused' | 'unreadable' | 'no_key';
  /** What actually happened, in the words the provider or the platform used. */
  detail: string;
  status: number;
};

export type AiReply =
  | { ok: true; text: string; inputTokens: number; outputTokens: number; model: string }
  | ({ ok: false } & AiFailure);

export type AiCount = { ok: true; inputTokens: number } | ({ ok: false } & AiFailure);

export type AiModelAnswer = { ok: true; id: string } | ({ ok: false } & AiFailure);

/**
 * Three calls, and each one is a request that leaves the machine.
 *
 * `countTokens` is on this interface rather than hidden inside `send` because
 * F98's ceiling is checked against a PRE-FLIGHT count, which means the count is
 * a separate round trip that happens before the expensive one and after the
 * consent check. A caller that skips the count cannot refuse the call for the
 * right reason.
 */
export type AiTransport = {
  countTokens(request: AiRequest): Promise<AiCount>;
  send(request: AiRequest): Promise<AiReply>;
  /**
   * One model identifier, asked about by name.
   *
   * By name and not as a list, because that is the question F98 asks: is the
   * identifier this installation is configured with still a model. A list can
   * be paginated, filtered or capped, and a check that reads the first page and
   * concludes "not there" would fail a boot over a model that is perfectly
   * alive. A retrieve either answers with the model or refuses with a status.
   */
  retrieveModel(id: string): Promise<AiModelAnswer>;
};

/** Nothing waits longer than this. A screen that spins is F99's failure mode. */
export const AI_TIMEOUT_MS = 30_000;

/** The Models API is a small read and gets a short leash, because boot waits on it. */
export const AI_BOOT_TIMEOUT_MS = 10_000;

function failureOf(error: unknown): AiFailure {
  const name = (error as Error).name;
  const detail = (error as Error).message;
  const status = (error as { status?: number }).status ?? 0;
  if (name === 'TimeoutError' || name === 'AbortError') return { reason: 'timeout', detail, status };
  if (typeof status === 'number' && status >= 400) return { reason: 'refused', detail, status };
  return { reason: 'unreachable', detail, status: 0 };
}

/**
 * The real transport, over the official SDK.
 *
 * The SDK is imported here and nowhere else. It is a runtime dependency named
 * in `.forge/PLAN.md` and it owns the wire format, the authentication header
 * and the API version, which are three things this build has no business
 * writing down from memory.
 */
export function networkAiTransport(apiKey: string): AiTransport {
  async function client() {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    return new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
  }

  function content(request: AiRequest) {
    const blocks: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }
    > = [];
    if (request.image) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: request.image.mediaType, data: request.image.base64 },
      });
    }
    blocks.push({ type: 'text', text: request.userText });
    return blocks;
  }

  return {
    async countTokens(request) {
      try {
        const anthropic = await client();
        const answer = await anthropic.messages.countTokens({
          model: request.model,
          system: request.system,
          messages: [{ role: 'user', content: content(request) }],
        });
        return { ok: true, inputTokens: answer.input_tokens };
      } catch (error) {
        return { ok: false, ...failureOf(error) };
      }
    },

    async send(request) {
      try {
        const anthropic = await client();
        const message = await anthropic.messages.create({
          model: request.model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [{ role: 'user', content: content(request) }],
        });
        const text = message.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .join('')
          .trim();
        return {
          ok: true,
          text,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          model: message.model,
        };
      } catch (error) {
        return { ok: false, ...failureOf(error) };
      }
    },

    async retrieveModel(id) {
      try {
        const anthropic = await client();
        const model = await anthropic.models.retrieve(id, undefined, {
          timeout: AI_BOOT_TIMEOUT_MS,
        });
        return { ok: true, id: model.id };
      } catch (error) {
        return { ok: false, ...failureOf(error) };
      }
    },
  };
}

/**
 * A transport that records what it was asked and answers nothing.
 *
 * Not a test helper that lives in the test folder: the demonstration path uses
 * the same recording seam, so "no request left this machine" is a property of
 * the shipped code in demonstration mode and not a property of a mock.
 */
export function recordingTransport(inner: AiTransport | null): AiTransport & {
  calls: Array<{ call: 'countTokens' | 'send' | 'retrieveModel'; request?: AiRequest }>;
} {
  const calls: Array<{ call: 'countTokens' | 'send' | 'retrieveModel'; request?: AiRequest }> = [];
  /*
   * An operator-facing token, not product copy, and deliberately not a
   * sentence: it is reachable only with no inner transport at all, which is a
   * test wiring and never a shipped path. The same rule and the same shape as
   * `NOT_A_DOCUMENT_ID` in src/lib/lab-storage.ts. Every cause a person reads
   * comes from the string catalogue, through the route that answers.
   */
  const refusal: AiFailure = { reason: 'no_key', detail: 'ai-transport: none configured', status: 0 };
  return {
    calls,
    async countTokens(request) {
      calls.push({ call: 'countTokens', request });
      return inner ? inner.countTokens(request) : { ok: false, ...refusal };
    },
    async send(request) {
      calls.push({ call: 'send', request });
      return inner ? inner.send(request) : { ok: false, ...refusal };
    },
    async retrieveModel(id) {
      calls.push({ call: 'retrieveModel' });
      return inner ? inner.retrieveModel(id) : { ok: false, ...refusal };
    },
  };
}
