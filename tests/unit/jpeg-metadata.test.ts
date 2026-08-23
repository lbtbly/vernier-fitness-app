import { describe, expect, test } from 'vitest';
import { carriesCameraData, markerName, scanJpeg, stripMetadataSegments } from '@/lib/jpeg';
import { fitToLongEdge, LONG_EDGE_PX } from '@/lib/downscale';
import { jpegFromCanvas, jpegWithGps } from './jpeg-fixture';

/**
 * The photograph carries no camera data and no location. F93.
 *
 * THE PROOF IS ON A PHOTO THAT HAD GPS, which is what the line asks for. The
 * fixture is built byte by byte with a real TIFF directory and a real GPS
 * sub-directory pointer inside it, so the first assertion below is a scanner
 * FINDING something. A test that only ever looked at clean files would pass
 * over a scanner that could not see anything at all, which is this run's own
 * failure class.
 *
 * WHAT WOULD MAKE THESE GO RED. A scanner that stopped reading APP1 payloads
 * fails the first block, because the GPS directory would go unseen. A strip
 * that removed the frame header along with the metadata fails the second,
 * because the dimensions are read back afterwards. Accepting a file whose long
 * edge is 4032 fails the third.
 */

describe('a photograph off a camera is seen for what it is', () => {
  test('the scanner finds the EXIF block and the GPS directory inside it', () => {
    const scan = scanJpeg(jpegWithGps());
    expect(scan.ok).toBe(true);
    expect(scan.exif).toBe(true);
    expect(scan.gps).toBe(true);
    expect(carriesCameraData(scan)).toBe(true);
    // The population, printed rather than assumed: the marker list is what the
    // route logs beside its refusal.
    expect(scan.markerNames).toContain('APP1');
    expect(scan.metadataSegments).toBe(1);
  });

  test('the frame header gives the real dimensions, which is how the size is checked', () => {
    const scan = scanJpeg(jpegWithGps(4032, 3024));
    expect(scan.width).toBe(4032);
    expect(scan.height).toBe(3024);
    expect(Math.max(scan.width!, scan.height!)).toBeGreaterThan(LONG_EDGE_PX);
  });

  test('a file that is not a JPEG at all is not read as one', () => {
    const scan = scanJpeg(Uint8Array.from([0x25, 0x50, 0x44, 0x46]));
    expect(scan.ok).toBe(false);
    expect(scan.exif).toBe(false);
  });
});

describe('what a canvas produces, and what is stored', () => {
  test('a re-encoded photograph carries no camera directory and no location', () => {
    const scan = scanJpeg(jpegFromCanvas());
    expect(scan.exif).toBe(false);
    expect(scan.gps).toBe(false);
    expect(scan.xmp).toBe(false);
    expect(carriesCameraData(scan)).toBe(false);
    // It does carry one harmless density block, which is why the server strips
    // as well as refusing: "zero tags" should need no argument.
    expect(scan.metadataSegments).toBe(1);
    expect(scan.markerNames).toContain('APP0');
  });

  test('stripping leaves zero metadata segments and the same picture', () => {
    const before = jpegFromCanvas(1092, 819);
    const after = stripMetadataSegments(before);
    const scan = scanJpeg(after);

    expect(scan.metadataSegments).toBe(0);
    expect(scan.markerNames).not.toContain('APP0');
    expect(scan.markerNames.filter((name) => name.startsWith('APP'))).toHaveLength(0);

    // The image survives: the frame header and the scan are still there and the
    // dimensions read back unchanged.
    expect(scan.width).toBe(1092);
    expect(scan.height).toBe(819);
    expect(scan.markerNames).toContain('SOS');
    expect(after.length).toBeLessThan(before.length);
  });

  test('stripping a camera photograph removes the location as well, belt and braces', () => {
    const stripped = stripMetadataSegments(jpegWithGps());
    const scan = scanJpeg(stripped);
    expect(scan.exif).toBe(false);
    expect(scan.gps).toBe(false);
    expect(scan.metadataSegments).toBe(0);
  });
});

describe('the long edge is pinned to 1092 and the aspect ratio is kept', () => {
  test('a landscape phone photograph comes down to 1092 on its long edge', () => {
    const size = fitToLongEdge(4032, 3024);
    expect(Math.max(size.width, size.height)).toBe(LONG_EDGE_PX);
    expect(size.width).toBe(1092);
    expect(size.height).toBe(819);
  });

  test('a portrait photograph is pinned on the other edge', () => {
    const size = fitToLongEdge(3024, 4032);
    expect(Math.max(size.width, size.height)).toBe(LONG_EDGE_PX);
    expect(size.height).toBe(1092);
  });

  test('a picture already smaller than the target is still normalised, not left alone', () => {
    const size = fitToLongEdge(600, 400);
    expect(Math.max(size.width, size.height)).toBe(LONG_EDGE_PX);
  });
});

describe('marker names are notation and read as notation', () => {
  test('the application and frame markers name themselves', () => {
    expect(markerName(0xe0)).toBe('APP0');
    expect(markerName(0xe1)).toBe('APP1');
    expect(markerName(0xc0)).toBe('SOF0');
    expect(markerName(0xda)).toBe('SOS');
  });
});
