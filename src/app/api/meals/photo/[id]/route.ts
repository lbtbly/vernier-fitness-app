import { NO_STORE, refuse, sessionOrRefusal } from '@/lib/gate';
import { readPhotoBytes } from '@/lib/meal-photo';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The photograph behind an estimate, served to the owner and to nobody else.
 *
 * Tap 2 of the provenance walk draws it, which is what F97 means by "reaches
 * the photo". It is a route rather than a static file because `/app/storage` is
 * a volume and not a public directory: nothing under it is servable by the
 * framework, and that is the right way round. The path is rebuilt from the id
 * inside `meal-photo.ts`, which refuses anything that is not a photo id, so
 * there is no traversal to find.
 *
 * It is not on the public route list, so the middleware turns away a caller
 * with no session before this file runs, and this checks again anyway.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const { id } = await context.params;
  let bytes: Uint8Array | null = null;
  try {
    bytes = await readPhotoBytes(id);
  } catch {
    bytes = null;
  }
  if (!bytes) {
    return refuse(404, strings.meals.photoNotFound, strings.meals.entryNotFoundBody);
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      ...NO_STORE,
      'Content-Type': 'image/jpeg',
      'Content-Length': String(bytes.byteLength),
    },
  });
}
