import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type ExportMeta,
  EXPORT_FORMAT,
  csvCell,
  csvLine,
  jsonDocument,
  parseCsv,
  parseCsvLine,
  readZip,
  splitCsvLines,
  zipEntries,
} from '@/lib/backup/export';

/**
 * The export, read back the way the re-import reads it.
 *
 * F130's claim is not "a file downloads". It is that both files go back into a
 * scratch instance with identical row counts, and the whole of that claim rests
 * on two things a test can hold without a database: that a value survives the
 * trip out and back, and that the container the CSVs arrive in is a real zip.
 *
 * THE ZIP IS OPENED BY THE SYSTEM `unzip`, not only by our own reader, for the
 * same reason the tar in tests/unit/archive.test.ts is listed by the system
 * `tar`. A format both sides of which we wrote is a format we have agreed with
 * ourselves about.
 */

const META: ExportMeta = {
  exportedAt: '2026-08-23T09:00:00.000Z',
  app: 'vernier',
  format: EXPORT_FORMAT,
  timeZone: 'Europe/Paris',
  tables: ['measurement'],
  excluded: [{ table: 'owner', reason: 'credential' }],
};

async function collect(source: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const piece of source) text += piece;
  return text;
}

describe('the JSON document', () => {
  it('is one parseable object with its meta first and every row under its table', async () => {
    const rows = ['{"id":"a7bf989c","metric":"waist","value":101.5}', '{"id":"b1","metric":"weight","value":85.9}'];
    const text = await collect(
      jsonDocument(META, {
        async *[Symbol.asyncIterator]() {
          yield {
            table: 'measurement',
            rows: (async function* () {
              yield rows;
            })(),
          };
          yield {
            table: 'source_record',
            rows: (async function* () {
              yield [] as string[];
            })(),
          };
        },
      }),
    );
    console.log(text);
    const parsed = JSON.parse(text) as {
      meta: ExportMeta;
      tables: Record<string, Array<Record<string, unknown>>>;
    };
    expect(parsed.meta.format).toBe(EXPORT_FORMAT);
    expect(parsed.tables.measurement).toHaveLength(2);
    expect(parsed.tables.measurement[0].metric).toBe('waist');
    // A table with nothing in it is an empty array rather than a missing key: a
    // re-import that walked the keys would otherwise silently skip it and a
    // count comparison would still pass.
    expect(parsed.tables.source_record).toEqual([]);
    expect(parsed.meta.excluded[0].table).toBe('owner');
  });

  it('holds nothing at all when there is nothing at all, and still parses', async () => {
    const text = await collect(
      jsonDocument(META, {
        async *[Symbol.asyncIterator]() {
          return;
        },
      }),
    );
    expect(JSON.parse(text).tables).toEqual({});
  });
});

describe('a CSV cell', () => {
  it('tells a null from an empty string, which is the one thing a re-import needs', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell('')).toBe('""');
    expect(parseCsvLine('a,,""')).toEqual(['a', null, '']);
  });

  it('quotes a comma, a quote, a newline and a value with space around it', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('she said "no"')).toBe('"she said ""no"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(' padded ')).toBe('" padded "');
  });

  it('round trips every awkward value this database can hold', () => {
    const values = [
      'waist',
      '101.5',
      null,
      '',
      'a value, with a comma',
      'a "quoted" value',
      'a value\nwith a newline',
      'Ω and é',
      '{"deduped": true}',
      "it's fine",
    ];
    const line = csvLine(values);
    const back = parseCsvLine(line.replace(/\r\n$/, ''));
    expect(back).toEqual(values);
  });

  it('splits on newlines outside quotes and never inside one', () => {
    const text = `${csvLine(['id', 'note'])}${csvLine(['a', 'two\nlines'])}${csvLine(['b', 'one'])}`;
    const lines = splitCsvLines(text);
    expect(lines).toHaveLength(3);
    const parsed = parseCsv(text);
    expect(parsed.header).toEqual(['id', 'note']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0][1]).toBe('two\nlines');
  });
});

describe('the zip', () => {
  const entries = [
    { name: 'measurement.csv', body: Buffer.from(`${csvLine(['id', 'metric'])}${csvLine(['a7bf989c', 'waist'])}`) },
    { name: 'source_record.csv', body: Buffer.from(csvLine(['id', 'source'])) },
    { name: 'README.txt', body: Buffer.from('one file per table\n') },
  ];

  it('reads back through our own reader with every byte intact', () => {
    const zip = zipEntries(entries, new Date('2026-08-23T09:00:00Z'));
    const back = readZip(zip);
    expect(back.map((entry) => entry.name)).toEqual([
      'measurement.csv',
      'source_record.csv',
      'README.txt',
    ]);
    expect(Buffer.from(back[0].body).toString('utf8')).toContain('a7bf989c');
    expect(Buffer.from(back[2].body).toString('utf8')).toBe('one file per table\n');
  });

  it('is opened by the system unzip, which has never heard of this repository', () => {
    const directory = mkdtempSync(join(tmpdir(), 'vernier-zip-'));
    try {
      const path = join(directory, 'export.zip');
      writeFileSync(path, zipEntries(entries));
      const listing = execFileSync('unzip', ['-l', path], { encoding: 'utf8' });
      console.log(listing.trim());
      execFileSync('unzip', ['-q', path, '-d', join(directory, 'out')]);
      const unpacked = readdirSync(join(directory, 'out')).sort();
      expect(unpacked).toEqual(['README.txt', 'measurement.csv', 'source_record.csv']);
      expect(readFileSync(join(directory, 'out', 'measurement.csv'), 'utf8')).toContain('waist');
      // And it passes the archive's own integrity test, which is the CRC per
      // entry: a wrong CRC is what a hand-written zip gets wrong first.
      const tested = execFileSync('unzip', ['-t', path], { encoding: 'utf8' });
      expect(tested).toContain('No errors detected');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('holds an entry with a comma, a quote and a newline in it, unharmed', () => {
    const awkward = csvLine(['id', 'note']) + csvLine(['a', 'a "quoted", multi\nline value']);
    const zip = zipEntries([{ name: 'awkward.csv', body: Buffer.from(awkward, 'utf8') }]);
    const [entry] = readZip(zip);
    const parsed = parseCsv(Buffer.from(entry.body).toString('utf8'));
    expect(parsed.rows[0][1]).toBe('a "quoted", multi\nline value');
  });
});
