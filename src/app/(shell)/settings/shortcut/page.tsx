import Link from 'next/link';
import { redirect } from 'next/navigation';
import { InfoIcon, WarnIcon, WaveIcon } from '@/components/icons';
import { readLiveCredential } from '@/db/ingest';
import { getConfig } from '@/lib/config';
import { readSession } from '@/lib/session';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.shortcutGuide.title };
export const dynamic = 'force-dynamic';

/**
 * The Shortcut guide, F55. The document the owner follows on his iPhone.
 *
 * EVERY ACTION NAME ON THIS SCREEN CARRIES ITS OWN EVIDENCE. Twelve of the
 * fourteen come out of `.forge/research/apple-health-shortcut.md` sections 1, 2
 * and 4, which read them from Apple's own shipped action definitions and
 * localization tables rather than from a blog post, identifier and all. Two,
 * `Show Notification` and `Run Shortcut`, appear only in that note's build
 * recipe with no identifier and no evidence mark, and the `unverified` card
 * below names both and says so. A guide naming an action that does not exist is
 * worse than no guide at all: it sends a person hunting a picker for forty
 * minutes for something Apple never shipped, and it is the failure this feature
 * is measured against. A guide printing a guess in the same type as a checked
 * name is the same failure one step quieter.
 *
 * IT IS A SCREEN AND NOT A MARKDOWN FILE ON PURPOSE. The owner reads it on the
 * phone he is building the shortcut on, beside the token and the secret he has
 * to paste, and the endpoint URL it prints is this installation's own rather
 * than an example somebody has to translate.
 *
 * The five states: this screen is static prose and always has content, so
 * empty does not exist for it; loading and error come from the shell's own
 * loading.tsx and error.tsx; offline is the worker's document; and the one
 * piece of live state on it, whether an ingest token exists yet, is drawn at
 * the top, because a guide whose step 15 needs a secret should say so before
 * step 1 rather than after step 14.
 */
