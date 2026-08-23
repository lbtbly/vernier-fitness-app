import { strings } from '@/lib/strings';

/**
 * The consent card at its final geometry while the ledger is read.
 *
 * Blocks where the two lists and the cost rows will be, at the sizes they will
 * take. No spinner and no placeholder figure: a fake "0.004 EUR" on a consent
 * screen is a claim about money, and the whole point of the screen is that the
 * owner reads a real one before he agrees.
 */
export default function MealEstimateLoading() {
  return (
    <div aria-busy="true" aria-live="polite" data-state="loading">
      <span className="visually-hidden">{strings.meals.loadingLabel}</span>
      <div className="title">
        <span className="skel" style={{ width: '132px', height: '11px' }} />
        <span className="skel" style={{ width: '248px', height: '30px', marginTop: '8px' }} />
      </div>
      {[0, 1].map((card) => (
        <div className="card" key={card}>
          <span className="skel" style={{ width: '156px', height: '11px' }} />
          {[0, 1, 2].map((row) => (
            <div className="row" key={row}>
              <span className="skel grow" style={{ height: '15px' }} />
              <span className="skel" style={{ width: '96px', height: '13px' }} />
            </div>
          ))}
        </div>
      ))}
      <span className="skel" style={{ display: 'block', width: '100%', height: '200px', borderRadius: '14px' }} />
      <span
        className="skel"
        style={{ display: 'block', width: '100%', height: '48px', borderRadius: '12px', marginTop: '12px' }}
      />
    </div>
  );
}
