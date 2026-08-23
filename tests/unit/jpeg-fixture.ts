/**
 * JPEGs built byte by byte, so a test about metadata is a test about bytes.
 *
 * There is no encoder here and no image library. What these produce is a legal
 * segment structure: the markers, the lengths, an APP1 block holding a real
 * TIFF directory with a real GPS sub-directory pointer, a frame header carrying
 * real dimensions, and a scan. That is exactly what `src/lib/jpeg.ts` walks, so
 * the fixture and the thing under test agree about what a JPEG is without
 * either of them being able to lie about it.
 *
 * A photograph off a phone carries more than this. It does not carry anything
 * this scanner reads that this does not: the question it answers is "is there a
 * camera directory, and is there a location in it", and both are here.
 */

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];

function be16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function segment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...be16(payload.length + 2), ...payload];
}

/** The four letters and two zeroes an EXIF block opens with. */
const EXIF_SIGNATURE = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

function le16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function le32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

/**
 * An EXIF payload whose first directory holds a GPS sub-directory pointer.
 *
 * Little endian, the 42 the format requires, one IFD0 entry with tag 0x8825
 * pointing at a GPS directory, and one entry inside that directory. Offsets are
 * counted from the start of the TIFF header, which is where the format counts
 * them from.
 */
function exifWithGps(): number[] {
  const ifd0Offset = 8;
  const ifd0 = [
    ...le16(1),
    ...le16(0x8825),
    ...le16(4),
    ...le32(1),
    ...le32(ifd0Offset + 2 + 12 + 4),
    ...le32(0),
  ];
  const gpsIfd = [
    ...le16(1),
    // GPSLatitudeRef, ASCII, two bytes, held inline as the format allows.
    ...le16(0x0001),
    ...le16(2),
    ...le32(2),
    0x4e,
    0x00,
    0x00,
    0x00,
    ...le32(0),
  ];
  return [...EXIF_SIGNATURE, 0x49, 0x49, ...le16(42), ...le32(ifd0Offset), ...ifd0, ...gpsIfd];
}

/** A baseline frame header: 8-bit samples, one component, and the size. */
function frame(width: number, height: number): number[] {
  return segment(0xc0, [8, ...be16(height), ...be16(width), 1, 1, 0x11, 0]);
}

/** A scan header and one byte of entropy-coded data standing in for a picture. */
function scan(): number[] {
  return [...segment(0xda, [1, 1, 0x00, 0, 63, 0]), 0x00];
}

/** A photograph as a camera writes it: EXIF, a GPS directory, and pixels. */
export function jpegWithGps(width = 4032, height = 3024): Uint8Array {
  return Uint8Array.from([
    ...SOI,
    ...segment(0xe1, exifWithGps()),
    ...frame(width, height),
    ...scan(),
    ...EOI,
  ]);
}

/**
 * A photograph as a canvas writes it: a JFIF density block and pixels.
 *
 * This is what a browser encoder actually produces, and it is the interesting
 * negative case: no camera directory, no location, and one harmless APP0 that
 * the server strips anyway so "zero tags" needs no argument about which blocks
 * count.
 */
export function jpegFromCanvas(width = 1092, height = 819): Uint8Array {
  const jfif = [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, ...be16(1), ...be16(1), 0, 0];
  return Uint8Array.from([
    ...SOI,
    ...segment(0xe0, jfif),
    ...frame(width, height),
    ...scan(),
    ...EOI,
  ]);
}

/**
 * The APP1 segment on its own, marker and length included.
 *
 * The browser walk needs it. A synthetic JPEG cannot be decoded by
 * `createImageBitmap`, so the end-to-end proof of the device re-encode has to
 * start from a picture a browser actually drew: the page encodes a canvas to
 * JPEG, splices these bytes in after the two-byte start marker, and what
 * reaches the file input is a real photograph carrying a real GPS directory.
 */
export function exifApp1Segment(): Uint8Array {
  const payload = exifWithGps();
  return Uint8Array.from([0xff, 0xe1, ...be16(payload.length + 2), ...payload]);
}
