'use client';

import { useState } from 'react';
import { movementName } from '@/lib/display';
import { embedUrlFor, videoIdFrom } from '@/lib/media-allowlist';
import { strings } from '@/lib/strings';

/**
 * The editorial check on a pasted link, screen by screen.
 *
 * F68 asks that a URL outside the allowlist is refused HERE, with a named
 * reason, rather than accepted and left to fail later as a black rectangle
 * mid-session. So a refusal is a card with the reason in words, and it says
 * plainly that nothing was stored.
 *
 * The accepted state renders the player it would use: a privacy-enhanced
 * iframe, fetched by this browser, from the host. NOTHING IS DRAWN OVER IT.
 * The Required Minimum Functionality forbids overlays, frames or any visual
 * element in front of an embedded player including its controls, and forbids
 * obscuring any part of it, so the caption sits under the box and there is no
 * positioned child inside it. That is a rule about markup, not about taste, and
 * `.embed` in the stylesheet says the same thing where a later edit would look
 * for it.
 */

const REFUSALS = strings.media.refusals as Record<string, string>;

type Result =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'accepted'; author: string; embedUrl: string; movementId: string }
  | { state: 'refused'; detail: string };

export function MediaEditor({
  csrfToken,
  movements,
}: {
  csrfToken: string;
  movements: string[];
}) {
  const [url, setUrl] = useState('');
  const [movementId, setMovementId] = useState(movements[0] ?? '');
  const [result, setResult] = useState<Result>({ state: 'idle' });

  async function check() {
    setResult({ state: 'checking' });
    try {
      const response = await fetch('/api/train/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vernier-csrf': csrfToken },
        body: JSON.stringify({ url, movementId }),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        record?: { author: string };
        embedUrl?: string;
        detail?: string;
        reason?: string;
      };
      if (!response.ok) {
        setResult({
          state: 'refused',
          detail: answer.detail ?? REFUSALS[String(answer.reason ?? 'notAVideoLink')],
        });
        return;
      }
      const id = videoIdFrom(url);
      setResult({
        state: 'accepted',
        author: answer.record?.author ?? '',
        embedUrl: answer.embedUrl ?? (id ? embedUrlFor(id) : ''),
        movementId,
      });
    } catch {
      setResult({ state: 'refused', detail: strings.api.train.hostUnreachableDetail });
    }
  }

  return (
    <section className="card" data-card="media-editor">
      <span className="lbl">{strings.media.addTitle}</span>
      <p className="sub" style={{ margin: '6px 0 var(--s3)' }}>
        {strings.media.addBody}
      </p>

      <div className="field-block">
        <label className="lbl" htmlFor="media-movement">
          {strings.media.movementLabel}
        </label>
        <select
          id="media-movement"
          className="input"
          value={movementId}
          onChange={(event) => setMovementId(event.target.value)}
        >
          {movements.map((id) => (
            <option key={id} value={id}>
              {movementName(id)}
            </option>
          ))}
        </select>
      </div>

      <div className="field-block">
        <label className="lbl" htmlFor="media-url">
          {strings.media.urlLabel}
        </label>
        <input
          id="media-url"
          className="input"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={strings.media.urlPlaceholder}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>

      <button
        type="button"
        className="btn block"
        disabled={result.state === 'checking' || url.trim() === ''}
        onClick={() => void check()}
      >
        {result.state === 'checking' ? strings.media.checking : strings.media.check}
      </button>

      {result.state === 'checking' ? (
        <div className="card" data-state="loading" aria-busy="true" aria-label={strings.media.loadingLabel}>
          <span className="skel" style={{ width: '60%', height: '13px', marginBottom: '8px' }} />
          <span className="skel" style={{ width: '85%', height: '13px' }} />
        </div>
      ) : null}

      {result.state === 'refused' ? (
        <div className="card error" data-state="refused" style={{ marginTop: 'var(--s3)', marginBottom: 0 }}>
          <div className="between">
            <span className="lbl">{strings.media.urlLabel}</span>
            <span className="chip a">{strings.media.refusedTitle}</span>
          </div>
          <p className="sub" data-refusal>
            {result.detail}
          </p>
        </div>
      ) : null}

      {result.state === 'accepted' ? (
        <div className="card" data-state="accepted" style={{ marginTop: 'var(--s3)', marginBottom: 0 }}>
          <div className="between">
            <span className="lbl">{strings.media.savedTitle}</span>
            <span className="chip g">{strings.media.modes.youtube_nocookie}</span>
          </div>
          <p className="sub">{strings.media.accepted(result.author)}</p>
          {result.embedUrl ? (
            <iframe
              className="embed"
              data-embed="youtube-nocookie"
              src={result.embedUrl}
              title={strings.catalogue.mediaAlt(movementName(result.movementId))}
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
            />
          ) : null}
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.media.embedNote}
          </p>
          <p className="note">{strings.media.offlineNote}</p>
        </div>
      ) : null}
    </section>
  );
}
