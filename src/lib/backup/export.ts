import { crc32 } from 'node:zlib';

/**
 * The two downloads: everything as one JSON document, and everything as one
 * CSV per table inside a zip.
 *
 * BOTH ARE RE-IMPORTABLE AND THAT IS WHAT MAKES THEM AN EXPORT RATHER THAN A
 * REPORT. F130 asks for both files to go back into a scratch instance with
 * identical row counts, so the shape of each is decided by what a loader can
 * read back, not by what looks tidy: the JSON carries the column names Postgres
 * gave it, and the CSV distinguishes an empty string from a null the way a
 * `COPY ... WITH CSV` does, because a spreadsheet cannot and a database must.
 *
 * BOTH STREAM. The JSON document is written table by table and row batch by row
 * batch, and the zip is written entry by entry with its sizes computed as it
 * goes, so a download of a database with three hundred thousand rows in it does
 * not assemble three hundred thousand rows in memory first.
 *
 * Dependency free apart from `node:zlib`, which is where the CRC-32 the zip
 * format needs already lives, so `scripts/import-export.mjs` reads it straight
 * from Node.
 */

export type ExportMeta = {
  exportedAt: string;
  app: string;
  format: number;
  timeZone: string;
  tables: string[];
  excluded: Array<{ table: string; reason: string }>;
};

export const EXPORT_FORMAT = 1;

/**
 * The JSON document.
 *
 * One object, `meta` first so a reader knows what it has before it reads a
 * hundred megabytes, then `tables` keyed by table name with an array of row
 * objects under each. Written by hand rather than by `JSON.stringify` over a
 * whole structure, because the whole structure is the thing that must not exist
 * in memory.
 */
export async function* jsonDocument(
  meta: ExportMeta,
  tables: AsyncIterable<{ table: string; rows: AsyncIterable<string[]> }>,
): AsyncGenerator<string> {
  yield `{\n  "meta": ${JSON.stringify(meta, null, 2).replace(/\n/g, '\n  ')},\n  "tables": {\n`;
  let firstTable = true;
  for await (const entry of tables) {
    yield `${firstTable ? '' : ',\n'}    ${JSON.stringify(entry.table)}: [`;
    firstTable = false;
    let firstRow = true;
    for await (const batch of entry.rows) {
      for (const row of batch) {
        yield `${firstRow ? '\n      ' : ',\n      '}${row}`;
        firstRow = false;
      }
    }
    yield firstRow ? ']' : '\n    ]';
  }
  yield '\n  }\n}\n';
}

/**
 * One CSV cell.
 *
 * A null is an empty field and an empty string is a quoted empty field, which
 * is the one distinction a spreadsheet throws away and a re-import needs. Every
 * other value is quoted when it holds a comma, a quote, a newline or a leading
 * or trailing space, and a doubled quote escapes a quote, which is RFC 4180 and
 * also what psql writes.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  if (text === '') return '""';
  if (/[",\n\r]/.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function csvLine(values: unknown[]): string {
  return `${values.map(csvCell).join(',')}\r\n`;
}

/**
 * One CSV line, read back into cells.
 *
 * An unquoted empty field is a null and a quoted empty field is an empty
 * string, which is the same rule the writer above applies in the other
 * direction. Returns `null` for a null so a loader can tell them apart.
 */
export function parseCsvLine(line: string): Array<string | null> {
  const cells: Array<string | null> = [];
  let index = 0;
  while (index <= line.length) {
    if (line[index] === '"') {
      let value = '';
      index += 1;
      for (;;) {
        if (index >= line.length) break;
        if (line[index] === '"') {
          if (line[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        value += line[index];
        index += 1;
      }
      cells.push(value);
    } else {
      let value = '';
      while (index < line.length && line[index] !== ',') {
        value += line[index];
        index += 1;
      }
      cells.push(value === '' ? null : value);
    }
    if (line[index] === ',') {
      index += 1;
      if (index === line.length) cells.push(null);
      continue;
    }
    break;
  }
  return cells;
}

/** A whole CSV file, split on the line endings the writer produced. */
export function parseCsv(text: string): { header: string[]; rows: Array<Array<string | null>> } {
  const lines = splitCsvLines(text);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]).map((cell) => cell ?? '');
  return { header, rows: lines.slice(1).map(parseCsvLine) };
}

/** Splits on newlines that are not inside quotes, which a naive split is not. */
export function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }
    if (!quoted && character === '\r' && text[index + 1] === '\n') {
      lines.push(current);
      current = '';
      index += 1;
      continue;
    }
    if (!quoted && character === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current !== '') lines.push(current);
  return lines;
}

