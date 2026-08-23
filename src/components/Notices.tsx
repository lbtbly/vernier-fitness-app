import Link from 'next/link';
import { ChevronIcon, WarnIcon } from '@/components/icons';
import { strings } from '@/lib/strings';

/**
 * Everything Today raises between its title and its first card, in one region
 * whose height is fixed.
 *
 * WHY THIS EXISTS AT ALL. F27 puts five things inside 715 px at 393x852, and
 * every notice Today can raise is data: how many sources have gone quiet, how
 * many imports disagree with a correction, how many entries are still on the
 * phone. Each one shipped as its own banner, so the room they took was a
 * function of how much was wrong. One quiet source fitted. Two quiet sources
 * added 41 px and put the weight trend 27 px under the fold. One open question
 * added 70 px more and put it 43 px under, in Chrome and in WebKit alike. That
 * was fixed twice, once per element, and the second element proved the fix was
 * aimed at the wrong thing: the defect is not any one banner, it is that a
 * region above the fold was allowed to grow with the data. Slices 5 to 14 add
 * more of them.
 *
 * SO THE REGION IS THE THING, AND IT IS ONE LINE. One row under the title,
 * always, whatever it holds and however many. Its height is fixed by the CSS
 * rather than by the copy: `.notices > summary` is `--touch` tall and its text
 * is clamped to one line, so no string anybody writes later can grow it. Add a
 * fourth notice in slice 7 and the fold does not move.
 *
 * NOTHING IS HIDDEN. Silence is the panel's first finding and an unanswered
 * question is exactly what the owner has to see, so nothing here is dropped,
 * truncated away or held back until some threshold: every notice is one tap
 * under the line, unabridged, in the order it was raised, and each one still
 * ships its own chip, cause sentence and hatched range in the card it belongs
 * to. What the region bounds is the room, not the information.
 *
 * AND AN OFFLINE QUEUE IS NOT A NOTICE. It was one here for a while, folded in
 * to bound its height, and `.forge/RULING-SLICE-4.md` question 2 refused that on
 * three grounds: the warn colour on a queue that needs no attention, a count
 * that could only be read after a tap when DESIGN.md section 4 and F24 both put
 * it on the line, and "2 things are waiting on you" said of entries that are
 * waiting on the network. A notice is something the owner must act on and their
 * number is unbounded; a queue clears itself. It ships as its own neutral line
 * in `Queue.tsx`, bounded there the same structural way this is bounded here.
 *
 * The two this carries today: the sources that have gone quiet, and the imports
 * waiting on an answer. Server-rendered, because both are facts the Mac mini
 * holds; the queue is the one thing on this screen only the phone knows.
 */

export type NoticeTone = 'warn' | 'plain';

export type Notice = {
  /** Stable, and the value of `data-notice` on the line it draws. */
  id: string;
  tone: NoticeTone;
  /** The one line, when this notice is the only one. Kept short; clamped anyway. */
  summary: string;
  /** The detail, unabridged. One entry per thing this notice is about. */
  lines: string[];
  /** Where the tap goes, when there is somewhere for it to go. */
  href?: string;
};

export function NoticeRegion({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;

  const warn = notices.some((notice) => notice.tone === 'warn');
  const line = notices.length === 1 ? notices[0].summary : strings.notices.summary(notices.length);

  return (
    <details
      className={warn ? 'notices banner w' : 'notices banner'}
      data-notices={notices.length}
      aria-live="polite"
    >
      <summary data-notice-summary={notices.length}>
        <WarnIcon />
        <b className="grow">{line}</b>
        <ChevronIcon className="ch" />
      </summary>
      <div className="noticelines">
        {notices.map((notice) =>
          notice.href ? (
            <Link prefetch={false} className="noticeline" key={notice.id} data-notice={notice.id} href={notice.href}>
              <span className="grow">{notice.lines.join(' ')}</span>
              <ChevronIcon className="ch" />
            </Link>
          ) : (
            <div className="noticeline" key={notice.id} data-notice={notice.id}>
              <span className="grow">
                {notice.lines.map((text, index) => (
                  <span className="noticedetail" key={`${notice.id}-${index}`}>
                    {text}
                  </span>
                ))}
              </span>
            </div>
          ),
        )}
      </div>
    </details>
  );
}
