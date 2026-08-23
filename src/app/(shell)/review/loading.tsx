import { strings } from '@/lib/strings';

/**
 * The week, at its final geometry, while it is read back. Skeleton blocks at
 * the exact size the real rows take, so nothing moves under a thumb when the
 * figures land. No spinner, and no placeholder number: a fake figure is
 * indistinguishable from a real one at a glance, which is the whole reason
 * screen 00 forbids it.
 */
export default function ReviewLoading() {
  return (
    <div aria-busy="true" aria-live="polite" data-state="loading">
      <span className="visually-hidden">{strings.review.loadingLabel}</span>
      <div className="title">
        <span className="skel" style={{ width: '186px', height: '11px' }} />
        <span className="skel" style={{ width: '148px', height: '30px', marginTop: '8px' }} />
      </div>
      {[0, 1, 2, 3].map((card) => (
        <div className="card" key={card}>
          <span className="skel" style={{ width: '96px', height: '11px' }} />
          {[0, 1].map((row) => (
            <div className="row" key={row}>
              <div className="stack grow">
                <span className="skel" style={{ width: '52%', height: '15px' }} />
                <span className="skel" style={{ width: '68%', height: '12px', marginTop: '6px' }} />
              </div>
              <span className="skel" style={{ width: '74px', height: '18px' }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
