import { abandonDocument, readDocument, toReviewDocument, validateDocument } from '@/db/labs';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { listDocuments } from '@/lib/lab-storage';
import type { ReviewRow } from '@/lib/lab-review';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * What happens to the review and to the file, which are two different questions
 * asked at two different moments.
 *
 * ABANDON is the X at the top of screen 05. The holding is deleted, the file
 * with it, and nothing was ever in `measurement`, so F58's count before and
 * after is zero either side. A review with saved rows cannot be abandoned: those
 * rows are in a table that refuses DELETE and they keep a link to the page they
 * were printed on, so the route says so instead of orphaning them.
 *
 * VALIDATE is frame 3. It records the keep-or-delete answer AT THE MOMENT OF
 * VALIDATION, which is where DESIGN.md puts it rather than in a settings screen
 * six weeks later, and delete means `rm` on the volume. The answer carries the
 * directory listing before and after, because F63 reads exactly that and a
 * boolean saying "deleted" is a claim while two listings are evidence.
 */

type Body = {
  documentId?: unknown;
  action?: unknown;
  retention?: unknown;
};

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    console.error(`[vernier] /api/labs/document failed: ${(error as Error).message}`);
    return refuse(500, strings.api.labs.failed, strings.api.labs.failedDetail);
  }
}

async function handle(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return refuse(400, strings.api.jsonBody, strings.api.labs.failedDetail);
  }

  const documentId = typeof body.documentId === 'string' ? body.documentId.trim() : '';
  const document = await readDocument(documentId);
  if (!document) {
    return refuse(404, strings.api.labs.noSuchDocument, strings.api.labs.noSuchDocumentDetail);
  }

  const rows = document.extraction as ReviewRow[];
  const saved = rows.filter((row) => row.decision === 'saved').length;
  const before = await listDocuments();

  if (body.action === 'abandon') {
    if (saved > 0) {
      return refuse(
        409,
        strings.api.labs.cannotAbandon(saved),
        strings.api.labs.cannotAbandonDetail,
      );
    }
    const { fileRemoved } = await abandonDocument(documentId);
    const after = await listDocuments();
    console.log(
      `[vernier] lab ${documentId} abandoned: files before ${before.length}, after ${after.length}`,
    );
    return ok({ abandoned: true, fileRemoved, filesBefore: before, filesAfter: after }, 200);
  }

  const retention = body.retention === 'deleted' ? 'deleted' : body.retention === 'kept' ? 'kept' : null;
  if (retention === null) {
    return refuse(422, strings.api.labs.retentionNeeded, strings.api.labs.retentionNeededDetail);
  }

  const { fileRemoved } = await validateDocument(documentId, retention);
  const after = await listDocuments();
  console.log(
    `[vernier] lab ${documentId} validated, retention ${retention}: files before ${before.length}, after ${after.length}`,
  );
  const updated = await readDocument(documentId);
  return ok(
    {
      retention,
      fileRemoved,
      filesBefore: before,
      filesAfter: after,
      review: updated ? toReviewDocument(updated) : null,
    },
    200,
  );
}
