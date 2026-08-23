/**
 * What a JPEG says about itself, read by walking its segments.
 *
 * F93 has two halves and this file is the second one. The first half is the
 * canvas re-encode on the phone, which removes camera data and location by
 * producing new pixels rather than by editing a metadata format. The second
 * half is proving it: the server reads the bytes that arrived, refuses anything
 * still carrying camera data, and stores a file with no metadata segment of any
 * kind in it.
 *
 * WHY REFUSE RATHER THAN CLEAN. Stripping server side would produce a clean
 * file either way, and a clean file either way proves nothing about the phone.
 * F93 names the device step, so the device step has to be the thing that
 * happened, and an upload that still carries an EXIF block did not go through
 * it. The refusal is the evidence that the sequence ran in the order the line
 * puts it in.
 *
 * AND THEN STRIP ANYWAY. What survives a canvas encode is a JFIF density block
 * and, on some encoders, nothing at all. Neither is camera data, but "zero
 * tags" is a claim worth being able to make without an argument about which
 * blocks count, so every APPn and every comment segment comes out before the
 * bytes are written to the volume. What is stored is entropy-coded image data
 * and the tables needed to decode it.
 *
 * This is a byte walk and nothing else. No image library, no decode, no
 * re-encode on the server, and therefore no native binary in the image.
 */

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;

/** Markers that stand alone: no length field follows them. */
function isStandalone(marker: number): boolean {
  return marker === SOI || marker === EOI || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

/** The frame headers that carry the image size. Not C4, C8 or CC, which do not. */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

export type JpegSegment = { marker: number; offset: number; length: number };

export type JpegScan = {
  ok: boolean;
  /** Every segment found, in file order. The population a zero is read beside. */
  segments: JpegSegment[];
  /** Names, for a log line and for the source record: "APP1", "SOF0", "DQT". */
  markerNames: string[];
  width: number | null;
  height: number | null;
  exif: boolean;
  gps: boolean;
  xmp: boolean;
  /** Any APPn or comment segment at all, including the harmless ones. */
  metadataSegments: number;
};

export function markerName(marker: number): string {
  // Concatenated rather than interpolated, so each literal below is one run of
  // characters with no space in it. That is what tells the string checker this
  // is notation and not language, and it is true: these are marker names out of
  // the JPEG specification, printed into a log and into a source record.
  if (marker >= 0xe0 && marker <= 0xef) return 'APP' + String(marker - 0xe0);
  if (isStartOfFrame(marker)) return 'SOF' + String(marker - 0xc0);
  if (marker === 0xdb) return 'DQT';
  if (marker === 0xc4) return 'DHT';
  if (marker === 0xdd) return 'DRI';
  if (marker === SOS) return 'SOS';
  if (marker === SOI) return 'SOI';
  if (marker === EOI) return 'EOI';
  if (marker === 0xfe) return 'COM';
  return 'FF' + marker.toString(16).toUpperCase().padStart(2, '0');
}

function startsWith(bytes: Uint8Array, at: number, ascii: string): boolean {
  for (let index = 0; index < ascii.length; index += 1) {
    if (bytes[at + index] !== ascii.charCodeAt(index)) return false;
  }
  return true;
}

function startsWithBytes(bytes: Uint8Array, at: number, wanted: readonly number[]): boolean {
  for (let index = 0; index < wanted.length; index += 1) {
    if (bytes[at + index] !== wanted[index]) return false;
  }
  return true;
}

/**
 * The six bytes that open an EXIF block: the four letters of the format's name
 * and two zeroes.
 *
 * Written as bytes rather than as text because it IS bytes: a signature at a
 * fixed offset in a binary format, compared against the file, never rendered
 * and never read by a person. The same reason the marker names above are
 * concatenated tokens.
 */
const EXIF_SIGNATURE = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] as const;

/**
 * Does this APP1 EXIF block carry a GPS directory.
 *
 * A light TIFF walk: the byte order, the 42, the offset of the first directory,
 * then its entries, looking for tag 0x8825, which is the GPS sub-directory
 * pointer. It does not decode a coordinate and never will: the question is
 * whether location is present, and printing a location this product refused
 * would be the same mistake the blood-pressure refusal is careful not to make.
 */
