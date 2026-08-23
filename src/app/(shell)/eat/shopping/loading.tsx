import { strings } from '@/lib/strings';

/**
 * The list, at its final geometry, while it loads. Skeleton rows at the 56 px
 * height the real ones take, so nothing moves under a thumb when the data
 * lands. No spinner and no placeholder quantity.
 */
export default function ShoppingLoading() {
  return (
    <div aria-busy="true" aria-live="polite" data-state="loading">
      <span className="visually-hidden">{strings.nutrition.shoppingLoading}</span>
      <div className="title">
        <span className="skel" style={{ width: '148px', height: '11px' }} />
        <span className="skel" style={{ width: '132px', height: '30px', marginTop: '8px' }} />
      </div>
      <div className="card pad">
        <span className="skel" style={{ width: '118px', height: '22px' }} />
        <span className="skel" style={{ width: '100%', height: '8px', marginTop: '12px', borderRadius: '4px' }} />
        <span className="skel" style={{ width: '72%', height: '12px', marginTop: '8px' }} />
      </div>
      {[0, 1].map((aisle) => (
        <div key={aisle}>
          <span className="skel daylabel" style={{ width: '104px', height: '11px', display: 'block' }} />
          <div className="card">
            {[0, 1, 2].map((row) => (
              <div className="item" key={row}>
                <span className="skel" style={{ width: '28px', height: '28px', borderRadius: '8px' }} />
                <div className="stack grow">
                  <span className="skel" style={{ width: '58%', height: '15px' }} />
                  <span className="skel" style={{ width: '42%', height: '12px', marginTop: '6px' }} />
                </div>
                <span className="skel" style={{ width: '136px', height: '44px', borderRadius: '10px' }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
