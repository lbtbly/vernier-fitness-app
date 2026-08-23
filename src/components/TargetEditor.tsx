'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MacroLine } from '@/components/Macros';
import { WarnIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import {
  NUTRITION,
  macroTargets,
  maxWeeklyLossKg,
  planTarget,
  type PalLevel,
  type Sex,
  type TargetVerdict,
} from '@/lib/nutrition';
import { carryTheCaughtObject, messageOf } from '@/lib/platform-cause';
import { strings } from '@/lib/strings';

/**
 * The daily target, and the three floors, on the screen that sets it.
 *
 * THE PREVIEW AND THE SERVER RUN THE SAME FUNCTION. `planTarget` is pure and
 * owns all three thresholds, so what this screen shows as the owner types and
 * what the route decides on Save cannot disagree. The route is still the
 * authority: nothing here writes, and a refusal rendered below is the verdict
 * the server sent back rather than a second opinion computed locally.
 *
 * THE THREE FLOORS, EACH IMPLEMENTED AND NONE OF THEM PROMISED:
 *
 *   RATE     above one percent of body weight a week is REFUSED. There is no
 *            confirm control on that card, because there is no confirmation
 *            that unlocks it. The only thing offered is the nearest compliant
 *            rate, and tapping it puts that rate in the field.
 *   FLOOR    under 1500 kcal for a man is BLOCKED. Save is replaced by a card
 *            that names a doctor or a registered dietitian, and only an
 *            explicit confirmation on that card sends the write. The check
 *            constraint in 0009 refuses the row without it as well.
 *   RESTING  under the estimated resting figure is ALLOWED, with a caution
 *            naming the figure it is under.
 */

type Failure =
  | { title: string; detail: string; authored: 'vernier' }
  | { title: string; caught: unknown; authored: 'platform' };

const ENDPOINT = '/api/nutrition/targets';
const LEVELS: PalLevel[] = ['sedentary', 'light', 'active', 'veryActive'];

function numberOf(text: string): number {
  return Number(text.replace(',', '.'));
}

export function TargetEditor({
  csrfToken,
  initial,
  weightSource,
}: {
  csrfToken: string;
  initial: {
    sex: Sex;
    ageYears: string;
    heightCm: string;
    weightKg: string;
    level: PalLevel;
    rateKgPerWeek: string;
  };
  /** Where the prefilled weight came from, so the number is never anonymous. */
  weightSource: string | null;
}) {
  const router = useRouter();
  const [sex, setSex] = useState<Sex>(initial.sex);
  const [age, setAge] = useState(initial.ageYears);
  const [height, setHeight] = useState(initial.heightCm);
  const [weight, setWeight] = useState(initial.weightKg);
  const [level, setLevel] = useState<PalLevel>(initial.level);
  const [rate, setRate] = useState(initial.rateKgPerWeek);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [serverVerdict, setServerVerdict] = useState<TargetVerdict | null>(null);

  const body = {
    sex,
    ageYears: Math.round(numberOf(age)),
    heightCm: numberOf(height),
    weightKg: numberOf(weight),
  };
  const usable =
    Number.isFinite(body.ageYears) &&
    Number.isFinite(body.heightCm) &&
    Number.isFinite(body.weightKg) &&
    body.weightKg > 0 &&
    Number.isFinite(numberOf(rate));

  const preview: TargetVerdict | null = usable
    ? planTarget({ body, level, rateKgPerWeek: numberOf(rate), hardFloorConfirmed: false })
    : null;
  const verdict = serverVerdict ?? preview;

  async function save(hardFloorConfirmed: boolean) {
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify({
          sex,
          ageYears: age,
          heightCm: height,
          weightKg: weight,
          level,
          rateKgPerWeek: rate,
          hardFloorConfirmed,
        }),
      });
      const answer = (await response.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        verdict?: TargetVerdict;
      };
      if (!response.ok) {
        setServerVerdict(answer.verdict ?? null);
        setFailure({
          title: answer.error ?? strings.nutrition.targetRefusedTitle,
          detail: answer.detail ?? strings.api.targets.bodyDetail,
          authored: 'vernier',
        });
        return;
      }
      setServerVerdict(answer.verdict ?? null);
      setSaved(true);
      router.refresh();
    } catch (error) {
      setFailure({ title: strings.nutrition.targetRefusedTitle, caught: error, authored: 'platform' });
    } finally {
      setBusy(false);
    }
  }

  const ceiling = Number.isFinite(body.weightKg) && body.weightKg > 0 ? maxWeeklyLossKg(body.weightKg) : 0;
  const macros =
    verdict && verdict.outcome === 'allowed' ? macroTargets(verdict.kcal, body.weightKg) : null;

  return (
    <div data-target-editor="open">
      <section className="card" data-card="equation">
        <div className="between">
          <span className="lbl">{strings.nutrition.equationLabel}</span>
          <span className="src">{strings.nutrition.equationName}</span>
        </div>
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {strings.nutrition.equationCitation}
        </p>

        <span className="lbl" id="target-sex" style={{ display: 'block', margin: 'var(--s4) 0 var(--s2)' }}>
          {strings.nutrition.sexLabel}
        </span>
        <div className="pick" role="group" aria-labelledby="target-sex">
          {(['male', 'female'] as Sex[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={sex === option}
              data-sex={option}
              onClick={() => setSex(option)}
            >
              {option === 'male' ? strings.nutrition.sexMale : strings.nutrition.sexFemale}
            </button>
          ))}
        </div>

        <label className="formfield" htmlFor="target-age" style={{ marginTop: 'var(--s4)' }}>
          <span className="lbl">{strings.nutrition.ageLabel}</span>
          <input
            id="target-age"
            className="input num"
            inputMode="numeric"
            value={age}
            onChange={(event) => setAge(event.target.value)}
          />
        </label>
        <label className="formfield" htmlFor="target-height">
          <span className="lbl">{strings.nutrition.heightLabel}</span>
          <input
            id="target-height"
            className="input num"
            inputMode="decimal"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
          />
        </label>
        <label className="formfield" htmlFor="target-weight">
          <span className="lbl">{strings.nutrition.weightLabel}</span>
          <input
            id="target-weight"
            className="input num"
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </label>
        {weightSource ? <p className="note">{weightSource}</p> : null}
      </section>

      <section className="card" data-card="activity">
        <span className="lbl" id="target-level">
          {strings.nutrition.activityLabel}
        </span>
        <p className="note" style={{ margin: 'var(--s2) 0' }}>
          {strings.nutrition.activityBandNote}
        </p>
        <div className="pick" role="group" aria-labelledby="target-level">
          {LEVELS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={level === option}
              data-level={option}
              onClick={() => setLevel(option)}
            >
              {strings.nutrition.activityLevels[option]}
              <span className="note">
                {strings.nutrition.palValue(NUTRITION.pal[option].toFixed(2))}{' '}
                {strings.nutrition.activityDescriptions[option]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="card" data-card="rate">
        <label className="formfield" htmlFor="target-rate">
          <span className="lbl">{strings.nutrition.rateLabel}</span>
          <input
            id="target-rate"
            className="input num"
            inputMode="decimal"
            value={rate}
            onChange={(event) => {
              setRate(event.target.value);
              setServerVerdict(null);
            }}
          />
        </label>
        <p className="note">{strings.nutrition.rateNote}</p>
      </section>

      {verdict && verdict.outcome === 'rate_refused' ? (
        <section className="card error" role="alert" data-state="rate-refused">
          <div className="between">
            <span className="lbl">{strings.nutrition.rateLabel}</span>
            <span className="chip a">
              <WarnIcon />
              {strings.error.failedChip}
            </span>
          </div>
          <div className="head">{strings.nutrition.rateRefusedTitle}</div>
          <p className="sub">
            {strings.nutrition.rateRefusedBody(
              verdict.requestedRate.toFixed(2),
              verdict.offeredRate.toFixed(2),
              verdict.weightKg.toFixed(1),
            )}
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn primary block"
              data-control="use-compliant-rate"
              onClick={() => {
                setRate(verdict.offeredRate.toFixed(2));
                setServerVerdict(null);
              }}
            >
              {strings.nutrition.rateOffer(verdict.offeredRate.toFixed(2))}
            </button>
          </div>
        </section>
      ) : null}

      {verdict && verdict.outcome === 'blocked_below_floor' ? (
        <section className="card error" role="alert" data-state="blocked-below-floor">
          <div className="between">
            <span className="lbl">{strings.nutrition.targetsTitle}</span>
            <span className="chip a">
              <WarnIcon />
              {strings.error.failedChip}
            </span>
          </div>
          <div className="head">{strings.nutrition.blockedTitle}</div>
          <p className="sub">{strings.nutrition.blockedBody(String(verdict.kcal), verdict.floor)}</p>
          <p className="sub" style={{ marginTop: 'var(--s2)' }} data-professional="true">
            {strings.nutrition.blockedProfessional}
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              data-control="confirm-below-floor"
              onClick={() => void save(true)}
            >
              {strings.nutrition.blockedConfirm}
            </button>
            <button
              type="button"
              className="btn primary"
              data-control="raise-target"
              onClick={() => {
                setRate('0.5');
                setServerVerdict(null);
              }}
            >
              {strings.nutrition.blockedCancel}
            </button>
          </div>
        </section>
      ) : null}

      {verdict && verdict.outcome === 'allowed' && macros ? (
        <section className="card" data-card="preview" data-state="allowed">
          <dl>
            <div className="field">
              <dt>{strings.nutrition.restingLabel}</dt>
              <dd className="num" data-rmr={Math.round(verdict.rmr)}>
                {Math.round(verdict.rmr)} {strings.units.kcal}
              </dd>
            </div>
            <div className="field">
              <dt>{strings.nutrition.tdeeLabel}</dt>
              <dd className="num" data-tdee={Math.round(verdict.tdee)}>
                {Math.round(verdict.tdee)} {strings.units.kcal}
              </dd>
            </div>
            <div className="field">
              <dt>{strings.nutrition.dailyTarget}</dt>
              <dd className="num" data-kcal-target={verdict.kcal}>
                {verdict.kcal} {strings.units.kcal}
              </dd>
            </div>
          </dl>
          <div style={{ marginTop: 'var(--s3)' }}>
            <MacroLine
              macros={{
                kcal: macros.kcal,
                proteinG: macros.proteinG,
                carbG: macros.carbG,
                fatG: macros.fatG,
                fibreG: macros.fibreG,
              }}
            />
          </div>
          {verdict.cautions.includes('below_resting') ? (
            <p className="note warn" style={{ marginTop: 'var(--s2)' }} data-caution="below-resting">
              {strings.nutrition.cautionBelowResting(String(verdict.kcal), String(Math.round(verdict.rmr)))}
            </p>
          ) : null}
          {verdict.cautions.includes('deficit_above_cap') ? (
            <p className="note warn" style={{ marginTop: 'var(--s2)' }} data-caution="deficit-cap">
              {strings.nutrition.deficitAboveCap(
                String(Math.round(verdict.deficit)),
                NUTRITION.maxDailyDeficitKcal,
              )}
            </p>
          ) : null}
          <p className="note" style={{ marginTop: 'var(--s2)' }}>
            {strings.nutrition.targetEstimateNote}
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn primary block"
              disabled={busy}
              data-control="save-target"
              onClick={() => void save(false)}
            >
              {busy ? strings.nutrition.savingTarget : strings.nutrition.saveTarget}
            </button>
          </div>
          {ceiling > 0 ? (
            <p className="note" style={{ marginTop: 'var(--s2)' }} data-ceiling={ceiling}>
              {strings.nutrition.rateCeiling(ceiling.toFixed(2), body.weightKg.toFixed(1))}
            </p>
          ) : null}
        </section>
      ) : null}

      {saved ? (
        <p className="note" data-target="saved">
          {strings.nutrition.targetSaved}
        </p>
      ) : null}

      {failure ? (
        <div className="card error" role="alert" data-state="error">
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
