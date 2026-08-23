import { readLastBackupRun } from '@/db/backup';
import { runArchive } from '@/lib/backup/run';
import { csrfFailure } from '@/lib/csrf';
import { ok, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * Back up now, which is the control screen 12 frame 3 draws on the archive card.
 *
 * A MANUAL RUN CLAIMS NO PERIOD, deliberately. The ledger exists so the nightly
 * job happens once per night; pressing this button is the owner saying he wants
 * one now, and refusing him because tonight's period is already done would be
 * the mechanism getting in the way of the person it is for. What it does check
 * is that another run is not in flight, because two at once would race for one
 * file name.
 *
 * It answers with the finished row, so the screen can say what happened rather
 * than reloading and hoping.
 */
export async function POST(request: Request) {
  const csrf = await csrfFailure(request);
  if (csrf) return csrf.response;
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const last = await readLastBackupRun();
  if (last?.outcome === 'running') {
    return refuse(409, strings.api.data.archiveRunning, strings.api.data.archiveRunningDetail, {
      run: last,
    });
  }

  try {
    const run = await runArchive({ kind: 'manual' });
    if (run.outcome !== 'ok') {
      return refuse(500, strings.api.data.archiveFailed, strings.api.data.archiveFailedDetail, {
        run,
      });
    }
    return ok({ run });
  } catch (error) {
    // `runArchive` records its own failure and does not throw, so reaching here
    // means something outside it did: the row is still the record.
    console.error(`[vernier] manual archive: ${(error as Error).message}`);
    return refuse(500, strings.api.data.archiveFailed, strings.api.data.archiveFailedDetail);
  }
}
