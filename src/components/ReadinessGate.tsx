'use client';

import { useState } from 'react';
import { SYMPTOM_KEYS, type SymptomKey } from '@/lib/readiness';
import { strings } from '@/lib/strings';

/**
 * The screening gate, ACSM 2015, three inputs and the published symptom list.
 *
 * PAR-Q+ IS NOT RE-IMPLEMENTED HERE OR ANYWHERE. Its terms forbid incorporating
 * it into an electronic survey or a derivative without written consent, and a
 * native screen is both. `tests/unit/no-licensed-text.test.ts` walks the
 * repository for its question strings and prints what it walked, so this is a
 * checked claim rather than a promise in a comment.
 *
 * THERE IS NO SCORE. The 2015 paper's output is a referral decision and it
 * removed risk-factor counting deliberately, verbatim, because it "may be
 * overly conservative and unnecessarily refer adults for medical clearance". A
 * percentage on top of that would put it straight back.
 */

const SYMPTOMS = strings.readiness.symptoms as Record<string, string>;
const OUTCOMES = strings.readiness.outcomes as Record<string, string>;

export type ReadinessAnswerView = {
  activity: string;
  knownDisease: boolean;
  symptoms: string[];
  desiredIntensity: string;
  outcome: string;
  answeredAt: string;
};

export function ReadinessGate({
  csrfToken,
  answered,
}: {
  csrfToken: string;
  answered: ReadinessAnswerView | null;
}) {
  const [activity, setActivity] = useState<'active' | 'inactive' | null>(
    answered ? (answered.activity as 'active' | 'inactive') : null,
  );
  const [knownDisease, setKnownDisease] = useState<boolean | null>(answered?.knownDisease ?? null);
  const [symptoms, setSymptoms] = useState<SymptomKey[]>(
    (answered?.symptoms ?? []) as SymptomKey[],
  );
  const [intensity, setIntensity] = useState<'lightModerate' | 'vigorous' | null>(
    answered ? (answered.desiredIntensity as 'lightModerate' | 'vigorous') : null,
  );
  const [outcome, setOutcome] = useState<string | null>(answered?.outcome ?? null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const complete = activity !== null && knownDisease !== null && intensity !== null;

  function toggle(symptom: SymptomKey) {
    setSymptoms((current) =>
      current.includes(symptom) ? current.filter((entry) => entry !== symptom) : [...current, symptom],
    );
  }

  async function save() {
    if (!complete) return;
    setSaving(true);
    setFailure(null);
    try {
      const response = await fetch('/api/train/readiness', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-vernier-csrf': csrfToken },
        body: JSON.stringify({
          activity,
          knownDisease,
          symptoms,
          desiredIntensity: intensity,
        }),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        readiness?: { outcome: string };
        detail?: string;
      };
      if (!response.ok) {
        setFailure(answer.detail ?? strings.trainWeek.errorBody);
        return;
      }
      setOutcome(answer.readiness?.outcome ?? null);
    } catch {
      setFailure(strings.trainWeek.errorBody);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="card" data-card="activity">
        <span className="lbl">{strings.readiness.activityLabel}</span>
        <div className="pick" style={{ marginTop: 'var(--s2)' }}>
          <button
            type="button"
            aria-pressed={activity === 'active'}
            onClick={() => setActivity('active')}
          >
            {strings.readiness.activityActive}
          </button>
          <button
            type="button"
            aria-pressed={activity === 'inactive'}
            onClick={() => setActivity('inactive')}
          >
            {strings.readiness.activityInactive}
          </button>
        </div>
      </section>

      <section className="card" data-card="disease">
        <span className="lbl">{strings.readiness.diseaseLabel}</span>
        <div className="pick" style={{ marginTop: 'var(--s2)' }}>
          <button type="button" aria-pressed={knownDisease === true} onClick={() => setKnownDisease(true)}>
            {strings.readiness.diseaseYes}
          </button>
          <button type="button" aria-pressed={knownDisease === false} onClick={() => setKnownDisease(false)}>
            {strings.readiness.diseaseNo}
          </button>
        </div>
      </section>

      {/*
        * The published list, in the order the paper prints it. Nine items, each
        * a control of its own, because "any of these" answered as one checkbox
        * is a question about nine different things.
        */}
      <section className="card" data-card="symptoms">
        <span className="lbl">{strings.readiness.symptomsLabel}</span>
        <div className="pick" style={{ marginTop: 'var(--s2)', flexDirection: 'column' }}>
          {SYMPTOM_KEYS.map((symptom) => (
            <button
              key={symptom}
              type="button"
              data-symptom={symptom}
              aria-pressed={symptoms.includes(symptom)}
              style={{ textAlign: 'left', width: '100%', padding: '10px 14px' }}
              onClick={() => toggle(symptom)}
            >
              {SYMPTOMS[symptom]}
            </button>
          ))}
        </div>
        {symptoms.length === 0 ? (
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.readiness.symptomsNone}
          </p>
        ) : null}
      </section>

      <section className="card" data-card="intensity">
        <span className="lbl">{strings.readiness.intensityLabel}</span>
        <div className="pick" style={{ marginTop: 'var(--s2)' }}>
          <button
            type="button"
            aria-pressed={intensity === 'lightModerate'}
            onClick={() => setIntensity('lightModerate')}
          >
            {strings.readiness.intensityLightModerate}
          </button>
          <button
            type="button"
            aria-pressed={intensity === 'vigorous'}
            onClick={() => setIntensity('vigorous')}
          >
            {strings.readiness.intensityVigorous}
          </button>
        </div>
      </section>

      {outcome ? (
        <section className="card" data-card="outcome" data-outcome={outcome}>
          <span className="lbl">{strings.readiness.outcomeLabel}</span>
          <p className="sub" style={{ marginTop: 'var(--s2)' }}>
            {OUTCOMES[outcome]}
          </p>
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.readiness.stopRule}
          </p>
        </section>
      ) : null}

      {failure ? (
        <div className="card error" data-state="error">
          <div className="head" style={{ marginTop: 0 }}>
            {strings.trainWeek.errorTitle}
          </div>
          <p className="sub">{failure}</p>
        </div>
      ) : null}

      <button
        type="button"
        className="btn primary block"
        disabled={!complete || saving}
        onClick={() => void save()}
      >
        {saving ? strings.readiness.saving : strings.readiness.save}
      </button>

      <p className="note" style={{ marginTop: 'var(--s3)' }} data-not-parq>
        {strings.readiness.notParq}
      </p>
    </>
  );
}
