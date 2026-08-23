import Link from 'next/link';
import { ChevronIcon, WarnIcon } from '@/components/icons';
import type { OperatorAlertView } from '@/db/alerts';
import { alertAction, alertBody, alertTitle } from '@/lib/display';
import { shortDateTime } from '@/lib/format';
import { strings } from '@/lib/strings';

/**
 * The persistent banner F133 asks for: the surface, the cause and one action.
 *
 * ONE BANNER, NOT ONE PER FAILING THING. Every open alert is inside it, each
 * with its own action, because two failures at once must not become two banners
 * stacked on top of each other: that is a region whose height is a function of
 * how much is wrong, which is exactly the defect `src/components/Notices.tsx`
 * exists to prevent on Today. Here the same rule is met differently: this screen
 * has no fold budget, so the banner may hold every alert, but it is still ONE
 * element with one border and one heading.
 *
 * IT IS PERSISTENT AND IT IS NOT DISMISSIBLE. There is no close button, and
 * that is deliberate: an alert goes when its cause goes, and the sweep decides
 * that by reading the state again. A banner a person can dismiss is a banner
 * that is dismissed and then forgotten, which is the silence this whole
 * mechanism exists to end.
 */
export function OperatorAlerts({
  alerts,
  timeZone,
}: {
  alerts: OperatorAlertView[];
  timeZone: string;
}) {
  if (alerts.length === 0) return null;

  const worst = alerts.some((alert) => alert.severity === 'alert') ? 'a' : 'w';
  const heading =
    alerts.length === 1
      ? strings.alerts.bannerOne(alertTitle(alerts[0].surface))
      : strings.alerts.bannerMany(alerts.length);

  return (
    <div className={`banner ${worst}`} role="alert" data-operator-alerts={alerts.length}>
      <WarnIcon />
      <div className="grow">
        <b>{heading}</b>
        {alerts.map((alert) => (
          <div key={alert.id} className="stack" data-alert={alert.key} style={{ marginTop: 'var(--s2)' }}>
            <span data-alert-surface={alert.surface}>{alertTitle(alert.surface)}</span>
            <span className="sub" data-alert-cause={alert.cause}>
              {alertBody(alert.cause, alert.detail)}
            </span>
            <span className="note">
              {strings.alerts.raisedAt(shortDateTime(new Date(alert.raisedAt), timeZone))}
              {alert.notifiedAt === null && alert.notifyDetail === 'quiet_hours'
                ? ` ${strings.alerts.details.quietHeld}`
                : ''}
              {alert.notifyDetail === 'no-devices' ? ` ${strings.alerts.details.noDevices}` : ''}
            </span>
            <Link
              prefetch={false}
              className="btn quiet"
              href={alert.route}
              data-alert-action={alert.route}
              style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
            >
              {alertAction(alert.route)}
              <ChevronIcon />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