function hasGpsDirectory(bytes: Uint8Array, start: number, end: number): boolean {
  const tiff = start + 6; // past "Exif\0\0"
  if (tiff + 8 > end) return false;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!little && !big) return false;

  const read16 = (at: number) =>
    little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1];
  const read32 = (at: number) =>
    little
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
      : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

  if (read16(tiff + 2) !== 42) return false;
  const first = tiff + read32(tiff + 4);
  if (first + 2 > end) return false;
  const count = read16(first);
  for (let index = 0; index < count; index += 1) {
    const entry = first + 2 + index * 12;
    if (entry + 12 > end) return false;
    if (read16(entry) === 0x8825) return true;
  }
  return false;
}

export function scanJpeg(bytes: Uint8Array): JpegScan {
  const scan: JpegScan = {
    ok: false,
    segments: [],
    markerNames: [],
    width: null,
    height: null,
    exif: false,
    gps: false,
    xmp: false,
    metadataSegments: 0,
  };

  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return scan;
  scan.ok = true;
  scan.segments.push({ marker: SOI, offset: 0, length: 0 });
  scan.markerNames.push(markerName(SOI));

  let at = 2;
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) break;
    let marker = bytes[at + 1];
    // Fill bytes. A run of 0xFF before a marker is legal padding.
    let cursor = at + 1;
    while (marker === 0xff && cursor + 1 < bytes.length) {
      cursor += 1;
      marker = bytes[cursor];
    }
    if (isStandalone(marker)) {
      scan.segments.push({ marker, offset: cursor - 1, length: 0 });
      scan.markerNames.push(markerName(marker));
      at = cursor + 1;
      if (marker === EOI) break;
      continue;
    }
    if (cursor + 3 > bytes.length) break;
    const length = (bytes[cursor + 1] << 8) | bytes[cursor + 2];
    const payload = cursor + 3;
    const end = cursor + 1 + length;
    scan.segments.push({ marker, offset: cursor - 1, length });
    scan.markerNames.push(markerName(marker));

    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) scan.metadataSegments += 1;
    if (marker === 0xe1) {
      if (startsWithBytes(bytes, payload, EXIF_SIGNATURE)) {
        scan.exif = true;
        if (hasGpsDirectory(bytes, payload, Math.min(end, bytes.length))) scan.gps = true;
      }
      if (startsWith(bytes, payload, 'http://ns.adobe.com/xap/')) scan.xmp = true;
    }
    if (isStartOfFrame(marker) && payload + 5 <= bytes.length) {
      scan.height = (bytes[payload + 1] << 8) | bytes[payload + 2];
      scan.width = (bytes[payload + 3] << 8) | bytes[payload + 4];
    }
    // Entropy-coded data follows the scan header and holds no segments this
    // walk cares about. Everything above appears before it in a baseline file.
    if (marker === SOS) break;
    at = end;
  }

  return scan;
}

/**
 * The same bytes with every APPn and every comment segment removed.
 *
 * Nothing else is touched: the quantisation tables, the Huffman tables, the
 * frame header and the entropy-coded data are copied through byte for byte, so
 * the image is the same image and it decodes in any reader.
 */
export function stripMetadataSegments(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return bytes;
  const out: number[] = [0xff, SOI];
  let at = 2;
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1];
    if (isStandalone(marker)) {
      out.push(0xff, marker);
      at += 2;
      continue;
    }
    if (at + 3 > bytes.length) break;
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    const end = at + 2 + length;
    const drop = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!drop) for (let index = at; index < Math.min(end, bytes.length); index += 1) out.push(bytes[index]);
    if (marker === SOS) {
      // Everything from here to the end of the file is entropy-coded data and
      // the final EOI. It is copied whole.
      for (let index = end; index < bytes.length; index += 1) out.push(bytes[index]);
      return Uint8Array.from(out);
    }
    at = end;
  }
  return Uint8Array.from(out);
}

/** True when the file carries anything a camera or a phone wrote about itself. */
export function carriesCameraData(scan: JpegScan): boolean {
  return scan.exif || scan.gps || scan.xmp;
}
