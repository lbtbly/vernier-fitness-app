import Link from 'next/link';
import { ChevronIcon } from '@/components/icons';
import { ManualPanelForm } from '@/components/ManualPanelForm';
import { readAnalytes } from '@/db/labs';
import { getConfig } from '@/lib/config';
import { readCsrfToken } from '@/lib/csrf';
import { strings } from '@/lib/strings';

export const metadata = { title: strings.labs.manualTitle };
export const dynamic = 'force-dynamic';

/**
 * F57's manual form: every analyte in the catalogue, with a result, a unit and
 * a reference interval, plus one sample date for the panel.
 *
 * It builds a review rather than storing a panel, and the control says so. The
 * per-row save is on the review screen where a parsed panel's is, so there is
 * one screen that stores a laboratory value and one control on it that does.
 */
export default async function ManualPanelPage() {
  const { timeZone } = getConfig();
  const [analytes, csrfToken] = await Promise.all([readAnalytes(), readCsrfToken()]);
  const today = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(new Date());

  return (
    <div className="labs-scroll">
      <div className="lab-head">
        <Link
          className="btn icon"
          href="/health/labs"
          aria-label={strings.common.back}
          style={{ transform: 'scaleX(-1)' }}
        >
          <ChevronIcon />
        </Link>
        <div className="grow">
          <div className="title-line">{strings.labs.manualTitle}</div>
          <div className="note">{strings.labs.manualSub}</div>
        </div>
      </div>
      <ManualPanelForm analytes={analytes} csrfToken={csrfToken} today={today} />
    </div>
  );
}
