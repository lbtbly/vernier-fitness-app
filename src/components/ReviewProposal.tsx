'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CloseIcon, OkIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { strings } from '@/lib/strings';
import type { ProposalBlock, ProposalBlockId } from '@/lib/weekly-review';

/**
 * Next week's three blocks, screen 11 frame 2.
 *
 * ONE DECISION, ONE BLOCK, AND NO CONTROL THAT COMMITS THE WEEK. Accepting the
 * training says nothing about the menu and declining the menu says nothing
 * about the shopping. That is DESIGN.md section 5's first decision and it is
 * the same shape src/components/TrainWeek.tsx already uses for the training
 * week: each control posts its own block, the answer comes back carrying all
 * three states, and the screen renders what the server said rather than what it
 * hoped. A decision that left the other two alone can therefore be read off the
 * markup, because the markup came from the database.
 *
 * NOTHING HERE WRITES TO A CALENDAR. The footer counts what has been decided
 * and commits nothing; the calendar diff is its own screen and its own consent.
 */

type Failure = { id: string; detail: string } | null;

const HREFS: Record<ProposalBlockId, { href: string; label: string } | null> = {
  training: { href: '/train', label: strings.review.proposalOpenWeek },
  nutrition: { href: '/eat', label: strings.review.proposalOpenMenu },
  shopping: { href: '/eat/shopping', label: strings.review.proposalOpenList },
};

export function ReviewProposal({
  csrfToken,
  weekStart,
  blocks,
  connectedCalendar,
}: {
  csrfToken: string;
  weekStart: string;
  blocks: ProposalBlock[];
  connectedCalendar: boolean;
}) {
  const [states, setStates] = useState<Record<string, ProposalBlock['state']>>(
    Object.fromEntries(blocks.map((block) => [block.id, block.state])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure>(null);

  async function decide(block: ProposalBlockId, state: 'accepted' | 'rejected') {
    setBusy(block);
    setFailure(null);
    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({ weekStart, block, state }),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        decisions?: Record<string, ProposalBlock['state']>;
        detail?: string;
      };
      if (!response.ok || !answer.decisions) {
        setFailure({ id: block, detail: answer.detail ?? strings.api.review.bodyDetail });
        return;
      }
      setStates(answer.decisions);
    } catch {
      // The request never reached the Mac mini. Nothing was written, and the
      // card says exactly that rather than leaving a block looking decided.
      setFailure({ id: block, detail: strings.api.review.bodyDetail });
    } finally {
      setBusy(null);
    }
  }

  const accepted = blocks.filter((block) => states[block.id] === 'accepted').length;
  const declined = blocks.filter((block) => states[block.id] === 'rejected').length;

  return (
    <>
      {blocks.map((block) => {
        const state = states[block.id] ?? 'proposed';
        const onward = HREFS[block.id];
        return (
          <section className="card" key={block.id} data-block={block.id} data-state={state}>
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <div className="stack grow">
                <span className="lbl">{block.label}</span>
                <span className="head" style={{ marginTop: '2px' }}>
                  {block.headline}
                </span>
              </div>
              <div className="seg" role="group" aria-label={block.label}>
                <button
                  type="button"
                  className="ok"
                  data-decision="accept"
                  aria-pressed={state === 'accepted'}
                  aria-label={`${strings.review.proposalAccept}. ${block.label}`}
                  disabled={busy === block.id}
                  onClick={() => void decide(block.id, 'accepted')}
                >
                  <OkIcon />
                </button>
                <button
                  type="button"
                  className="no"
                  data-decision="reject"
                  aria-pressed={state === 'rejected'}
                  aria-label={`${strings.review.proposalReject}. ${block.label}`}
                  disabled={busy === block.id}
                  onClick={() => void decide(block.id, 'rejected')}
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            {block.cause ? (
              <p className="reason" data-cause>
                {block.cause}
              </p>
            ) : null}

            <div className="between" style={{ marginTop: '10px' }}>
              <span className="chip" data-block-state={state}>
                {strings.review.proposalStates[state]}
              </span>
              {onward ? (
                <Link className="btn quiet" href={onward.href}>
                  {onward.label}
                </Link>
              ) : null}
            </div>

            {failure && failure.id === block.id ? (
              <div
                className="card error"
                data-state="error"
                style={{ marginTop: '10px', marginBottom: 0 }}
              >
                <div className="head" style={{ marginTop: 0 }}>
                  {strings.api.review.failed}
                </div>
                <p className="sub">{failure.detail}</p>
              </div>
            ) : null}
          </section>
        );
      })}

      {/*
        * The calendar, as a state rather than as a control that leads nowhere.
        * Writing to a calendar is its own consent and its own confirm screen;
        * until one is connected this says what would happen and where to
        * connect it.
        */}
      <section className="card flat" style={{ borderStyle: 'dashed' }} data-calendar={connectedCalendar ? 'connected' : 'absent'}>
        <span className="lbl">{strings.review.calendarLabel}</span>
        <div className="head">
          {connectedCalendar ? strings.review.calendarConnected : strings.review.calendarNotConnected}
        </div>
        <p className="sub">
          {connectedCalendar
            ? strings.review.calendarConnectedBody
            : strings.review.calendarNotConnectedBody}
        </p>
        {connectedCalendar ? null : (
          <div className="actions">
            <Link className="btn block" href="/settings">
              {strings.review.calendarConnect}
            </Link>
          </div>
        )}
      </section>

      <div className="stickyfoot">
        <div className="between" style={{ marginBottom: '10px' }}>
          <span className="sub" data-decided>
            {strings.review.proposalDecided(accepted, declined)}
          </span>
        </div>
        <p className="note centre">{strings.review.proposalNote}</p>
      </div>
    </>
  );
}
