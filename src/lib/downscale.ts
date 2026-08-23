/**
 * Step 1 of the mandatory sequence: the photograph is made smaller and made
 * again, on the device, before a request exists.
 *
 * THE STRIPPING IS THE RE-ENCODE AND NOT A PARSER. Nothing here reads EXIF,
 * looks for a GPS block or edits a metadata format. The bitmap is decoded, the
 * pixels are drawn onto a canvas and the canvas is encoded to a new JPEG, so
 * what comes out is a file this browser wrote from pixels. There is no path by
 * which the camera's directory survives that, and there is no metadata format
 * this build has to know about for it to work, including the next one.
 *
 * 1092 px on the long edge, from `.forge/PLAN.md` slice 10. Bigger costs input
 * tokens for detail a plate of food does not have; smaller starts losing the
 * edges the model estimates a portion from.
 *
 * It runs in the browser and only in the browser, which is the point: "on the
 * device" is the line, and a resize on the server would mean the original left
 * the phone with everything the camera put in it.
 */

export const LONG_EDGE_PX = 1092;

/**
 * The encoder quality. High enough that a plate of food keeps its edges, low
 * enough that a 1092 px frame is a few hundred kilobytes over a phone network.
 */
export const JPEG_QUALITY = 0.82;

export const JPEG_TYPE = 'image/jpeg';

export type Downscaled = { blob: Blob; width: number; height: number };

/** The size the long edge is pinned to, keeping the aspect ratio. */
export function fitToLongEdge(
  width: number,
  height: number,
  longEdge = LONG_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= 0) return { width: 0, height: 0 };
  const scale = longEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function downscaleToJpeg(file: Blob, longEdge = LONG_EDGE_PX): Promise<Downscaled> {
  const bitmap = await createImageBitmap(file);
  const size = fitToLongEdge(bitmap.width, bitmap.height, longEdge);

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(NO_CANVAS);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, JPEG_TYPE, JPEG_QUALITY);
  });
  if (!blob) throw new Error(NO_ENCODE);

  return { blob, width: size.width, height: size.height };
}

/*
 * Two operator-facing tokens, not product copy, and deliberately not sentences.
 * They reach a caught object and a container log, never a screen: the component
 * that calls this renders the catalogue's own cause. Same rule and same shape
 * as NOT_A_DOCUMENT_ID in src/lib/lab-storage.ts.
 */
const NO_CANVAS = 'downscale: no 2d context';
const NO_ENCODE = 'downscale: encoder returned nothing';
