import { buildCsvZip } from '@/db/exports';
import { NO_STORE, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The tabular export: one CSV per table inside one zip, which is what a
 * spreadsheet wants and what screen 12 frame 3 says this control produces.
 *
 * Assembled rather than streamed, because a zip's central directory needs every
 * entry's size and CRC before it can be written. `src/db/exports.ts` says why
 * that ceiling is acceptable here and is not acceptable for the archive.
 */
export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const at = new Date();
  const day = at.toISOString().slice(0, 10);
  try {
    const zip = await buildCsvZip(at);
    return new Response(new Uint8Array(zip), {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/zip',
        'Content-Length': String(zip.length),
        'Content-Disposition': `attachment; filename="vernier-export-${day}.zip"`,
      },
    });
  } catch (error) {
    console.error(`[vernier] csv export: ${(error as Error).message}`);
    return refuse(500, strings.api.data.exportFailed, strings.api.data.exportFailedDetail);
  }
}
