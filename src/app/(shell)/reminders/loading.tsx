import { strings } from '@/lib/strings';

/** The waiting list at its final geometry, so nothing moves when it lands. */
export default function RemindersLoading() {
  return (
    <div aria-busy="true" aria-live="polite" data-state="loading">
      <span className="visually-hidden">{strings.reminders.loadingLabel}</span>
      <div className="title">
        <span className="skel" style={{ width: '112px', height: '11px' }} />
        <span className="skel" style={{ width: '164px', height: '30px', marginTop: '8px' }} />
      </div>
      <div className="card">
        <span className="skel" style={{ width: '104px', height: '11px' }} />
        {[0, 1].map((row) => (
          <div className="row" key={row}>
            <div className="stack grow">
              <span className="skel" style={{ width: '62%', height: '15px' }} />
              <span className="skel" style={{ width: '78%', height: '12px', marginTop: '6px' }} />
            </div>
            <span className="skel" style={{ width: '124px', height: '48px', borderRadius: '12px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
