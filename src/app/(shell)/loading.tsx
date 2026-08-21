import { strings } from '@/lib/strings';

/**
 * Skeleton blocks at the final geometry of the title and the card beneath it,
 * so nothing jumps when the data lands. No spinner, no placeholder curve, never
 * a fake number. .forge/wireframes/02-today.html, frame 2.
 */
export default function ShellLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{strings.common.loading}</span>
      <div className="title">
        <span className="skel" style={{ width: '132px', height: '11px' }} />
        <span className="skel" style={{ width: '164px', height: '30px', marginTop: '8px' }} />
      </div>
      <div className="card">
        <span className="skel" style={{ width: '72px', height: '11px' }} />
        <span className="skel" style={{ width: '210px', height: '17px', marginTop: '14px' }} />
        <span className="skel" style={{ width: '100%', height: '13px', marginTop: '10px' }} />
        <span className="skel" style={{ width: '86%', height: '13px', marginTop: '6px' }} />
        <span className="skel" style={{ width: '100%', height: '44px', borderRadius: '12px', marginTop: '16px' }} />
      </div>
    </div>
  );
}
