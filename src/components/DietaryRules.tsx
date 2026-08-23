'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CloseIcon } from '@/components/icons';
import { CSRF_HEADER } from '@/lib/cookie-names';
import { RULE_KINDS, RULE_SUBJECTS, type RuleKind, type RuleSubject } from '@/lib/dietary-rules';
import { strings } from '@/lib/strings';

/**
 * The four rules, on the screen, each one showing what it actually does.
 *
 * THE EFFECT SENTENCE BESIDE EACH KIND IS NOT DECORATION. F83's whole point is
 * that nuts as a preference and shellfish as an exclusion produce two different
 * behaviours, and a screen that listed four rules with four coloured chips and
 * no words would be a screen where they look like four settings of one dial.
 * Refused, substituted, omitted, ranked: four verbs, stated.
 *
 * A rule is added with its kind, never without one. There is no control here
 * that takes a subject on its own, because "nuts" with no kind is exactly the
 * collapse the line forbids.
 */

const ENDPOINT = '/api/nutrition/rules';

export function DietaryRules({
  rules,
  csrfToken,
}: {
  rules: { id: string; kind: RuleKind; subject: RuleSubject }[];
  csrfToken: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<RuleKind>('exclusion');
  const [subject, setSubject] = useState<RuleSubject>('shellfish');
  const [busy, setBusy] = useState(false);

  async function post(body: unknown) {
    setBusy(true);
    try {
      await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: csrfToken },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" data-card="rules">
      <span className="lbl">{strings.nutrition.yourRules}</span>
      <p className="note" style={{ margin: 'var(--s2) 0' }}>
        {strings.nutrition.yourRulesNote}
      </p>

      {rules.length === 0 ? (
        <p className="sub">{strings.nutrition.ruleNone}</p>
      ) : (
        rules.map((rule) => (
          <div className="row" key={rule.id} data-rule={rule.id} data-rule-kind={rule.kind}>
            <div className="stack grow">
              <span className="head">
                {strings.nutrition.ruleLine(
                  strings.nutrition.ruleKinds[rule.kind],
                  strings.nutrition.ruleSubjects[rule.subject],
                )}
              </span>
              <span className="note">{strings.nutrition.ruleKindEffects[rule.kind]}</span>
            </div>
            <button
              type="button"
              className="btn icon"
              disabled={busy}
              aria-label={strings.nutrition.removeRule(
                strings.nutrition.ruleKinds[rule.kind],
                strings.nutrition.ruleSubjects[rule.subject],
              )}
              onClick={() => void post({ action: 'remove', id: rule.id })}
            >
              <CloseIcon />
            </button>
          </div>
        ))
      )}

      <label className="formfield" htmlFor="rule-kind" style={{ marginTop: 'var(--s4)' }}>
        <span className="lbl">{strings.nutrition.chooseKind}</span>
        <select
          id="rule-kind"
          className="input"
          value={kind}
          onChange={(event) => setKind(event.target.value as RuleKind)}
        >
          {RULE_KINDS.map((option) => (
            <option key={option} value={option}>
              {strings.nutrition.ruleKinds[option]}
            </option>
          ))}
        </select>
      </label>
      <label className="formfield" htmlFor="rule-subject">
        <span className="lbl">{strings.nutrition.chooseSubject}</span>
        <select
          id="rule-subject"
          className="input"
          value={subject}
          onChange={(event) => setSubject(event.target.value as RuleSubject)}
        >
          {RULE_SUBJECTS.map((option) => (
            <option key={option} value={option}>
              {strings.nutrition.ruleSubjects[option]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn block"
        disabled={busy}
        data-control="add-rule"
        onClick={() => void post({ action: 'add', kind, subject })}
      >
        {strings.nutrition.addRule}
      </button>
    </section>
  );
}
