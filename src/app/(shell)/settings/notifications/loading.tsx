import { strings } from '@/lib/strings';

/**
 * Eleven check rows at their final height, plus the two cards above them, so
 * the list does not grow under a thumb as the browser facts arrive.
 */
export default function NotificationsLoading() {
  return (
    <div aria-busy="true" aria-live="polite" data-state="loading">
      <span className="visually-hidden">{strings.reminders.loadingLabel}</span>
      <div className="title">
        <span className="skel" style={{ width: '84px', height: '11px' }} />
        <span className="skel" style={{ width: '192px', height: '30px', marginTop: '8px' }} />
      </div>
      <div className="card">
        <span className="skel" style={{ width: '104px', height: '11px' }} />
        <span className="skel" style={{ width: '72%', height: '17px', marginTop: '10px' }} />
        <span className="skel" style={{ width: '100%', height: '48px', marginTop: '14px', borderRadius: '12px' }} />
      </div>
      <div className="card">
        <span className="skel" style={{ width: '148px', height: '11px' }} />
        {Array.from({ length: 11 }, (_, row) => (
          <div className="row" key={row}>
            <div className="stack grow">
              <span className="skel" style={{ width: '48%', height: '15px' }} />
              <span className="skel" style={{ width: '36%', height: '12px', marginTop: '6px' }} />
            </div>
            <span className="skel" style={{ width: '66px', height: '24px', borderRadius: '999px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
