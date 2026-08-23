import { readWeeklyReview, reviewedWeekOf } from '@/db/weekly-review';
import { getConfig } from '@/lib/config';
import { readSession } from '@/lib/session';
import { renderReviewEmail } from '@/lib/review-email';

export const dynamic = 'force-dynamic';

/**
 * The weekly email, previewed locally, with no mail transport configured.
 *
 * F118 IS THIS ROUTE. It serves exactly the bytes a relay would carry: one
 * `renderReviewEmail`, one document, no second renderer for the real send and
 * so nothing to keep in step. A machine with no MAIL_HOST renders this
 * identically, which is the whole point of proving the email months before an
 * SMTP host exists.
 *
 * A ROUTE HANDLER AND NOT A PAGE, for the same reason /offline is one: what an
 * email client receives is a finished document with its styles inline and no
 * request to anything else. A React page would bring a chunk, a stylesheet and
 * a hydration script, none of which an email client would ever fetch, and the
 * preview would then be a different thing from the message.
 *
 * It sits behind the gate like every other route that is not on PUBLIC_PATHS,
 * and it checks the session itself rather than trusting the door.
 */
export async function GET() {
  const session = await readSession();
  if (!session) {
    return new Response(null, { status: 302, headers: { Location: '/sign-in' } });
  }

  const { timeZone, appUrl } = getConfig();
  const review = await readWeeklyReview(reviewedWeekOf(new Date(), timeZone));

  return new Response(renderReviewEmail(review, appUrl), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
