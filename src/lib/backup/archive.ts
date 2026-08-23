import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * The archive format: chunk-framed AES-256-GCM, from Node's own crypto and
 * nothing else.
 *
 * NO `age`, NO `gpg`, NO `openssl`. None of the three is installed on this Mac
 * and the last is absent from `node:*-slim` anyway, so an archive that needed
 * one would be an archive the owner could not open on the morning he needs it.
 * Discovering that a restore needs a missing binary DURING the emergency is the
 * failure this whole slice exists to prevent, so the reader is fifteen hundred
 * bytes of arithmetic over a cipher that ships inside Node itself.
 *
 * WHAT THE FRAMING BUYS. A single GCM tag over a whole archive is authenticated
 * only once it has all been read, which for a forty megabyte file means holding
 * the lot before a single byte can be trusted. Chunks let a restore stream, and
 * the framing is what stops the three attacks streaming would otherwise open:
 *
 *   - The header carries the magic, the version, the cipher, the KDF and its
 *     parameters, the chunk size, the nonce prefix and the salt, and ALL FORTY
 *     EIGHT BYTES OF IT ARE THE AAD OF EVERY CHUNK. Edit the header to claim a
 *     weaker KDF and every chunk in the file stops verifying.
 *   - The per-chunk AAD carries the chunk's SEQUENCE and its FINAL FLAG, and
 *     the nonce is derived from the same sequence. Two chunks swapped are two
 *     chunks decrypted under the wrong nonce with the wrong AAD, so both fail.
 *   - A file that ends before the chunk carrying `final` is a file the reader
 *     REFUSES BY NAME rather than one it silently returns less of. Truncation
 *     is the corruption a checksum over each part cannot see, because every
 *     part that survived is intact.
 *
 * Dependency free on purpose, and free of anything that needs more than type
 * stripping, so `scripts/restore.mjs` imports it straight from Node the way
 * `scripts/compliance.mjs` imports `src/lib/compliance.ts`. THE RESTORE PATH
 * MUST NOT NEED THE APPLICATION: a machine whose app will not boot is exactly
 * the machine an archive is for.
 *
 * NOTHING HERE SPEAKS ENGLISH. Every failure is an `ArchiveError` carrying a
 * snake_case code and the numbers behind it; the sentence is chosen by the
 * catalogue in `src/lib/strings.ts` for a screen, and by the code table in
 * `scripts/restore.mjs` for a terminal. That is C6, and it is also what keeps
 * this file importable by both.
 */

/** Eight bytes at the head of every archive. Version 1 of the container. */
export const ARCHIVE_MAGIC = 'VERNIER1';

export const ARCHIVE_FORMAT_VERSION = 1;

/** AES-256-GCM. One value today, and a byte in the header so there can be two. */
export const CIPHER_AES_256_GCM = 1;

/** scrypt, from `node:crypto`. Argon2id is the password KDF; this key is 32 random bytes. */
export const KDF_SCRYPT = 1;

export const HEADER_BYTES = 48;
export const SALT_BYTES = 16;
export const NONCE_PREFIX_BYTES = 4;
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
/** `u32` length, then `u8` final flag. */
export const FRAME_HEADER_BYTES = 5;

/**
 * One mebibyte per chunk.
 *
 * Big enough that the per-chunk overhead is 21 bytes in a million, small enough
 * that a restore holds one chunk at a time and a corrupt archive names the
 * megabyte it went wrong in.
 */
export const DEFAULT_CHUNK_BYTES = 1024 * 1024;

/**
 * A ceiling on a length the file itself declares, checked before any allocation.
 *
 * A flipped byte in a frame header can turn a one megabyte chunk into a claim
 * of four gigabytes. Without this the reader would try to allocate it and die
 * with an out-of-memory error, which is a crash rather than a refusal: the
 * owner would learn that node ran out of heap and not that his archive is
 * damaged. Sixty-four megabytes is well past any chunk this writer produces.
 */
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

export type ScryptParams = { n: number; r: number; p: number };

/**
 * m=32 MiB, and the container is given 64 to work in.
 *
 * The archive key is derived from 32 random bytes out of the environment file,
 * not from a human password, so the KDF is here to bind the key to this
 * archive's salt rather than to make a guess expensive. These parameters cost
 * about a tenth of a second on this Mac, which is nothing once a day and
 * nothing again during a restore.
 */
