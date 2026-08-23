import { strings } from '@/lib/strings';

/**
 * The loading state for every labs screen, at the geometry of the review that
 * follows: a title line, the two banners, and three row cards.
 *
 * Skeleton blocks at the exact final size, no spinner, no placeholder curve.
 * Screen 00 defines this once and the review does not get to invent its own,
 * and the geometry does not move between the states, which is the whole reason
 * the blocks are sized rather than generic.
 */
export default function LabsLoading() {
  return (
    <div className="labs-scroll" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{strings.common.loading}</span>
      <div className="lab-head">
        <span className="skel" style={{ width: '44px', height: '44px', borderRadius: '12px' }} />
        <div className="grow">
          <span className="skel" style={{ width: '164px', height: '20px' }} />
          <span className="skel" style={{ width: '210px', height: '12px', marginTop: '6px' }} />
        </div>
      </div>
      <span className="skel" style={{ width: '100%', height: '62px', borderRadius: '12px' }} />
      <span
        className="skel"
        style={{ width: '100%', height: '62px', borderRadius: '12px', marginTop: '12px' }}
      />
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="skel"
          style={{ width: '100%', height: '132px', borderRadius: '12px', marginTop: '12px' }}
        />
      ))}
    </div>
  );
}