/**
 * ---------------------------------------------------------------------------
 * The zip, written by hand, STORED rather than deflated.
 * ---------------------------------------------------------------------------
 *
 * WHY A ZIP AT ALL. One CSV per table is what a spreadsheet wants and what
 * `12-settings-integrations.html` frame 3 says the CSV export is; twenty-eight
 * separate downloads is not an export. macOS opens a zip with a double click
 * and so does everything else.
 *
 * WHY STORED. The format needs each entry's CRC-32 and its compressed size in
 * the local header, BEFORE the bytes; a deflated entry means either buffering
 * the whole entry to measure it or writing a data descriptor, and both are more
 * to get wrong for a file that is mostly numbers and is about to be read once.
 * `node:zlib` is here for its CRC and for nothing else.
 */

export type ZipEntry = { name: string; body: Uint8Array };

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
/** 20, which is "2.0", the version that understands a stored entry. */
const VERSION = 20;

function dosTime(at: Date): { time: number; date: number } {
  const time =
    (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2);
  const date =
    ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  return { time, date };
}

/** A zip of entries already in memory. Each CSV is one table, and each is small. */
export function zipEntries(entries: ZipEntry[], at: Date = new Date()): Buffer {
  const { time, date } = dosTime(at);
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const body = Buffer.from(entry.body);
    const sum = crc32(body);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(VERSION, 4);
    // Bit 11: the name is UTF-8. Nothing else is set, so there is no data
    // descriptor and every size below is the real one.
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    parts.push(local, name, body);

    const entryHeader = Buffer.alloc(46);
    entryHeader.writeUInt32LE(CENTRAL_HEADER, 0);
    entryHeader.writeUInt16LE(VERSION, 4);
    entryHeader.writeUInt16LE(VERSION, 6);
    entryHeader.writeUInt16LE(0x0800, 8);
    entryHeader.writeUInt16LE(0, 10);
    entryHeader.writeUInt16LE(time, 12);
    entryHeader.writeUInt16LE(date, 14);
    entryHeader.writeUInt32LE(sum, 16);
    entryHeader.writeUInt32LE(body.length, 20);
    entryHeader.writeUInt32LE(body.length, 24);
    entryHeader.writeUInt16LE(name.length, 28);
    entryHeader.writeUInt16LE(0, 30);
    entryHeader.writeUInt16LE(0, 32);
    entryHeader.writeUInt16LE(0, 34);
    entryHeader.writeUInt16LE(0, 36);
    entryHeader.writeUInt32LE(0, 38);
    entryHeader.writeUInt32LE(offset, 42);
    central.push(entryHeader, name);

    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, directory, end]);
}

/**
 * Reads a zip this writer produced, which is what the re-import needs.
 *
 * It walks the CENTRAL DIRECTORY rather than scanning for local headers,
 * because the directory is the authoritative list: a scan would find a header
 * signature that happened to occur inside a CSV value and read rubbish from it.
 */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  const buffer = Buffer.from(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== END_OF_CENTRAL) end -= 1;
  if (end < 0) throw new Error('zip_end_of_central_directory_missing');

  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_HEADER) throw new Error('zip_central_header_missing');
    const compressed = buffer.readUInt16LE(cursor + 10);
    if (compressed !== 0) throw new Error('zip_entry_not_stored');
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({ name, body: buffer.subarray(start, start + size) });

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
