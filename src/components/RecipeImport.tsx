'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { type ArtifactKind, ARTIFACT_KINDS } from '@/lib/recipe-box';
import { strings } from '@/lib/strings';

/**
 * Four ways to import one recipe, and all four end on this machine.
 *
 * THE FOUR ARE THE LINE. F91 says a recipe imports from a pasted link, an
 * uploaded document, a photograph or manual entry, "parsed locally from that
 * single artifact". Each control here names what it does with the artifact
 * before it is used, because the interesting property of this screen is what it
 * does NOT do: there is no sign-in, no account, no schedule, and no request to
 * any provider from anywhere in this product.
 *
 * The name and the portions are always askable. A link gives a name from its
 * own slug; the other three do not, and asking is better than inventing one.
 */

type Failure =
  | { title: string; detail: string; authored: 'vernier' }
  | { title: string; caught: unknown; authored: 'platform' };

type Imported = { name: string; servings: number; matched: number; unmatched: number };

export function RecipeImport({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<ArtifactKind>('link');
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [servings, setServings] = useState('2');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Imported | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  async function submit() {
    setBusy(true);
    setFailure(null);
    setDone(null);
    try {
      const response =
        kind === 'document' || kind === 'photo'
          ? await sendFile()
          : await fetch('/api/meals/box', {
              method: 'POST',
              headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
              body: JSON.stringify({ kind, link, name, servings: Number(servings), text }),
            });
      if (!response) return;
      const answer = (await response.json().catch(() => ({}))) as {
        recipe?: Imported;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !answer.recipe) {
        setFailure({
          title: answer.error ?? strings.meals.errorTitle,
          detail: answer.detail ?? strings.meals.errorBodyRest,
          authored: 'vernier',
        });
        return;
      }
      setDone(answer.recipe);
      router.refresh();
    } catch (error) {
      setFailure({ title: strings.meals.errorTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
    }
  }

  async function sendFile(): Promise<Response | null> {
    if (!file) {
      setFailure({
        title: strings.api.meals.badArtifact,
        detail: strings.api.meals.badArtifactDetail,
        authored: 'vernier',
      });
      return null;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    form.append('name', name);
    form.append('servings', servings);
    return fetch('/api/meals/box', {
      method: 'POST',
      headers: { [CSRF_HEADER]: csrfToken },
      body: form,
    });
  }

  return (
    <div data-recipe-import={kind}>
      <div className="pick" role="group" style={{ marginBottom: 'var(--s3)' }}>
        {ARTIFACT_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={kind === option}
            data-kind={option}
            onClick={() => {
              setKind(option);
              setDone(null);
            }}
          >
            <span>{strings.meals.boxMethods[option]}</span>
            <span className="note">{strings.meals.boxMethodNotes[option]}</span>
          </button>
        ))}
      </div>

      {kind === 'link' ? (
        <label className="formfield" htmlFor="box-link">
          <span className="lbl">{strings.meals.boxLinkLabel}</span>
          <input
            id="box-link"
            className="input"
            inputMode="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
          />
        </label>
      ) : null}

      {kind === 'document' || kind === 'photo' ? (
        <label className="filefield" htmlFor="box-file">
          <span className="lbl">{strings.meals.boxMethods[kind]}</span>
          <input
            id="box-file"
            type="file"
            accept={kind === 'document' ? 'application/pdf' : 'image/*'}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
      ) : null}

      {kind === 'manual' ? (
        <label className="formfield" htmlFor="box-text">
          <span className="lbl">{strings.meals.boxTextLabel}</span>
          <textarea
            id="box-text"
            className="input ta"
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
      ) : null}

      <label className="formfield" htmlFor="box-name">
        <span className="lbl">{strings.meals.boxNameLabel}</span>
        <input
          id="box-name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="formfield" htmlFor="box-servings">
        <span className="lbl">{strings.meals.boxServingsLabel}</span>
        <input
          id="box-servings"
          className="input num"
          inputMode="numeric"
          value={servings}
          onChange={(event) => setServings(event.target.value)}
        />
      </label>

      <button
        type="button"
        className="btn primary block"
        disabled={busy}
        data-action="import"
        onClick={() => void submit()}
      >
        {strings.meals.boxImportAction}
      </button>

      {done ? (
        <div className="card" data-state="imported" style={{ marginTop: 'var(--s3)' }}>
          <div className="head">{strings.meals.boxImported(done.name, done.servings)}</div>
          <p className="sub">{strings.meals.boxParsed(done.name, done.matched)}</p>
          {done.unmatched > 0 ? (
            <p className="note warn">{strings.meals.boxUnmatched(done.unmatched)}</p>
          ) : null}
        </div>
      ) : null}

      {failure ? (
        <div className="card error" role="alert" data-state="error" style={{ marginTop: 'var(--s3)' }}>
          <div className="between">
            <span className="lbl">{strings.meals.boxTitle}</span>
            <span className="chip a">
              <WarnIcon />
              {strings.error.failedChip}
            </span>
          </div>
          <div className="head">{failure.title}</div>
          <p className="sub">
            {failure.authored === 'platform' ? (
              <span data-authored="platform" ref={carryTheCaughtObject(failure.caught)}>
                {messageOf(failure.caught)}
              </span>
            ) : (
              <span data-authored="vernier">{failure.detail}</span>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
