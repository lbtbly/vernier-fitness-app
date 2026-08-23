import { describe, expect, test } from 'vitest';
import allowlistData from '@/data/media-allowlist.json';
import {
  type AllowedHost,
  embedUrlFor,
  hostOf,
  judge,
  oembedUrlFor,
  reasonForStatus,
  videoIdFrom,
  watchUrlFor,
} from '@/lib/media-allowlist';

/**
 * The embedding allowlist, and what a pasted link is judged against.
 *
 * THE LIST IS DATA AND THIS TEST READS THE SAME DATA THE APP DOES. It imports
 * `src/data/media-allowlist.json`, which is what the boot seed writes into
 * `media_allowlist` and what the route reads back out. A test that hard-coded
 * the hosts would be asserting its own opinion; this one fails the moment the
 * shipped list and the shipped rule disagree.
 */

const ALLOWLIST = allowlistData as AllowedHost[];

describe('the allowlist as it ships', () => {
  test('it is rows, each with a host, a mode and the reason it is on the list', () => {
    expect(ALLOWLIST.length).toBeGreaterThan(0);
    for (const entry of ALLOWLIST) {
      expect(entry.host).toMatch(/^[a-z0-9.-]+$/);
      expect(entry.embeddingMode).toBe('youtube_nocookie');
      expect(entry.reasonKey).toMatch(/^media\.allowlist\./);
    }
  });

  test('the privacy-enhanced host is on it', () => {
    expect(ALLOWLIST.map((entry) => entry.host)).toContain('www.youtube-nocookie.com');
  });
});

describe('a link from a host that is not on the list', () => {
  test.each([
    'https://vimeo.com/76979871',
    'https://player.vimeo.com/video/76979871',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://cdn.exercisedb.dev/gifs/0001.gif',
    'https://www.musclewiki.com/exercises/male/chest/push-up',
  ])('%s is refused, and the reason names the list', (url) => {
    const verdict = judge(url, ALLOWLIST);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('hostNotAllowed');
  });

  test('something that is not a link at all is refused as one', () => {
    for (const raw of ['', 'not a link', 'push-up demo', '   ']) {
      const verdict = judge(raw, ALLOWLIST);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.reason).toBe('notAUrl');
    }
  });
});

describe('a share link is normalised rather than framed', () => {
  const id = 'dQw4w9WgXcQ';

  test.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com/watch?v=${id}&t=42s`,
  ])('%s yields the video id', (url) => {
    expect(videoIdFrom(url)).toBe(id);
  });

  test('the frame is always the privacy-enhanced host, whatever was pasted', () => {
    for (const url of [`https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`]) {
      const verdict = judge(url, ALLOWLIST);
      expect(verdict.ok).toBe(true);
      if (verdict.ok) {
        expect(verdict.embedUrl).toBe(`https://www.youtube-nocookie.com/embed/${id}?rel=0`);
        expect(verdict.embedUrl.startsWith('https://www.youtube-nocookie.com/')).toBe(true);
      }
    }
  });

  test('a watch page and a share shortener are NEVER the frame source', () => {
    // Both answer X-Frame-Options: SAMEORIGIN, verified live in the research.
    // They are accepted in the paste box and turned into an embed path.
    const frame = embedUrlFor(id);
    expect(frame).not.toContain('/watch');
    expect(frame).not.toContain('youtu.be');
    expect(watchUrlFor(id)).toContain('/watch?v=');
  });

  test('no API key, no client id and no origin parameter is written into the frame', () => {
    const frame = embedUrlFor(id);
    expect(frame).not.toMatch(/key=|client_id|access_token/);
    // No enablejsapi, so no origin: the parameter is the targetOrigin of a
    // postMessage channel this player does not open, and a wrong one makes the
    // callbacks silently never fire.
    expect(frame).not.toContain('enablejsapi');
    expect(frame).not.toContain('origin=');
  });

  test('a link on an allowed host with no video in it is refused for that reason', () => {
    const verdict = judge('https://www.youtube.com/feed/subscriptions', ALLOWLIST);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('noVideoId');
  });

  test('an eleven-character id is the only shape accepted', () => {
    expect(videoIdFrom('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(videoIdFrom('https://www.youtube.com/watch?v=waytoolongforanidentifier')).toBeNull();
  });
});

describe('the keyless preflight, and what its answers mean', () => {
  test('the endpoint is oEmbed and it carries no credential', () => {
    const url = oembedUrlFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(url.startsWith('https://www.youtube.com/oembed?')).toBe(true);
    expect(url).not.toMatch(/key=|token/);
  });

  test('200 is embeddable, and every other answer is a named refusal', () => {
    expect(reasonForStatus(200)).toBeNull();
    expect(reasonForStatus(401)).toBe('notEmbeddable');
    expect(reasonForStatus(404)).toBe('unavailable');
    expect(reasonForStatus(400)).toBe('notAVideoLink');
    expect(reasonForStatus(500)).toBe('notAVideoLink');
  });
});

describe('the host of a link', () => {
  test('it is lower cased, so a shouted hostname is judged the same way', () => {
    expect(hostOf('https://WWW.YouTube.com/watch?v=dQw4w9WgXcQ')).toBe('www.youtube.com');
    expect(judge('https://WWW.YouTube.com/watch?v=dQw4w9WgXcQ', ALLOWLIST).ok).toBe(true);
  });

  test('a look-alike host is not the host', () => {
    for (const url of [
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com.evil.example/embed/dQw4w9WgXcQ',
      'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      const verdict = judge(url, ALLOWLIST);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.reason).toBe('hostNotAllowed');
    }
  });

  test('an empty allowlist refuses everything, which is what an empty list means', () => {
    expect(judge('https://www.youtube.com/watch?v=dQw4w9WgXcQ', []).ok).toBe(false);
  });
});
