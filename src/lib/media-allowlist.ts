/**
 * What may be embedded, and how a pasted link is judged against it.
 *
 * THE ALLOWLIST IS DATA. It is rows in `media_allowlist`, seeded from
 * `src/data/media-allowlist.json`, and this module is handed them. Nothing here
 * tests a hostname against a literal: an allowlist compiled into a comparison
 * is an allowlist the owner cannot inspect, cannot extend and cannot audit, and
 * F68 asks for the opposite of that.
 *
 * WHAT THE RESEARCH BINDS, from `.forge/research/exercise-media.md` section 1:
 *
 * - The embed host is `www.youtube-nocookie.com`. Measured live: the regular
 *   host sets six cookies on first load and the nocookie host sets none. Same
 *   terms, same policies, better privacy, no cost.
 * - `youtu.be/ID` and `/watch?v=ID` are NEVER frame origins. Both answer
 *   `X-Frame-Options: SAMEORIGIN`, and `youtu.be` additionally 303s to the
 *   watch page. They are accepted in the paste box and normalised to
 *   `/embed/ID`, which is the only path that is framable.
 * - No API key is needed for any of this. `/embed/ID` returns 200 with no
 *   credential and oEmbed is keyless and CORS enabled. A Data API v3 call
 *   returns 403 without one, which is why this app never makes one.
 * - No `enablejsapi=1`, so no `origin` parameter. The parameter is the
 *   `targetOrigin` of a postMessage channel this player does not open, and a
 *   mismatched one makes the callbacks silently never fire.
 * - Nothing is downloaded, cached, proxied or overlaid. Developer Policies
 *   III.E forbids the first three in the plainest words in the document and the
 *   Required Minimum Functionality forbids the fourth.
 */

/** One row of the allowlist, as the table holds it. */
export type AllowedHost = {
  host: string;
  /** How the browser is allowed to reach it. One mode today, by design. */
  embeddingMode: 'youtube_nocookie';
  /** The catalogue key of the sentence saying why this host is on the list. */
  reasonKey: string;
};

/** Why a pasted link was refused, as a case the screen renders. Never a sentence here. */
export type RefusalReason =
  | 'notAUrl'
  | 'hostNotAllowed'
  | 'noVideoId'
  | 'notEmbeddable'
  | 'unavailable'
  | 'notAVideoLink';

export type Judgement =
  | { ok: true; videoId: string; embedUrl: string; watchUrl: string; host: string }
  | { ok: false; reason: RefusalReason; host: string | null };

/**
 * The hosts a link may be PASTED from. Not the same list as the hosts a frame
 * may be served from: there is exactly one of those and it is the nocookie
 * embed host, which `embedUrlFor` writes rather than reads.
 *
 * These are recognised so a share link can be normalised. A host that is not on
 * the allowlist is refused before any of this runs.
 */
const SHARE_HOSTS = ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com'];

/** Eleven characters of the YouTube id alphabet, and nothing else. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function videoIdFrom(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return VIDEO_ID.test(id) ? id : null;
  }
  const parameter = url.searchParams.get('v');
  if (parameter && VIDEO_ID.test(parameter)) return parameter;
  const segments = url.pathname.split('/').filter(Boolean);
  const marker = segments.findIndex((segment) => segment === 'embed' || segment === 'shorts');
  if (marker >= 0 && segments[marker + 1] && VIDEO_ID.test(segments[marker + 1])) {
    return segments[marker + 1];
  }
  return null;
}

export function hostOf(raw: string): string | null {
  try {
    return new URL(raw.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The player URL, written by this app and never taken from the paste box.
 *
 * `rel=0` keeps the end cards inside the same channel, which is a player
 * parameter and not a modification of the player. `modestbranding` is
 * deliberately absent: it was deprecated in the 2023-08-15 revision and has no
 * effect, and planning around a parameter that does nothing is how a compliance
 * story rots.
 */
export function embedUrlFor(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
}

export function watchUrlFor(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Judge a pasted link against the allowlist, before anything is asked of the
 * network. The oEmbed preflight happens after this, server side, on the Mac
 * mini, because oEmbed is geo-sensitive to the requesting address and the box
 * and the owner are in the same place.
 */
export function judge(raw: string, allowed: AllowedHost[]): Judgement {
  const host = hostOf(raw);
  if (!host) return { ok: false, reason: 'notAUrl', host: null };
  if (!allowed.some((entry) => entry.host === host)) {
    return { ok: false, reason: 'hostNotAllowed', host };
  }
  if (!SHARE_HOSTS.includes(host)) return { ok: false, reason: 'notAVideoLink', host };
  const videoId = videoIdFrom(raw);
  if (!videoId) return { ok: false, reason: 'noVideoId', host };
  return {
    ok: true,
    videoId,
    embedUrl: embedUrlFor(videoId),
    watchUrl: watchUrlFor(videoId),
    host,
  };
}

/**
 * What the keyless oEmbed preflight said, mapped to a refusal.
 *
 * Characterised across 358 real video ids in the research: 200 is embeddable
 * and returns the title, the author name and the author URL, which is the
 * provenance record's author and is API Data rather than audiovisual content,
 * so storing it is permitted. 401 means the owner does not allow embedding or
 * the video is age restricted and does not distinguish the two. 404 means gone,
 * private, or region blocked from here. 400 means it is not a video link.
 *
 * The embed endpoint cannot answer this: it returns 200 for every case above,
 * because playability is fetched by the player at run time and is not in the
 * served HTML. oEmbed is the only keyless preflight that works.
 */
export function reasonForStatus(status: number): RefusalReason | null {
  if (status === 200) return null;
  if (status === 401) return 'notEmbeddable';
  if (status === 404) return 'unavailable';
  return 'notAVideoLink';
}

export const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';

export function oembedUrlFor(watchUrl: string): string {
  return `${OEMBED_ENDPOINT}?url=${encodeURIComponent(watchUrl)}&format=json`;
}
