#!/usr/bin/env node
// ANSES CIQUAL 2025, turned into the one file the food table seeds from.
//
//   node scripts/build-food-seed.mjs             write drizzle/seed/foods.csv
//   node scripts/build-food-seed.mjs --check     fail if what is there is not
//                                                what this would write
//
// Reads var/ciqual/Table Ciqual 2025_FR_2025_11_03.xlsx, which
// scripts/fetch-ciqual.sh downloads and verifies. Writes a derived CSV that is
// committed, so the build needs no network, the image needs no network, and the
// container starts with a food table on a machine that has never seen
// ciqual.anses.fr.
//
// NO DEPENDENCY. An .xlsx is a ZIP of XML, node:zlib inflates the entries, and
// the two parts that matter are a shared string table and one sheet. That is
// forty lines of reader against a spreadsheet library the approved dependency
// list does not name, and the list is closed.
//
// FOUR DATA FACTS, ALL OBSERVED IN THE FILE ITSELF, NOT ASSUMED:
//
//   1. Every cell on the composition sheet is a shared string, including the
//      numbers. So a value arrives as text and is parsed here, once.
//   2. The decimal separator is a comma. "0,001" is one thousandth.
//   3. Missing is "-", and it stays missing. It is written as an empty field
//      and read back as NULL, and the screen says "unknown". Never 0. That is
//      the difference between not knowing and knowing it is zero, and it is
//      the line F78 turns on.
//   4. "traces" and "< 0,5" are censored values. They become 0 and the field
//      is named in the censored column, so a zero that was really a ceiling is
//      still tellable from a measured zero.
//
// AND THE ENERGY GOTCHA, WHICH IS THE REASON THIS SCRIPT COMPUTES ANYTHING AT
// ALL. CIQUAL publishes an energy value for about seven foods in ten. The rest
// carry macronutrients and no energy. Those rows get an energy computed by the
// EU Regulation 1169/2011 Annex XIV conversion factors, which is the same basis
// CIQUAL uses for its own published figure, and they are marked
// energy_source=computed_atwater. F79 turns on that marker reaching the screen.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const SOURCE = join(projectRoot, 'var', 'ciqual', 'Table Ciqual 2025_FR_2025_11_03.xlsx');
const OUT = join(projectRoot, 'drizzle', 'seed', 'foods.csv');
const TABLE_VERSION = 'ciqual-2025-11-03';

// --------------------------------------------------------------------------
// A ZIP reader, central directory first, because the local headers in this file
// carry a streaming flag and their sizes are zero.

function readZip(path) {
  const buf = readFileSync(path);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`not a zip archive: ${path}`);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n += 1) {
    const method = buf.readUInt16LE(off + 10);
    const compressed = buf.readUInt32LE(off + 20);
    const nameLength = buf.readUInt16LE(off + 28);
    const extraLength = buf.readUInt16LE(off + 30);
    const commentLength = buf.readUInt16LE(off + 32);
    const localOffset = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLength);
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buf.subarray(start, start + compressed);
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    off += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** The XML entity set an Excel writer actually emits. */
function unescapeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/** The shared string table, in order, with rich-text runs joined. */
function readSharedStrings(xml) {
  const table = [];
  for (const item of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = '';
    for (const run of item[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) text += run[1];
    table.push(unescapeXml(text));
  }
  return table;
}

/** "AB12" to a zero-based column index. */
function columnIndex(reference) {
  const letters = reference.match(/^[A-Z]+/)[0];
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** One sheet, as an array of rows, each row an array of cell text. */
function readSheet(xml, shared) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cell of rowMatch[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*)\/?>(?:([\s\S]*?)<\/c>)?/g)) {
      const attributes = cell[2] ?? '';
      const body = cell[3] ?? '';
      const value = body.match(/<v>([\s\S]*?)<\/v>/);
      let text = '';
      if (value) {
        text = / t="s"/.test(attributes) ? (shared[Number(value[1])] ?? '') : unescapeXml(value[1]);
      } else {
        const inline = body.match(/<is>[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
        if (inline) text = unescapeXml(inline[1]);
      }
      cells[columnIndex(cell[1])] = text;
    }
    rows.push(cells);
  }
  return rows;
}

// --------------------------------------------------------------------------
// The five nutrients, plus the three the Atwater sum needs.
//
// Column position is read off the header row by name rather than hard coded, so
// a release that inserts a constituent moves nothing here.

const COLUMNS = {
  groupCode: 'alim_grp_code',
  subgroupCode: 'alim_ssgrp_code',
  code: 'alim_code',
  nameFr: 'alim_nom_fr',
  kcal: 'Energie, Règlement UE N° 1169 2011 (kcal 100 g)',
  protein: 'Protéines, N x facteur de Jones (g 100 g)',
  carb: 'Glucides (g 100 g)',
  fat: 'Lipides (g 100 g)',
  fibre: 'Fibres alimentaires (g 100 g)',
  polyols: 'Polyols totaux (g 100 g)',
  alcohol: 'Alcool (éthanol) (g 100 g)',
  organicAcids: 'Acides organiques (g 100 g)',
};

