import { addEmbed, readAllowlist, readMedia } from '@/db/media';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { movementOf } from '@/lib/catalogue';
import { judge, oembedUrlFor, reasonForStatus } from '@/lib/media-allowlist';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The editorial check on a pasted link, and the only path a media record is
 * written through.
 *
 * TWO GATES, IN THIS ORDER. First the allowlist, which is rows in
 * `media_allowlist` rather than a comparison in this file, so a refusal can
 * name the list it failed. Then a keyless oEmbed preflight, made FROM THIS
 * MACHINE: oEmbed is geo-sensitive to the requesting address, so a check run
 * anywhere else answers a different question, and the owner and the Mac mini
 * are in the same place.
 *
 * The author comes back from that preflight and is what the record stores. If
 * the host names none, nothing is written and the screen says so: a record with
 * no author cannot be attributed, which is the rule that keeps the infringing
 * aggregator sets out of this database permanently.
 *
 * NOTHING IS DOWNLOADED. Not the video, not the thumbnail, not the player. The
 * iframe is fetched by the browser, from the host, and the database refuses a
 * row that is an embed and also names a local file.
 */

const REFUSALS = strings.media.refusals as Record<string, string>;

export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;
  return ok({ records: await readMedia(), allowlist: await readAllowlist() });
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/train/media failed: ${(error as Error).message}`);
    return refuse(500, strings.api.train.failed, strings.api.train.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;

  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: { url?: unknown; movementId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.train.bodyDetail);
  }

  const movementId = typeof body.movementId === 'string' ? body.movementId : '';
  if (!movementOf(movementId)) {
    return refuse(422, strings.api.train.mediaNeedsMovement, strings.api.train.mediaNeedsMovementDetail);
  }

  const raw = typeof body.url === 'string' ? body.url : '';
  const verdict = judge(raw, await readAllowlist());
  if (!verdict.ok) {
    return refuse(422, strings.media.refusedTitle, REFUSALS[verdict.reason], { reason: verdict.reason });
  }

  let status = 0;
  let payload: { author_name?: unknown; title?: unknown; author_url?: unknown } = {};
  try {
    const response = await fetch(oembedUrlFor(verdict.watchUrl), {
      headers: { accept: 'application/json' },
    });
    status = response.status;
    if (response.ok) payload = (await response.json()) as typeof payload;
  } catch {
    return refuse(502, strings.api.train.hostUnreachable, strings.api.train.hostUnreachableDetail);
  }

  const problem = reasonForStatus(status);
  if (problem) {
    return refuse(422, strings.media.refusedTitle, REFUSALS[problem], { reason: problem });
  }

  const author = typeof payload.author_name === 'string' ? payload.author_name.trim() : '';
  const written = await addEmbed({
    movementId,
    url: verdict.watchUrl,
    author,
    // The licence of a third-party video is the host's embedding terms and
    // nothing else. This app holds no rights in it, does not copy it, and says
    // exactly that rather than inventing a licence string.
    licence: strings.media.modes.youtube_nocookie,
    licenceUrl: '',
    attributionUrl: typeof payload.author_url === 'string' ? payload.author_url : verdict.watchUrl,
    verifiedAt: new Date(),
  });

  if (!written.ok) {
    return refuse(422, strings.media.refusedTitle, REFUSALS.noAuthor, { reason: 'noAuthor' });
  }

  return ok({ record: written.record, embedUrl: verdict.embedUrl }, 201);
}
