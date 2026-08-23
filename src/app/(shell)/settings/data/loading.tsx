import { strings } from '@/lib/strings';

/**
 * The archive card, the export rows and the machine rows at their final height.
 *
 * Screen 00's loading state: skeleton blocks at the exact final size and
 * position, never a spinner and never a placeholder value. This screen reads
 * two containers, a filesystem and eight tables, so it is one of the few in this
 * product where the state is visible for long enough to matter, and a card that
 * grows under a thumb as the answers arrive is what this pattern exists to
 * prevent.
 */
export default function DataLoading() {
  return (
    <div aria-busy="true" aria-live="polite" data-state="loading">
      <span className="visually-hidden">{strings.data.loadingLabel}</span>
      <div className="title">
        <span className="skel" style={{ width: '72px', height: '11px' }} />
        <span className="skel" style={{ width: '212px', height: '30px', marginTop: '8px' }} />
        <span className="skel" style={{ width: '250px', height: '15px', marginTop: '8px' }} />
      </div>
      <div className="card">
        <span className="skel" style={{ width: '88px', height: '11px' }} />
        <span className="skel" style={{ width: '182px', height: '26px', marginTop: '10px' }} />
        <span className="skel" style={{ width: '120px', height: '13px', marginTop: '8px' }} />
        {Array.from({ length: 4 }, (_, row) => (
          <div className="row" key={row}>
            <span className="skel grow" style={{ height: '13px' }} />
            <span className="skel" style={{ width: '96px', height: '13px' }} />
          </div>
        ))}
        <span className="skel" style={{ width: '100%', height: '48px', marginTop: '14px', borderRadius: '12px' }} />
      </div>
      <div className="card">
        <span className="skel" style={{ width: '132px', height: '11px' }} />
        {Array.from({ length: 3 }, (_, row) => (
          <div className="row" key={row}>
            <div className="stack grow">
              <span className="skel" style={{ width: '40%', height: '15px' }} />
              <span className="skel" style={{ width: '76%', height: '12px', marginTop: '6px' }} />
            </div>
            <span className="skel" style={{ width: '44px', height: '44px', borderRadius: '12px' }} />
          </div>
        ))}
      </div>
      <div className="card">
        <span className="skel" style={{ width: '104px', height: '11px' }} />
        {Array.from({ length: 8 }, (_, row) => (
          <div className="row" key={row}>
            <span className="skel grow" style={{ height: '13px' }} />
            <span className="skel" style={{ width: '110px', height: '13px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
