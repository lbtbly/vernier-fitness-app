'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { DocIcon, WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * The one control that starts an import, and the four states it can be in.
 *
 * Loading is real here rather than decorative: a three-page panel takes a few
 * seconds to parse and a scanned page takes longer, so the card says what is
 * happening and the control is disabled while it happens. Error is screen 00's
 * card with the cause in words: a file that is not a PDF, a file too large, a
 * document with no result rows in it, or a scanned page with no recogniser
 * installed. Every one of those leaves the volume as it found it.
 *
 * This control stores no measurement. It builds a review, and the answer says
 * `stored: 0` out loud so a test can read the number rather than infer it.
 */

const UPLOAD_ENDPOINT = '/api/labs/upload';

type Failure =
  | { error: string; detail: string; authored: 'vernier' }
  | { error: string; caught: unknown; authored: 'platform' };

export function LabUpload({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const field = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function send(file: File) {
    setBusy(true);
    setFailure(null);
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch(UPLOAD_ENDPOINT, {
        method: 'POST',
        headers: { [CSRF_HEADER]: csrfToken },
        body: form,
      });
      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !body.id) {
        setFailure({
          error: body.error ?? strings.api.labs.failed,
          detail: body.detail ?? strings.api.labs.failedDetail,
          authored: 'vernier',
        });
        return;
      }
      router.push(`/health/labs/${body.id}`);
      router.refresh();
    } catch (error) {
      setFailure({ error: strings.api.labs.failed, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
      if (field.current) field.current.value = '';
    }
  }

  if (busy) {
    return (
      <section className="card" data-card="upload" data-state="loading" aria-busy="true">
        <span className="lbl">{strings.labs.uploadLabel}</span>
        <div className="head">{strings.labs.uploading}</div>
        <p className="sub">{strings.labs.uploadingNote}</p>
        <span className="skel" style={{ width: '100%', height: '48px', marginTop: 'var(--s3)' }} />
      </section>
    );
  }

  return (
    <section className="card" data-card="upload">
      <div className="between">
        <span className="lbl">{strings.labs.uploadLabel}</span>
        <DocIcon className="ch" />
      </div>
      <p className="sub" style={{ marginTop: 'var(--s2)' }}>
        {strings.labs.uploadNote}
      </p>
      <label className="formfield filefield" htmlFor="lab-file" style={{ marginTop: 'var(--s3)' }}>
        <span className="lbl">{strings.labs.uploadAction}</span>
        <input
          id="lab-file"
          ref={field}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
        />
      </label>

      {failure ? (
        <div className="card error" data-state="error" role="alert" style={{ marginTop: 'var(--s3)' }}>
          <div className="between">
            <span className="lbl">{strings.labs.uploadLabel}</span>
            <span className="chip a">
              <WarnIcon />
              {strings.error.failedChip}
            </span>
          </div>
          <div className="head">{failure.error}</div>
          <p className="sub">
            {failure.authored === 'platform' ? (
              <span data-authored="platform" ref={carryTheCaughtObject(failure.caught)}>
                {messageOf(failure.caught)}
              </span>
            ) : (
              <span data-authored="vernier">{failure.detail}</span>
            )}
          </p>
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {strings.error.lead}
          </p>
          <div className="actions">
            <button type="button" className="btn grow" onClick={() => setFailure(null)}>
              {strings.error.action}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
