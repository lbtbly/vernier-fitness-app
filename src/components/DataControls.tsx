'use client';

import { useState } from 'react';
import { InfoIcon, TrashIcon, WarnIcon } from '@/components/icons';
import type { CategoryPreview } from '@/db/purge';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { categoryLabel } from '@/lib/display';
import { strings } from '@/lib/strings';

/**
 * The two controls on this screen that write: back up now, and delete a
 * category permanently.
 *
 * THE DELETE IS BEHIND A PHRASE THE OWNER TYPES, and the phrase names the
 * category, so one copied out of a previous confirmation cannot be pasted into
 * the next and take something he did not mean. The button is disabled until the
 * phrase matches exactly. That is the screen's half of the check; the database
 * recomputes the same phrase and refuses anything else, which is the half that
 * holds when the screen is bypassed.
 *
 * WHAT IT SAYS AFTERWARDS IS THE ZERO AND THE POPULATION IT COVERS. "Nothing is
 * left in this category" beside "1,284 rows deleted" is a fact; on its own it is
 * indistinguishable from a category that was empty to begin with, and the two
 * are different things that need different words.
 *
 * One accented action per screen, and on this screen it is Back up now: the
 * thing due now. The delete is `btn danger`, which is a border and not a fill,
 * because DESIGN.md section 5's third decision reserves accent for the thing
 * the owner came here to do.
 */

type Props = {
  csrfToken: string;
  categories: CategoryPreview[];
  archiveRunning: boolean;
};

type Notice = { tone: 'plain' | 'alert'; body: string };

export function DataControls(props: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [categories, setCategories] = useState(props.categories);
  const [chosen, setChosen] = useState(props.categories[0]?.category ?? 'body');
  const [phrase, setPhrase] = useState('');

  const preview = categories.find((category) => category.category === chosen) ?? null;
  const expected = preview?.phrase ?? '';
  const matches = phrase.trim() === expected && expected !== '';

  async function send(path: string, body: unknown) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: props.csrfToken },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, data };
  }

  async function onBackUpNow() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await send('/api/backup/run', {});
      if (result.status !== 200) {
        setNotice({
          tone: 'alert',
          body: String(result.data.detail ?? result.data.error ?? ''),
        });
        return;
      }
      const run = result.data.run as { fileName: string };
      setNotice({ tone: 'plain', body: strings.data.archiveDone(run.fileName) });
      // The card above this one is server rendered from the row the archive just
      // wrote, so the screen is re-read rather than patched from the answer: two
      // sources for one fact is how a screen starts disagreeing with itself.
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!matches || !preview) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await send('/api/data/delete', { category: chosen, phrase });
      if (result.status !== 200) {
        setNotice({
          tone: 'alert',
          body:
            result.status === 422
              ? strings.data.deleteRefused
              : String(result.data.detail ?? result.data.error ?? ''),
        });
        return;
      }
      const outcome = result.data.outcome as { rows: number };
      setPhrase('');
      setNotice({
        tone: 'plain',
        body: outcome.rows === 0 ? strings.data.deleteNothing : strings.data.deleteDone(outcome.rows),
      });
      setCategories((held) =>
        held.map((category) =>
          category.category === chosen
            ? { ...category, rows: 0, files: 0, tables: category.tables.map((table) => ({ ...table, rows: 0 })) }
            : category,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="actions" data-archive-controls="true">
        <button
          type="button"
          className="btn primary block"
          onClick={onBackUpNow}
          disabled={busy || props.archiveRunning}
          data-action="back-up-now"
        >
          {busy ? strings.data.archiveRunning2 : strings.data.archiveRunNow}
        </button>
        <a className="btn block" href="#restore">
          {strings.data.archiveGuide}
        </a>
      </div>

      <section className="card" data-card="delete" style={{ borderColor: 'var(--alert)' }}>
        <span className="lbl">{strings.data.deleteTitle}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {strings.data.deleteBody}
        </p>

        <label className="formfield" style={{ marginTop: 'var(--s4)' }}>
          <span className="lbl">{strings.data.deleteChoose}</span>
          <select
            className="input"
            value={chosen}
            data-delete-category="true"
            onChange={(event) => {
              setChosen(event.target.value);
              setPhrase('');
              setNotice(null);
            }}
          >
            {categories.map((category) => (
              <option key={category.category} value={category.category}>
                {categoryLabel(category.category)}
              </option>
            ))}
          </select>
        </label>

        <div className="row">
          <span className="grow sub mut">{categoryLabel(chosen)}</span>
          <span className="num" data-delete-rows={preview?.rows ?? 0}>
            {preview && preview.rows > 0
              ? strings.data.deleteCount(preview.rows, preview.tables.length)
              : strings.data.deleteEmpty}
          </span>
        </div>

        <label className="formfield" style={{ marginTop: 'var(--s3)' }}>
          <span className="lbl">{strings.data.deletePhraseLabel(expected)}</span>
          <input
            className="input"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={phrase}
            data-delete-phrase="true"
            onChange={(event) => setPhrase(event.target.value)}
          />
        </label>
        <p className="note">{strings.data.deletePhraseHelp}</p>

        <div className="actions">
          <button
            type="button"
            className="btn danger block"
            onClick={onDelete}
            disabled={busy || !matches}
            data-action="delete-category"
          >
            <TrashIcon />
            {busy ? strings.data.deleteWorking : strings.data.deleteAction}
          </button>
        </div>

        <p className="note" style={{ marginTop: 'var(--s3)' }}>
          {strings.data.deleteKept}
        </p>

        {notice ? (
          <div
            className={notice.tone === 'alert' ? 'banner a' : 'banner'}
            role="status"
            data-delete-notice={notice.tone}
            style={{ marginTop: 'var(--s3)' }}
          >
            {notice.tone === 'alert' ? <WarnIcon /> : <InfoIcon />}
            <div>{notice.body}</div>
          </div>
        ) : null}
      </section>
    </>
  );
}