export default async function ShortcutGuidePage() {
  const session = await readSession();
  if (!session) redirect('/sign-in');

  const config = getConfig();
  const credential = await readLiveCredential();
  const guide = strings.shortcutGuide;

  // The steps are numbered straight through, the way the research numbers them,
  // so "step 15" in the troubleshooting list means the same step it means in
  // Part C. The number is computed from the offset of each part rather than
  // from a counter, because a counter is a reassignment during render and
  // because an offset renumbers itself when a step is added.
  const from = {
    a: 1,
    b: 1 + guide.partA.length,
    c: 1 + guide.partA.length + guide.partB.length,
    d: 1 + guide.partA.length + guide.partB.length + guide.partC.length,
    e: 1 + guide.partA.length + guide.partB.length + guide.partC.length + guide.partD.length,
  };
  const numbered = <T,>(items: readonly T[], start: number): Array<T & { n: number }> =>
    items.map((item, index) => ({ ...item, n: start + index }));

  const partA = numbered(guide.partA, from.a);
  const partB = numbered(guide.partB, from.b);
  const partC = numbered(guide.partC, from.c);
  const partD = numbered(guide.partD, from.d);
  const partE = guide.partE.map((text, index) => ({ text, n: from.e + index }));

  return (
    <>
      <header className="title">
        <span className="lbl">{strings.settings.title}</span>
        <h1>{guide.title}</h1>
        <p className="sub">{guide.sub}</p>
      </header>

      <section className="card" data-card="lead">
        <p className="sub">{guide.lead}</p>
        <div className="row" style={{ marginTop: 'var(--s2)' }}>
          <span className="grow sub mut">{strings.ingest.endpointLabel}</span>
          <span className="mono" data-endpoint>
            {config.appUrl}
            {strings.ingest.endpointPath}
          </span>
        </div>
        {credential ? (
          <div className="row">
            <span className="grow sub mut">{strings.ingest.keyIdLabel}</span>
            <span className="mono">{credential.keyId}</span>
          </div>
        ) : (
          <div className="banner w" role="status" style={{ marginTop: 'var(--s3)' }}>
            <WarnIcon />
            <div>{strings.settings.ingestNoneBody}</div>
          </div>
        )}
        <div className="actions">
          <Link className="btn block" href="/settings">
            {strings.ingest.settingsLink}
          </Link>
        </div>
      </section>

      <section className="card" data-card="arrives">
        <span className="lbl">{guide.arrivesLabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {guide.arrivesBody}
        </p>
        <div className="head">{guide.notArrivingLabel}</div>
        <p className="sub">{guide.notArrivingBody}</p>
      </section>

      {/*
        * F55's blood-pressure line, and it is drawn as a card of its own rather
        * than a footnote. The absence has to read as a decision. A metric list
        * that simply lacks a row reads as an oversight, and the owner adds it
        * himself and then every run fails.
        */}
      <section className="card" data-card="blood-pressure" style={{ borderStyle: 'dashed' }}>
        <span className="lbl">{guide.bloodPressureLabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {guide.bloodPressureBody}
        </p>
      </section>

      <section className="card" data-card="before">
        <span className="lbl">{guide.beforeLabel}</span>
        {/*
          * Rows rather than numbered steps, because these three are settings on
          * the phone and not actions in the shortcut. The numbering that starts
          * below runs 1 to 31 and means one thing throughout; folding three
          * settings into the front of it would make every later reference off
          * by three.
          */}
        {guide.before.map((line) => (
          <div className="row" key={line}>
            <span className="sub grow">{line}</span>
          </div>
        ))}
      </section>

      <section className="card" data-card="metrics">
        <span className="lbl">{guide.metricsLabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {guide.metricsNote}
        </p>
        {/*
          * Three columns with their heads named, because the row is a slug, a
          * picker label and a grouping and none of the three is guessable from
          * the others. The heads sit in label type above the first row rather
          * than in a table element: at 393 px a real table either scrolls
          * sideways or squeezes the label to one word a line.
          */}
        <div className="row" data-metric-heads>
          <div className="stack grow">
            <span className="lbl">{guide.metricsHeaderSlug}</span>
            <span className="lbl">{guide.metricsHeaderLabel}</span>
          </div>
          <span className="lbl">{guide.metricsHeaderGroup}</span>
        </div>
        {guide.metrics.map((metric) => (
          <div className="row" key={metric.slug} data-metric={metric.slug}>
            <div className="stack grow">
              <span className="mono">{metric.slug}</span>
              <span className="note">{metric.label}</span>
            </div>
            <span className="chip">{metric.group}</span>
          </div>
        ))}
        <p className="note" style={{ marginTop: 'var(--s2)' }}>
          {guide.metricsUncertain}
        </p>
      </section>

      <section className="card" data-card="part-a">
        <span className="lbl">{guide.partALabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {guide.partANote}
        </p>
        <ol className="steps">
          {partA.map((item) => (
            <li key={item.n} data-step={item.n}>
              <span className="head">{item.action}</span>
              <span className="sub">{item.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" data-card="part-b">
        <span className="lbl">{guide.partBLabel}</span>
        <ol className="steps">
          {partB.map((item) => (
            <li key={item.n} data-step={item.n}>
              <span className="head">{item.action}</span>
              <span className="sub">{item.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" data-card="part-c">
        <span className="lbl">{guide.partCLabel}</span>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {guide.partCNote}
        </p>
        <div className="mono" data-canonical-template style={{ marginTop: 'var(--s2)' }}>
          {guide.canonicalLines.map((line, index) => (
            <div key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
        <ol className="steps">
          {partC.map((item) => (
            <li key={item.n} data-step={item.n}>
              <span className="head">{item.action}</span>
              <span className="sub">{item.detail}</span>
            </li>
          ))}
        </ol>
        <p className="note">{guide.partCWhyTwo}</p>
      </section>

      <section className="card" data-card="part-d">
        <span className="lbl">{guide.partDLabel}</span>
        <ol className="steps">
          {partD.map((item) => (
            <li key={item.n} data-step={item.n}>
              <span className="head">{item.action}</span>
              <span className="sub">{item.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" data-card="part-e">
        <span className="lbl">{guide.partELabel}</span>
        <ol className="steps">
          {partE.map((item) => (
            <li key={item.n} data-step={item.n}>
              <span className="sub">{item.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {/*
        * F55's second uncertainty note, and it sits under the two parts that
        * carry the two names.
        *
        * The metric table above already tells the owner which picker labels
        * were derived rather than seen. This does the same for the two action
        * names this run could not check against Apple's shipped definitions,
        * because printing them in the same type as the twelve that were checked
        * is a claim the research does not support. Each name carries its own
        * marker so the count on this card and the list under it cannot drift.
        */}
      <section className="card" data-card="unverified" style={{ borderStyle: 'dashed' }}>
        <div className="between">
          <span className="lbl">{guide.unverifiedLabel}</span>
          <WarnIcon />
        </div>
        {guide.unverifiedActions.map((action) => (
          <div className="row" key={action} data-unverified-action={action}>
            <span className="head grow">{action}</span>
          </div>
        ))}
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {guide.unverifiedBody}
        </p>
      </section>

      {/*
        * The reliability truth, in the guide rather than in a support document
        * nobody opens. The iPhone encrypts the Health store while it is locked,
        * which is Apple's own documented behaviour, so promising a hands-off
        * overnight run would be a promise the platform breaks. What the app can
        * honestly offer is three runs at times the phone is usually in hand, a
        * window wide enough that one landing heals the two before it, and a
        * line on Today saying when the last one arrived.
        */}
      <section className="card" data-card="locked">
        <div className="between">
          <span className="lbl">{guide.lockedLabel}</span>
          <InfoIcon />
        </div>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {guide.lockedBody}
        </p>
        <p className="sub" style={{ marginTop: 'var(--s2)' }}>
          {guide.lockedRemedy}
        </p>
      </section>

      <section className="card" data-card="trouble">
        <span className="lbl">{guide.troubleLabel}</span>
        {guide.trouble.map((line) => (
          <div className="row" key={line}>
            <span className="sub grow">{line}</span>
          </div>
        ))}
      </section>

      <p className="note centre" style={{ padding: '4px 20px 0' }}>
        {guide.closing}
      </p>

      <div className="actions">
        <Link className="btn block" href="/settings/ingest">
          <WaveIcon />
          {strings.settings.ingestOpenDiagnostics}
        </Link>
      </div>
    </>
  );
}