/** Header cells carry hard line breaks. One space, so a name is comparable. */
function flatten(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * One published cell, read.
 *
 * Returns the number, or null for a missing value, and says whether the number
 * arrived censored. A censored zero is a ceiling somebody measured against, not
 * a measurement of nothing, and the two are kept apart because fibre is where
 * this matters most.
 */
function readCell(text) {
  const trimmed = (text ?? '').trim();
  if (trimmed === '' || trimmed === '-') return { value: null, censored: false };
  if (/^traces$/i.test(trimmed)) return { value: 0, censored: true };
  const censored = trimmed.startsWith('<');
  const numeric = trimmed.replace(/^</, '').replace(/\s/g, '').replace(',', '.');
  const parsed = Number(numeric);
  if (!Number.isFinite(parsed)) return { value: null, censored: false };
  return { value: censored ? 0 : parsed, censored };
}

/**
 * EU Regulation 1169/2011 Annex XIV conversion factors, in kcal per gram.
 *
 * The same basis CIQUAL uses for its own published energy, which is why a
 * computed value here is consistent with a published one next to it rather
 * than a second opinion in a different currency.
 */
const ATWATER = {
  protein: 4,
  carbohydrate: 4,
  polyols: 2.4,
  fat: 9,
  fibre: 2,
  alcohol: 7,
  organicAcid: 3,
};

export function atwaterEnergy(parts) {
  const { protein, carb, fat, fibre, polyols, alcohol, organicAcids } = parts;
  if (protein === null || carb === null || fat === null) return null;
  const availableCarb = Math.max(0, carb - (polyols ?? 0));
  return (
    ATWATER.protein * protein +
    ATWATER.carbohydrate * availableCarb +
    ATWATER.polyols * (polyols ?? 0) +
    ATWATER.fat * fat +
    ATWATER.fibre * (fibre ?? 0) +
    ATWATER.alcohol * (alcohol ?? 0) +
    ATWATER.organicAcid * (organicAcids ?? 0)
  );
}

/** A CSV field. Quoted only when it has to be, so the file stays small. */
function field(text) {
  const value = text === null || text === undefined ? '' : String(text);
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Two decimals is the precision CIQUAL publishes at. Trailing zeros go. */
function number(value) {
  if (value === null) return '';
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export const HEADER =
  'alim_code,name_fr,group_code,subgroup_code,kcal_100g,protein_g,carb_g,fat_g,fibre_g,energy_source,censored';

function build() {
  const zip = readZip(SOURCE);
  const shared = readSharedStrings(zip.get('xl/sharedStrings.xml').toString('utf8'));
  const rows = readSheet(zip.get('xl/worksheets/sheet1.xml').toString('utf8'), shared);

  const header = rows[0].map((cell) => flatten(cell ?? ''));
  const at = {};
  for (const [key, label] of Object.entries(COLUMNS)) {
    const index = header.indexOf(label);
    if (index < 0) throw new Error(`build-food-seed: the sheet has no column named ${label}`);
    at[key] = index;
  }

  const lines = [HEADER];
  const counts = { total: 0, allFive: 0, published: 0, computed: 0, noEnergy: 0, nullFibre: 0 };

  for (const row of rows.slice(1)) {
    const code = (row[at.code] ?? '').trim();
    if (code === '') continue;
    counts.total += 1;

    const censored = [];
    const read = (key, name) => {
      const cell = readCell(row[at[key]]);
      if (cell.censored) censored.push(name);
      return cell.value;
    };

    const protein = read('protein', 'protein_g');
    const carb = read('carb', 'carb_g');
    const fat = read('fat', 'fat_g');
    const fibre = read('fibre', 'fibre_g');
    const published = read('kcal', 'kcal_100g');
    // Consumed by the sum below and not stored. A polyol figure on a screen
    // that shows five nutrients is a sixth number nobody asked for.
    const polyols = readCell(row[at.polyols]).value;
    const alcohol = readCell(row[at.alcohol]).value;
    const organicAcids = readCell(row[at.organicAcids]).value;

    let kcal = published;
    let energySource = 'published';
    if (kcal === null) {
      kcal = atwaterEnergy({ protein, carb, fat, fibre, polyols, alcohol, organicAcids });
      energySource = kcal === null ? '' : 'computed_atwater';
    }

    if (energySource === 'published') counts.published += 1;
    else if (energySource === 'computed_atwater') counts.computed += 1;
    else counts.noEnergy += 1;
    if (fibre === null) counts.nullFibre += 1;
    if (kcal !== null && protein !== null && carb !== null && fat !== null && fibre !== null) {
      counts.allFive += 1;
    }

    lines.push(
      [
        field(code),
        field(flatten(row[at.nameFr] ?? '')),
        field((row[at.groupCode] ?? '').trim()),
        field((row[at.subgroupCode] ?? '').trim()),
        number(kcal),
        number(protein),
        number(carb),
        number(fat),
        number(fibre),
        field(energySource),
        field(censored.join('|')),
      ].join(','),
    );
  }

  return { text: `${lines.join('\n')}\n`, counts };
}

const check = process.argv.includes('--check');
const { text, counts } = build();
const digest = createHash('sha256').update(text).digest('hex');

if (check) {
  let existing = '';
  try {
    existing = readFileSync(OUT, 'utf8');
  } catch {
    existing = '';
  }
  if (existing !== text) {
    process.stderr.write(
      `build-food-seed: ${OUT} is not what this script would write from ${TABLE_VERSION}.\n`,
    );
    process.exit(2);
  }
  process.stdout.write(`build-food-seed: foods.csv matches ${TABLE_VERSION}, sha256 ${digest}\n`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, text);
process.stdout.write(
  [
    `build-food-seed: ${counts.total} foods from ${TABLE_VERSION}, ${Buffer.byteLength(text)} bytes`,
    `  energy published        ${counts.published}`,
    `  energy computed Atwater ${counts.computed}`,
    `  no energy at all        ${counts.noEnergy}`,
    `  all five nutrients      ${counts.allFive}`,
    `  fibre stored as null    ${counts.nullFibre}`,
    `  sha256 ${digest}`,
    '',
  ].join('\n'),
);
