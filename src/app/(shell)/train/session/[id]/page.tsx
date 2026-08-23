import Link from 'next/link';
import { SessionPlayer, type PlayerSession } from '@/components/SessionPlayer';
import { ScreenTitle } from '@/components/ScreenTitle';
import { readLastPerformance, readProposal, readRestingHeartRate } from '@/db/training';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { bandOf, guidanceFor } from '@/lib/intensity';
import { movementOf } from '@/lib/catalogue';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.player.title };
export const dynamic = 'force-dynamic';

/**
 * The session, read once and handed to the player whole.
 *
 * EVERYTHING THE PLAYER NEEDS ARRIVES BEFORE THE FIRST SET. Last week's load
 * for every movement, the cue text, the bundled demonstration, the alternatives
 * on the ladder and the intensity band: all of it is in the first response, and
 * nothing is fetched again while the session is open. A phone in a basement gym
 * has no route home, and a number that needs a request to appear is a number
 * that does not appear.
 *
 * The band is the pre-session target and it uses ONE anchoring method, decided
 * by whether a resting heart rate is stored. It is only drawn on a cardio
 * session, where an intensity to aim at means something.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { timeZone } = getConfig();
  const csrfToken = await readCsrfToken();

  let proposal: Awaited<ReturnType<typeof readProposal>> = null;
  let failed = false;
  try {
    proposal = await readProposal(id);
  } catch (error) {
    console.error(`[vernier] session read failed: ${(error as Error).message}`);
    failed = true;
  }

  if (failed) {
    return (
      <div className="player">
        <ScreenTitle label={strings.train.title} title={strings.player.title} />
        <div className="card error" data-state="error">
          <div className="between">
            <span className="lbl">{strings.player.title}</span>
            <span className="chip a">{strings.error.title}</span>
          </div>
          <div className="head">{strings.player.errorTitle}</div>
          <p className="sub">{strings.player.errorBody}</p>
          <div className="actions">
            <Link className="btn block" href="/train">
              {strings.trainWeek.back}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="player">
        <ScreenTitle label={strings.train.title} title={strings.player.title} />
        <div className="card empty" data-state="not-found">
          <span className="lbl">{strings.player.title}</span>
          <div className="head">{strings.player.notFoundTitle}</div>
          <p className="sub">{strings.player.notFoundBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/train">
              {strings.trainWeek.back}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (proposal.movements.length === 0) {
    return (
      <div className="player">
        <ScreenTitle label={strings.train.title} title={strings.player.title} />
        <div className="card empty" data-state="empty">
          <span className="lbl">{strings.player.title}</span>
          <div className="head">{strings.player.emptyTitle}</div>
          <p className="sub">{strings.player.emptyBody}</p>
          <div className="actions">
            <Link className="btn primary block" href="/train">
              {strings.trainWeek.back}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [last, resting] = await Promise.all([
    readLastPerformance(proposal.movements.map((entry) => entry.movementId)),
    readRestingHeartRate(),
  ]);
  const lastById = new Map(last.map((entry) => [entry.movementId, entry]));

  const cardio = proposal.kind === 'cardio' || proposal.kind === 'intervals' || proposal.kind === 'walk';
  const guidance = guidanceFor(resting);
  const band = cardio
    ? bandOf(guidance, proposal.kind === 'intervals' ? 'vigorous' : 'moderate')
    : null;

  const session: PlayerSession = {
    proposalId: proposal.id,
    kind: proposal.kind,
    plannedFor: proposal.plannedFor.toISOString(),
    movements: proposal.movements.map((entry) => {
      const previous = lastById.get(entry.movementId);
      return {
        movementId: entry.movementId,
        sets: entry.sets,
        target: entry.target,
        loadKg: entry.loadKg,
        restSeconds: entry.restSeconds || movementOf(entry.movementId)?.restSeconds || 60,
        lastWeek: previous
          ? {
              sets: previous.sets,
              achieved: previous.achieved,
              loadKg: previous.loadKg,
              rir: previous.rir,
              at: previous.at.toISOString(),
            }
          : null,
      };
    }),
    band: band
      ? {
          label: strings.intensity.bands[band.band],
          low: band.low,
          high: band.high,
        }
      : null,
  };

  return <SessionPlayer csrfToken={csrfToken} timeZone={timeZone} session={session} />;
}