export const SCRYPT_PARAMS: ScryptParams = { n: 32768, r: 8, p: 1 };

const SCRYPT_MAXMEM = 128 * SCRYPT_PARAMS.n * SCRYPT_PARAMS.r * 2;

export type ArchiveErrorCode =
  | 'archive_header_short'
  | 'archive_bad_magic'
  | 'archive_version_unsupported'
  | 'archive_cipher_unsupported'
  | 'archive_kdf_unsupported'
  | 'archive_chunk_size_invalid'
  | 'archive_frame_short'
  | 'archive_truncated'
  | 'archive_chunk_unauthenticated'
  | 'archive_trailing_bytes'
  | 'archive_secret_missing'
  | 'tar_header_short'
  | 'tar_checksum_mismatch'
  | 'tar_name_too_long'
  | 'tar_size_mismatch'
  | 'member_missing'
  | 'member_digest_mismatch';

/**
 * A failure with a name and its numbers, never a sentence.
 *
 * `message` is the code itself, so a stack trace that escapes into a log still
 * says which of the sixteen it was, and a caller that renders it renders a
 * token rather than English with no key behind it.
 */
export class ArchiveError extends Error {
  readonly code: ArchiveErrorCode;
  /** The chunk this went wrong at, counted from 0, where the failure has one. */
  readonly sequence: number | null;
  /** What the file claimed, where the failure is about a number the file carried. */
  readonly claimed: number | null;
  /** What was actually there. */
  readonly actual: number | null;
  /** The member name, for the two failures that are about one. */
  readonly member: string | null;

  constructor(
    code: ArchiveErrorCode,
    detail: {
      sequence?: number;
      claimed?: number;
      actual?: number;
      member?: string;
    } = {},
  ) {
    super(code);
    this.name = 'ArchiveError';
    this.code = code;
    this.sequence = detail.sequence ?? null;
    this.claimed = detail.claimed ?? null;
    this.actual = detail.actual ?? null;
    this.member = detail.member ?? null;
  }
}

export type ArchiveHeader = {
  formatVersion: number;
  cipher: number;
  kdf: number;
  scrypt: ScryptParams;
  chunkBytes: number;
  noncePrefix: Buffer;
  salt: Buffer;
  /** The forty eight bytes exactly as they sit on disk, which is the AAD. */
  bytes: Buffer;
};

