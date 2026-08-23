import Link from 'next/link';
import { ScreenTitle } from '@/components/ScreenTitle';
import { SessionEditor, type EditableSession } from '@/components/SessionEditor';
import { readProposal } from '@/db/training';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { longDate } from '@/lib/format';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.trainWeek.editTitle };
export const dynamic = 'force-dynamic';

/**
 * Editing one session, screen 06 frame 2. One row, one screen, and the other
 * three rows of the week are not read here and cannot be changed from here.
 */
export default async function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { timeZone } = getConfig();
  const csrfToken = await readCsrfToken();

  let proposal: Awaited<ReturnType<typeof readProposal>> = null;
  let failed = false;
  try {
    proposal = await readProposal(id);
  } catch (error) {
    console.error(`[vernier] session edit read failed: ${(error as Error).message}`);
    failed = true;
  }

  if (failed || !proposal) {
    return (
      <div className="train">
        <ScreenTitle label={strings.train.title} title={strings.trainWeek.editTitle} />
        <div className={failed ? 'card error' : 'card empty'} data-state={failed ? 'error' : 'not-found'}>
          <div className="head" style={{ marginTop: 0 }}>
            {failed ? strings.trainWeek.errorTitle : strings.player.notFoundTitle}
          </div>
          <p className="sub">{failed ? strings.trainWeek.errorBody : strings.player.notFoundBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/train">
              {strings.trainWeek.back}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const session: EditableSession = {
    id: proposal.id,
    plannedFor: proposal.plannedFor.toISOString(),
    durationMinutes: proposal.durationMinutes,
    kind: proposal.kind,
    movements: proposal.movements.map((entry) => ({
      movementId: entry.movementId,
      sets: entry.sets,
      target: entry.target,
    })),
  };

  return (
    <div className="train">
      <ScreenTitle
        label={longDate(proposal.plannedFor, timeZone)}
        title={strings.trainWeek.editTitle}
        sub={strings.trainWeek.kinds[proposal.kind as 'strength']}
      />
      <SessionEditor csrfToken={csrfToken} timeZone={timeZone} session={session} />
    </div>
  );
}
