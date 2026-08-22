'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronIcon, CloudOffIcon, WarnIcon } from '@/components/icons';
import { depth, subscribe } from '@/lib/outbox';
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
 * The three it carries today: the outbox count, which is screen 03 frame 2 and
 * DESIGN.md section 4's one-line banner with the queue count; the sources that
 * have gone quiet; and the imports waiting on an answer.
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

/** The outbox count, as a notice. Client-side, because only this phone knows it. */
function queueNotice(queued: number): Notice | null {
  if (queued === 0) return null;
  return {
    id: 'queue',
    tone: 'plain',
    summary: strings.quickLog.offlineSummary(queued),
    lines: [`${strings.quickLog.offlineTitle}. ${strings.quickLog.offlineBody(queued)}`],
  };
}

export function NoticeRegion({ notices }: { notices: Notice[] }) {
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const refresh = () => {
      void depth().then(setQueued);
    };
    const unsubscribe = subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);

  // The queue first: it is the owner's own writing, and it is the one notice
  // that appears in the second after he presses Save.
  const queue = queueNotice(queued);
  const all = queue ? [queue, ...notices] : notices;
  if (all.length === 0) return null;

  const warn = all.some((notice) => notice.tone === 'warn');
  const Icon = all.length === 1 && !warn ? CloudOffIcon : WarnIcon;
  const line = all.length === 1 ? all[0].summary : strings.notices.summary(all.length);

  return (
    <details
      className={warn ? 'notices banner w' : 'notices banner'}
      data-notices={all.length}
      data-state={queue ? 'offline' : undefined}
      aria-live="polite"
    >
      <summary data-notice-summary={all.length}>
        <Icon />
        <b className="grow">{line}</b>
        <ChevronIcon className="ch" />
      </summary>
      <div className="noticelines">
        {all.map((notice) =>
          notice.href ? (
            <Link className="noticeline" key={notice.id} data-notice={notice.id} href={notice.href}>
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
