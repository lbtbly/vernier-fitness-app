import { strings } from '@/lib/strings';

/**
 * The confirm screen at its final geometry while it loads: the counts block at
 * the size the three numbers take, the two columns beside each other, and two
 * row cards. Skeletons rather than a spinner, and never a placeholder count,
 * because a fake number on this screen is indistinguishable from a real one at a
 * glance and this is the screen that decides what is written.
 */
export default function CalendarLoading() {
  return (
    <div aria-busy="true" aria-live="polite" data-state="loading">
      <span className="visually-hidden">{strings.calendar.loadingLabel}</span>
      <div className="title">
        <span className="skel" style={{ width: '132px', height: '11px' }} />
        <span className="skel" style={{ width: '210px', height: '30px', marginTop: '8px' }} />
      </div>
      <div className="card tight">
        <span className="skel" style={{ width: '84px', height: '11px' }} />
        <div className="headlines" style={{ marginTop: '10px' }}>
          {[0, 1, 2].map((count) => (
            <div className="stack" key={count}>
              <span className="skel" style={{ width: '38px', height: '34px' }} />
              <span className="skel" style={{ width: '52px', height: '12px', marginTop: '6px' }} />
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="diffcols">
          {[0, 1].map((column) => (
            <div className="diffcol" key={column}>
              <span className="skel" style={{ width: '86px', height: '11px' }} />
              <span className="skel" style={{ width: '100%', height: '15px', marginTop: '10px' }} />
              <span className="skel" style={{ width: '70%', height: '12px', marginTop: '6px' }} />
            </div>
          ))}
        </div>
      </div>
      {[0, 1].map((row) => (
        <div className="card" key={row} style={{ padding: '12px 14px', marginBottom: '8px' }}>
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div className="stack grow">
              <span className="skel" style={{ width: '62%', height: '17px' }} />
              <span className="skel" style={{ width: '48%', height: '13px', marginTop: '6px' }} />
            </div>
            <span className="skel" style={{ width: '94px', height: '44px', borderRadius: '10px' }} />
          </div>
          <span className="skel" style={{ width: '100%', height: '38px', marginTop: '10px', borderRadius: '8px' }} />
        </div>
      ))}
    </div>
  );
}