function u8(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * The header, built once per archive.
 *
 * The salt and the nonce prefix are random per archive, so two archives written
 * under the same secret share neither a key nor a nonce space. That is what
 * makes a per-chunk counter safe as a nonce: the counter is unique inside an
 * archive by construction, and the prefix is what makes it unique between them.
 */
export function buildHeader(input: {
  salt?: Uint8Array;
  noncePrefix?: Uint8Array;
  chunkBytes?: number;
  scrypt?: ScryptParams;
}): ArchiveHeader {
  const salt = input.salt ?? randomBytes(SALT_BYTES);
  const noncePrefix = input.noncePrefix ?? randomBytes(NONCE_PREFIX_BYTES);
  const chunkBytes = input.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const scrypt = input.scrypt ?? SCRYPT_PARAMS;

  if (salt.length !== SALT_BYTES || noncePrefix.length !== NONCE_PREFIX_BYTES) {
    throw new ArchiveError('archive_header_short', { actual: salt.length });
  }
  if (!Number.isInteger(chunkBytes) || chunkBytes < 1024 || chunkBytes > MAX_CHUNK_BYTES) {
    throw new ArchiveError('archive_chunk_size_invalid', { claimed: chunkBytes });
  }

  const bytes = Buffer.alloc(HEADER_BYTES);
  bytes.write(ARCHIVE_MAGIC, 0, 'ascii');
  bytes.writeUInt8(ARCHIVE_FORMAT_VERSION, 8);
  bytes.writeUInt8(CIPHER_AES_256_GCM, 9);
  bytes.writeUInt8(KDF_SCRYPT, 10);
  bytes.writeUInt8(0, 11);
  bytes.writeUInt32BE(scrypt.n, 12);
  bytes.writeUInt32BE(scrypt.r, 16);
  bytes.writeUInt32BE(scrypt.p, 20);
  bytes.writeUInt32BE(chunkBytes, 24);
  u8(noncePrefix).copy(bytes, 28);
  u8(salt).copy(bytes, 32);

  return {
    formatVersion: ARCHIVE_FORMAT_VERSION,
    cipher: CIPHER_AES_256_GCM,
    kdf: KDF_SCRYPT,
    scrypt,
    chunkBytes,
    noncePrefix: u8(noncePrefix),
    salt: u8(salt),
    bytes,
  };
}

/**
 * The header read back, refusing everything it does not understand BY NAME.
 *
 * A reader that accepts an unknown version and carries on is a reader that will
 * one day decrypt half of a format it does not know and hand back plausible
 * rubbish. Four separate refusals, four separate codes.
 */
export function readHeader(bytes: Uint8Array): ArchiveHeader {
  if (bytes.length < HEADER_BYTES) {
    throw new ArchiveError('archive_header_short', {
      claimed: HEADER_BYTES,
      actual: bytes.length,
    });
  }
  const head = u8(bytes.subarray(0, HEADER_BYTES));
  if (head.subarray(0, 8).toString('ascii') !== ARCHIVE_MAGIC) {
    throw new ArchiveError('archive_bad_magic');
  }
  const formatVersion = head.readUInt8(8);
  if (formatVersion !== ARCHIVE_FORMAT_VERSION) {
    throw new ArchiveError('archive_version_unsupported', {
      claimed: formatVersion,
      actual: ARCHIVE_FORMAT_VERSION,
    });
  }
  const cipher = head.readUInt8(9);
  if (cipher !== CIPHER_AES_256_GCM) {
    throw new ArchiveError('archive_cipher_unsupported', { claimed: cipher });
  }
  const kdf = head.readUInt8(10);
  if (kdf !== KDF_SCRYPT) {
    throw new ArchiveError('archive_kdf_unsupported', { claimed: kdf });
  }
  const scrypt = {
    n: head.readUInt32BE(12),
    r: head.readUInt32BE(16),
    p: head.readUInt32BE(20),
  };
  const chunkBytes = head.readUInt32BE(24);
  if (chunkBytes < 1024 || chunkBytes > MAX_CHUNK_BYTES) {
    throw new ArchiveError('archive_chunk_size_invalid', { claimed: chunkBytes });
  }
  return {
    formatVersion,
    cipher,
    kdf,
    scrypt,
    chunkBytes,
    noncePrefix: head.subarray(28, 32),
    salt: head.subarray(32, 48),
    bytes: head,
  };
}

/** The 32-byte content key, bound to this archive's salt and its parameters. */
export function deriveArchiveKey(secret: string | Uint8Array, header: ArchiveHeader): Buffer {
  if (typeof secret === 'string' ? secret.trim() === '' : secret.length === 0) {
    throw new ArchiveError('archive_secret_missing');
  }
  const material = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : u8(secret);
  return scryptSync(material, header.salt, 32, {
    N: header.scrypt.n,
    r: header.scrypt.r,
    p: header.scrypt.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

/** prefix ‖ sequence, big endian. Unique inside an archive by construction. */
export function chunkNonce(header: ArchiveHeader, sequence: number): Buffer {
  const nonce = Buffer.alloc(NONCE_BYTES);
  header.noncePrefix.copy(nonce, 0);
  nonce.writeBigUInt64BE(BigInt(sequence), NONCE_PREFIX_BYTES);
  return nonce;
}

/**
 * The whole header, then the sequence, then the final flag.
 *
 * Every one of those is a thing an attacker with the file would want to change
 * and cannot: the header because the parameters live in it, the sequence
 * because order is meaning, the flag because it is the only thing that says the
 * archive is complete.
 */
export function chunkAad(header: ArchiveHeader, sequence: number, final: boolean): Buffer {
  const aad = Buffer.alloc(HEADER_BYTES + 5);
  header.bytes.copy(aad, 0);
  aad.writeUInt32BE(sequence, HEADER_BYTES);
  aad.writeUInt8(final ? 1 : 0, HEADER_BYTES + 4);
  return aad;
}

export type Chunked = AsyncIterable<Uint8Array> | Iterable<Uint8Array>;

/** Re-cuts any stream into pieces of exactly `size`, with a shorter last one. */
export async function* regroup(source: Chunked, size: number): AsyncGenerator<Buffer> {
  let held: Buffer[] = [];
  let heldBytes = 0;
  for await (const piece of source as AsyncIterable<Uint8Array>) {
    held.push(u8(piece));
    heldBytes += piece.length;
    while (heldBytes >= size) {
      const joined = Buffer.concat(held, heldBytes);
      yield joined.subarray(0, size);
      const rest = joined.subarray(size);
      held = rest.length > 0 ? [rest] : [];
      heldBytes = rest.length;
    }
  }
  if (heldBytes > 0) yield Buffer.concat(held, heldBytes);
}

/**
 * Encrypts a stream into the framed container.
 *
 * The final flag is the reason this holds one chunk back: a writer cannot know
 * a chunk is the last one until the source says it is done, and the flag has to
 * be inside the AAD of the chunk it describes. An empty source still produces
 * one chunk, empty and final, so an archive is never zero chunks long and the
 * reader never has to treat "nothing at all" as a valid ending.
 */
export async function* encryptArchive(
  secret: string | Uint8Array,
  source: Chunked,
  options: { header?: ArchiveHeader; chunkBytes?: number } = {},
): AsyncGenerator<Buffer> {
  const header = options.header ?? buildHeader({ chunkBytes: options.chunkBytes });
  const key = deriveArchiveKey(secret, header);
  yield header.bytes;

  let sequence = 0;
  let pending: Buffer | null = null;

  const emit = (plain: Buffer, final: boolean): Buffer => {
    const cipher = createCipheriv('aes-256-gcm', key, chunkNonce(header, sequence));
    cipher.setAAD(chunkAad(header, sequence, final));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    const frame = Buffer.alloc(FRAME_HEADER_BYTES);
    frame.writeUInt32BE(body.length, 0);
    frame.writeUInt8(final ? 1 : 0, 4);
    sequence += 1;
    return Buffer.concat([frame, body, tag]);
  };

  for await (const piece of regroup(source, header.chunkBytes)) {
    if (pending !== null) yield emit(pending, false);
    pending = piece;
  }
  yield emit(pending ?? Buffer.alloc(0), true);
}

export type ArchiveReport = {
  chunks: number;
  /** Plaintext bytes, which is what the manifest's sizes are about. */
  plainBytes: number;
  header: ArchiveHeader;
};

/**
 * Decrypts and authenticates, yielding plaintext only after its chunk's tag has
 * been checked.
 *
 * Nothing is yielded optimistically. A caller writing this to a file writes
 * only bytes GCM has already vouched for, so a truncated archive leaves a short
 * file AND a thrown error rather than a short file and an exit code of zero.
 */
export async function* decryptArchive(
  secret: string | Uint8Array,
  source: Chunked,
  onReport?: (report: ArchiveReport) => void,
): AsyncGenerator<Buffer> {
  let buffer = Buffer.alloc(0);
  let header: ArchiveHeader | null = null;
  let key: Buffer | null = null;
  let sequence = 0;
  let plainBytes = 0;
  let finished = false;

  const iterator = (source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]
    ? (source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]()
    : (async function* () {
        for (const piece of source as Iterable<Uint8Array>) yield piece;
      })();

  const pull = async (): Promise<boolean> => {
    const next = await iterator.next();
    if (next.done) return false;
    buffer = Buffer.concat([buffer, u8(next.value)]);
    return true;
  };

  while (buffer.length < HEADER_BYTES) {
    if (!(await pull())) {
      throw new ArchiveError('archive_header_short', {
        claimed: HEADER_BYTES,
        actual: buffer.length,
      });
    }
  }
  header = readHeader(buffer);
  key = deriveArchiveKey(secret, header);
  buffer = buffer.subarray(HEADER_BYTES);

  for (;;) {
    while (buffer.length < FRAME_HEADER_BYTES) {
      if (await pull()) continue;
      if (buffer.length === 0) {
        // A clean end at a frame boundary, with no chunk having claimed to be
        // the last one. This is what a `head -c` truncation looks like when the
        // cut lands between frames, and it is the case a per-part checksum
        // cannot see: every frame still present verifies.
        throw new ArchiveError('archive_truncated', { sequence, actual: sequence });
      }
      throw new ArchiveError('archive_frame_short', {
        sequence,
        claimed: FRAME_HEADER_BYTES,
        actual: buffer.length,
      });
    }
    const length = buffer.readUInt32BE(0);
    const final = buffer.readUInt8(4) === 1;
    if (length > MAX_CHUNK_BYTES) {
      throw new ArchiveError('archive_chunk_size_invalid', { sequence, claimed: length });
    }
    const need = FRAME_HEADER_BYTES + length + TAG_BYTES;
    while (buffer.length < need) {
      if (await pull()) continue;
      throw new ArchiveError('archive_truncated', {
        sequence,
        claimed: need,
        actual: buffer.length,
      });
    }

    const body = buffer.subarray(FRAME_HEADER_BYTES, FRAME_HEADER_BYTES + length);
    const tag = buffer.subarray(FRAME_HEADER_BYTES + length, need);
    const decipher = createDecipheriv('aes-256-gcm', key, chunkNonce(header, sequence));
    decipher.setAAD(chunkAad(header, sequence, final));
    decipher.setAuthTag(tag);
    let plain: Buffer;
    try {
      plain = Buffer.concat([decipher.update(body), decipher.final()]);
    } catch {
      // The one place three different attacks arrive together: a flipped byte
      // in the body, a chunk moved to a position it was not written at, and an
      // edited header. GCM cannot tell them apart and neither can this, so the
      // code names the chunk and says the tag did not hold.
      throw new ArchiveError('archive_chunk_unauthenticated', { sequence });
    }

    buffer = buffer.subarray(need);
    plainBytes += plain.length;
    sequence += 1;
    if (plain.length > 0) yield plain;

    if (final) {
      finished = true;
      break;
    }
  }

  if (finished) {
    while (buffer.length === 0) {
      if (!(await pull())) break;
    }
    if (buffer.length > 0) {
      throw new ArchiveError('archive_trailing_bytes', { actual: buffer.length });
    }
  }

  onReport?.({ chunks: sequence, plainBytes, header });
}

/** Reads an archive for its integrity alone, keeping none of the plaintext. */
export async function verifyArchive(
  secret: string | Uint8Array,
  source: Chunked,
): Promise<ArchiveReport> {
  let report: ArchiveReport | null = null;
  for await (const _piece of decryptArchive(secret, source, (value) => {
    report = value;
  })) {
    // Discarded on purpose: verification is about the tags, not the bytes.
    void _piece;
  }
  // `decryptArchive` reports through its callback after the last chunk, so a
  // missing report here would mean it returned without finishing, which it
  // cannot do without throwing first.
  if (report === null) throw new ArchiveError('archive_truncated', { actual: 0 });
  return report;
}

/**
 * ---------------------------------------------------------------------------
 * The container inside the encryption: ustar, written by hand.
 * ---------------------------------------------------------------------------
 *
 * A real tar, not a private format, and that is the point. Once the archive is
 * decrypted the owner has a file `tar -tvf` lists and `tar -xf` unpacks, on any
 * machine, with no copy of this repository and no copy of Node. The encryption
 * is ours because it has to be; the container underneath is the oldest and most
 * boring format there is.
 */
export const TAR_BLOCK = 512;

export type TarEntry = {
  name: string;
  size: number;
  /** Seconds since the epoch. Fixed by the caller so an archive is reproducible. */
  modified?: number;
  body: Uint8Array | AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
};

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

/** The ustar header block, with the checksum computed the way the format says. */
export function tarHeader(name: string, size: number, modified: number): Buffer {
  const bytes = Buffer.byteLength(name, 'utf8');
  if (bytes > 99) throw new ArchiveError('tar_name_too_long', { member: name, actual: bytes });
  const block = Buffer.alloc(TAR_BLOCK, 0);
  block.write(name, 0, 100, 'utf8');
  block.write(octal(0o644, 8), 100, 8, 'ascii');
  block.write(octal(0, 8), 108, 8, 'ascii');
  block.write(octal(0, 8), 116, 8, 'ascii');
  block.write(octal(size, 12), 124, 12, 'ascii');
  block.write(octal(Math.floor(modified), 12), 136, 12, 'ascii');
  // The checksum field is read as eight spaces while the checksum is computed.
  block.write('        ', 148, 8, 'ascii');
  block.write('0', 156, 1, 'ascii');
  block.write('ustar\0', 257, 6, 'ascii');
  block.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return block;
}

function padding(size: number): number {
  const remainder = size % TAR_BLOCK;
  return remainder === 0 ? 0 : TAR_BLOCK - remainder;
}

/** How many bytes the tar of these entries will be, before any of it is built. */
export function tarSize(entries: Array<{ size: number }>): number {
  let total = 0;
  for (const entry of entries) total += TAR_BLOCK + entry.size + padding(entry.size);
  return total + TAR_BLOCK * 2;
}

/**
 * The tar, as a stream.
 *
 * Each entry declares its size before its body, because ustar puts the size in
 * the header, which is why every member of an archive is written to a temporary
 * file and measured first. A member whose body turns out to be a different
 * length than it declared is refused here rather than written: a tar with a
 * wrong size in a header is a tar that unpacks into rubbish for every member
 * after it.
 */
export async function* tarEntries(entries: TarEntry[]): AsyncGenerator<Buffer> {
  for (const entry of entries) {
    const modified = entry.modified ?? 0;
    yield tarHeader(entry.name, entry.size, modified);
    let written = 0;
    if (entry.body instanceof Uint8Array) {
      written = entry.body.length;
      if (written > 0) yield u8(entry.body);
    } else {
      for await (const piece of entry.body as AsyncIterable<Uint8Array>) {
        written += piece.length;
        if (piece.length > 0) yield u8(piece);
      }
    }
    if (written !== entry.size) {
      throw new ArchiveError('tar_size_mismatch', {
        member: entry.name,
        claimed: entry.size,
        actual: written,
      });
    }
    const pad = padding(written);
    if (pad > 0) yield Buffer.alloc(pad, 0);
  }
  yield Buffer.alloc(TAR_BLOCK * 2, 0);
}

export type TarMember = { name: string; size: number; body: Buffer };

/** Reads a whole tar held in memory. Used by the restore and by the tests. */
export function readTar(bytes: Uint8Array): TarMember[] {
  const buffer = u8(bytes);
  const members: TarMember[] = [];
  let offset = 0;
  while (offset + TAR_BLOCK <= buffer.length) {
    const block = buffer.subarray(offset, offset + TAR_BLOCK);
    if (block.every((byte) => byte === 0)) break;
    const declared = block.subarray(148, 156).toString('ascii');
    const zeroed = Buffer.from(block);
    zeroed.write('        ', 148, 8, 'ascii');
    let sum = 0;
    for (const byte of zeroed) sum += byte;
    const claimed = Number.parseInt(declared.replace(/[\0 ]+$/, '').trim(), 8);
    if (!Number.isFinite(claimed) || claimed !== sum) {
      throw new ArchiveError('tar_checksum_mismatch', { claimed, actual: sum });
    }
    const name = block.subarray(0, 100).toString('utf8').replace(/\0+$/, '');
    const size = Number.parseInt(
      block.subarray(124, 136).toString('ascii').replace(/[\0 ]+$/, '').trim() || '0',
      8,
    );
    const start = offset + TAR_BLOCK;
    if (start + size > buffer.length) {
      throw new ArchiveError('tar_header_short', {
        member: name,
        claimed: size,
        actual: buffer.length - start,
      });
    }
    members.push({ name, size, body: buffer.subarray(start, start + size) });
    offset = start + size + padding(size);
  }
  return members;
}

export type TarScanEntry = { name: string; size: number; sha256: string };

/**
 * Walks a tar as it streams past, hashing each member without holding any of it.
 *
 * `readTar` needs the whole archive in memory, which is right for a manifest and
 * wrong for the verification pass: an archive holding six months of meal photos
 * is the one that must not be read into a Buffer to prove it is intact. This is
 * the same format read as a state machine, so the check that runs after every
 * single archive costs one chunk of memory whatever the archive weighs.
 */
export async function* scanTar(source: Chunked): AsyncGenerator<TarScanEntry> {
  let held: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let entry: { name: string; size: number; hash: ReturnType<typeof createHash>; read: number } | null =
    null;
  let skip = 0;
  let done = false;

  for await (const piece of source as AsyncIterable<Uint8Array>) {
    held = held.length === 0 ? u8(piece) : Buffer.concat([held, u8(piece)]);
    for (;;) {
      if (done) break;
      if (skip > 0) {
        const take = Math.min(skip, held.length);
        held = held.subarray(take);
        skip -= take;
        if (skip > 0) break;
      }
      if (entry) {
        const want = entry.size - entry.read;
        const take = Math.min(want, held.length);
        if (take > 0) {
          entry.hash.update(held.subarray(0, take));
          entry.read += take;
          held = held.subarray(take);
        }
        if (entry.read < entry.size) break;
        yield { name: entry.name, size: entry.size, sha256: entry.hash.digest('hex') };
        skip = padding(entry.size);
        entry = null;
        continue;
      }
      if (held.length < TAR_BLOCK) break;
      const block = held.subarray(0, TAR_BLOCK);
      held = held.subarray(TAR_BLOCK);
      if (block.every((byte) => byte === 0)) {
        done = true;
        break;
      }
      const name = block.subarray(0, 100).toString('utf8').replace(/\0+$/, '');
      const size = Number.parseInt(
        block.subarray(124, 136).toString('ascii').replace(/[\0 ]+$/, '').trim() || '0',
        8,
      );
      if (!Number.isFinite(size) || size < 0) {
        throw new ArchiveError('tar_header_short', { member: name, claimed: size });
      }
      entry = { name, size, hash: createHash('sha256'), read: 0 };
    }
  }

  if (entry !== null) {
    throw new ArchiveError('tar_size_mismatch', {
      member: entry.name,
      claimed: entry.size,
      actual: entry.read,
    });
  }
}

/** Everything a stream produced, as one buffer. For tests and small members. */
export async function collect(source: Chunked): Promise<Buffer> {
  const pieces: Buffer[] = [];
  let total = 0;
  for await (const piece of source as AsyncIterable<Uint8Array>) {
    pieces.push(u8(piece));
    total += piece.length;
  }
  return Buffer.concat(pieces, total);
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(u8(bytes)).digest('hex');
}

/** Constant time, because a digest comparison is a comparison of secrets' shadows. */
export function digestsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// The three deliberate corruptions F125 is proven by.
// ---------------------------------------------------------------------------

/**
 * WHY THIS LIVES HERE AND NOT IN scripts/restore.mjs. It lived in the script,
 * as twenty lines carrying a rule that reordering two chunks needs four of
 * them. A swap needs two. Every archive the scratch instance writes is two or
 * three chunks long, so `corrupt --mode reorder` exited 2 on every run and F125
 * failed at the line that MAKES the damaged copy, before one verification had
 * happened. The arithmetic that decides where to cut, what to swap and which
 * byte to flip is the thing that has to be right, so it sits beside the reader
 * whose codes it names, where tests/unit/archive-damage.test.ts drives it over
 * archives of one, two and many chunks with no docker and no database.
 *
 * NOTHING BELOW ENCRYPTS. It reads frame boundaries out of a sealed archive and
 * rearranges bytes, deliberately: damage that went back through the writer
 * would be damage the writer authenticated, and an authenticated corruption is
 * not a corruption.
 */

export const DAMAGE_MODES = ['truncate', 'reorder', 'flip'] as const;

export type DamageMode = (typeof DAMAGE_MODES)[number];

export function isDamageMode(value: string): value is DamageMode {
  return (DAMAGE_MODES as readonly string[]).includes(value);
}

/** One chunk's place in a file: where its header starts and where its tag ends. */
export type ArchiveFrame = {
  sequence: number;
  /** The first byte of the frame header. */
  start: number;
  /** The first byte of the ciphertext. */
  bodyStart: number;
  /** One past the last byte of the authentication tag. */
  end: number;
  /** Ciphertext length, tag excluded. */
  length: number;
  final: boolean;
};

/**
 * Every frame in a whole archive, walked the way the reader walks it.
 *
 * It refuses with the reader's own codes rather than returning a short list.
 * A partial walk is how a damaged file gets damaged twice: a cut made at a
 * boundary this guessed wrong would fail for a reason nobody chose, and F125
 * is about failing for the reason the file was broken in.
 */
export function readFrames(archive: Uint8Array): ArchiveFrame[] {
  const bytes = u8(archive);
  if (bytes.length < HEADER_BYTES) {
    throw new ArchiveError('archive_header_short', { claimed: HEADER_BYTES, actual: bytes.length });
  }

  const frames: ArchiveFrame[] = [];
  let offset = HEADER_BYTES;
  let sequence = 0;
  for (;;) {
    if (offset + FRAME_HEADER_BYTES > bytes.length) {
      throw new ArchiveError('archive_frame_short', {
        sequence,
        claimed: FRAME_HEADER_BYTES,
        actual: bytes.length - offset,
      });
    }
    const length = bytes.readUInt32BE(offset);
    const final = bytes.readUInt8(offset + FRAME_HEADER_BYTES - 1) === 1;
    if (length > MAX_CHUNK_BYTES) {
      throw new ArchiveError('archive_chunk_size_invalid', { sequence, claimed: length });
    }
    const end = offset + FRAME_HEADER_BYTES + length + TAG_BYTES;
    if (end > bytes.length) {
      throw new ArchiveError('archive_truncated', { sequence, claimed: end, actual: bytes.length });
    }
    frames.push({ sequence, start: offset, bodyStart: offset + FRAME_HEADER_BYTES, end, length, final });
    sequence += 1;
    if (final) break;
    offset = end;
  }
  return frames;
}

export type Damage = {
  ok: true;
  mode: DamageMode;
  bytes: Buffer;
  /** How many chunks the whole archive held, which is what makes a swap possible. */
  frames: number;
  /** The byte offset the damage was done at, for the record the script prints. */
  at: number;
  /** The code the reader must refuse these bytes with. */
  expect: 'archive_truncated' | 'archive_chunk_unauthenticated';
};

/** The one case that cannot be produced: two chunks swapped in a one-chunk archive. */
export type DamageRefusal = { ok: false; reason: 'too_few_chunks'; frames: number; needs: number };

/**
 * A deliberately damaged copy of a whole archive.
 *
 * TRUNCATE cuts at the start of the last frame when there is more than one, so
 * every frame still in the file authenticates and only the missing final flag
 * says the file is incomplete. That is the cut a per-part checksum cannot see.
 * A one-chunk archive has no such boundary, so the cut lands inside its only
 * frame, which then announces a length that never arrives.
 *
 * REORDER swaps the first two frames whole, headers and tags with them. The
 * nonce and the AAD both carry the sequence, so a chunk read at a position it
 * was not written at fails its tag wherever it lands, and the two frames need
 * not be the same length because the file is rebuilt rather than overwritten in
 * place. That length assumption is what limited this to archives of four
 * chunks or more.
 *
 * FLIP turns one bit in the LAST frame, in its ciphertext where it has any and
 * in its tag where it does not. The last rather than the first because a reader
 * that stopped authenticating once it had enough bytes to answer would still
 * pass a flip in chunk 0.
 */
export function damageArchive(archive: Uint8Array, mode: DamageMode): Damage | DamageRefusal {
  const whole = u8(archive);
  const frames = readFrames(whole);
  const last = frames[frames.length - 1];

  if (mode === 'truncate') {
    const at = frames.length > 1 ? last.start : last.end - TAG_BYTES;
    return {
      ok: true,
      mode,
      bytes: Buffer.from(whole.subarray(0, at)),
      frames: frames.length,
      at,
      expect: 'archive_truncated',
    };
  }

  if (mode === 'reorder') {
    if (frames.length < 2) {
      return { ok: false, reason: 'too_few_chunks', frames: frames.length, needs: 2 };
    }
    const [first, second] = frames;
    return {
      ok: true,
      mode,
      bytes: Buffer.concat([
        whole.subarray(0, first.start),
        whole.subarray(second.start, second.end),
        whole.subarray(first.start, first.end),
        whole.subarray(second.end),
      ]),
      frames: frames.length,
      at: first.start,
      expect: 'archive_chunk_unauthenticated',
    };
  }

  const at = last.length > 0 ? last.bodyStart + Math.floor(last.length / 2) : last.end - 1;
  const bytes = Buffer.from(whole);
  bytes[at] ^= 0x40;
  return { ok: true, mode, bytes, frames: frames.length, at, expect: 'archive_chunk_unauthenticated' };
}
