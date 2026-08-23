import { strings } from '@/lib/strings';

/**
 * The week, at its final geometry, while it loads.
 *
 * Skeleton blocks at the exact size and position the real thing will take, so
 * nothing jumps when the data lands. No spinner, no placeholder macros, and
 * above all no placeholder number: a fake 2,150 kcal is indistinguishable from
 * a real one at a glance, which is the reason DESIGN.md forbids it.
 */
export default function EatLoading() {
  return (
    <div aria-busy="true" aria-live="polite" data-state="loading">
      <span className="visually-hidden">{strings.nutrition.weekLoading}</span>
      <div className="title">
        <span className="skel" style={{ width: '148px', height: '11px' }} />
        <span className="skel" style={{ width: '176px', height: '30px', marginTop: '8px' }} />
      </div>
      <div className="card tight">
        <span className="skel" style={{ width: '132px', height: '22px' }} />
        <span className="skel" style={{ width: '100%', height: '13px', marginTop: '12px' }} />
        <span className="skel" style={{ width: '78%', height: '13px', marginTop: '6px' }} />
      </div>
      {[0, 1].map((day) => (
        <div key={day}>
          <span className="skel daylabel" style={{ width: '146px', height: '11px', display: 'block' }} />
          <div className="card">
            {[0, 1, 2].map((row) => (
              <div className="row mealrow" key={row}>
                <div className="stack grow">
                  <span className="skel" style={{ width: '68%', height: '17px' }} />
                  <span className="skel" style={{ width: '52%', height: '12px', marginTop: '6px' }} />
                  <span className="skel" style={{ width: '80%', height: '12px', marginTop: '6px' }} />
                </div>
                <span className="skel" style={{ width: '148px', height: '44px', borderRadius: '10px' }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
