import { mediaFor } from '@/lib/catalogue';
import { movementName } from '@/lib/display';
import { dayLabel } from '@/lib/format';
import { strings } from '@/lib/strings';

/**
 * The demonstration for one movement, with its provenance underneath it.
 *
 * IT IS BUNDLED, WHICH IS THE WHOLE POINT. The file is served from this Mac
 * mini, the service worker caches it on first fetch like every other same-origin
 * asset, and the card renders in a basement gym with no signal. A YouTube embed
 * cannot do that and may not be cached, which is why video is the optional
 * third layer and this is the first.
 *
 * THE CAPTION IS NOT DECORATION. Every one of these files is either CC BY-SA,
 * which requires the creator to be named, or public domain, where naming the
 * agency costs nothing and is true. The author travels with the picture on
 * every surface it appears on rather than sitting on one attributions page
 * nobody opens.
 *
 * A plain `img` rather than the framework's image component, deliberately: 22
 * of these files are animated GIFs and the optimiser would render the first
 * frame of each one as a still.
 */
export function MovementMedia({ movementId, small }: { movementId: string; small?: boolean }) {
  const record = mediaFor(movementId);
  const name = movementName(movementId);

  if (!record) {
    return (
      <figure className="demo empty" data-media="missing">
        <figcaption>{strings.player.mediaMissing}</figcaption>
      </figure>
    );
  }

  return (
    <figure className={small ? 'demo small' : 'demo'} data-media={record.movement}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={record.path} alt={strings.catalogue.mediaAlt(name)} loading="lazy" decoding="async" />
      <figcaption>
        {strings.catalogue.mediaFrom(record.author)}
        {'. '}
        {strings.media.licenceAndDate(record.licence, dayLabel(record.verifiedAt))}
      </figcaption>
    </figure>
  );
}
