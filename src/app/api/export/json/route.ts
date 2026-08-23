import { streamJsonExport } from '@/db/exports';
import { NO_STORE, refuse, sessionOrRefusal } from '@/lib/gate';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

/**
 * The structured export, streamed straight to the browser.
 *
 * A ReadableStream rather than a string, because the whole point of the cursor
 * underneath is that a database with three hundred thousand rows in it never
 * exists in memory twice. The download starts before the last table is read.
 *
 * The name carries the date so two exports in one week are two files in the
 * Downloads folder rather than `export (3).json`.
 */
export async function GET() {
  const { refusal } = await sessionOrRefusal();
  if (refusal) return refusal;

  const day = new Date().toISOString().slice(0, 10);
  const encoder = new TextEncoder();
  try {
    const source = streamJsonExport(new Date());
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await source.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(next.value));
      },
      async cancel() {
        // A browser that navigates away mid-download leaves a transaction and a
        // cursor open on the pool. The generator's own `finally` closes both,
        // and this is what reaches it.
        await source.return(undefined as never).catch(() => undefined);
      },
    });
    return new Response(stream, {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="vernier-export-${day}.json"`,
      },
    });
  } catch (error) {
    console.error(`[vernier] json export: ${(error as Error).message}`);
    return refuse(500, strings.api.data.exportFailed, strings.api.data.exportFailedDetail);
  }
}
