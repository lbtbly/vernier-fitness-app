/**
 * The offline outbox.
 *
 * One rule holds the whole design up: **the user interface never branches on
 * online versus offline.** Every mutating action does the same three things in
 * the same order, always. Apply it to the local model, put it in the outbox,
 * kick the flusher. That is what makes the offline path trustworthy instead of
 * a second, less-tested mode that only runs in a basement gym where nobody is
 * watching. There is no `if (navigator.onLine)` in this file and there must
 * never be one in a component either.
 *
 * iOS gives no Background Sync, no Periodic Sync and no Background Fetch
 * (.forge/research/ios-pwa.md section 3), so the replay is client driven on the
 * six triggers named there, the sixth of which is a service worker woken by a
 * push. The entry's key is a client UUID that is also its `Idempotency-Key` and
 * also the row id the server writes, so a request that succeeded and lost its
 * response on the way home replays and applies exactly once.
 *
 * `navigator.onLine` is worse than useless against a Tailscale origin: the
 * phone can be on cellular, report online, and reach nothing. Reachability is
 * therefore a probe of `/healthz`, and it feeds the indicator only. It never
 * decides whether a write happens.
 */

import { strings } from '@/lib/strings';

const DB_NAME = 'vernier';
const DB_VERSION = 1;
const STORE = 'outbox';
/**
 * A second store, holding one thing: the anti-forgery token this browser
 * currently has. It is written on every page load and read at send time rather
 * than at enqueue time, so an entry that sat in the queue across a session
 * rotation still goes out with a token the server accepts. The session cookie
 * is HttpOnly and no script can read it, which is why the token has to be
 * handed down from the server render and kept here.
 */
const META = 'meta';
const CSRF_KEY = 'csrf';

export type OutboxEntry = {
  /** The client UUID. Idempotency-Key, row id, and the key of this record. */
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  /** Set when the server refused permanently. It stays visible rather than vanishing. */
  parked: boolean;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(strings.api.storage.outboxOpen));
  });
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = run(tx.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error(strings.api.storage.outboxWrite));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Called on every page load with the token the server rendered. */
export async function rememberCsrfToken(token: string): Promise<void> {
  if (!token) return;
  await transact('readwrite', (store) => store.put(token, CSRF_KEY), META);
}

async function currentCsrfToken(): Promise<string> {
  try {
    return (await transact<string>('readonly', (store) => store.get(CSRF_KEY) as IDBRequest<string>, META)) ?? '';
  } catch {
    return '';
  }
}

export async function allEntries(): Promise<OutboxEntry[]> {
  const rows = await transact<OutboxEntry[]>('readonly', (store) => store.getAll() as IDBRequest<OutboxEntry[]>);
  return rows.sort((left, right) => left.createdAt - right.createdAt);
}

export async function depth(): Promise<number> {
  const rows = await allEntries();
  return rows.filter((entry) => !entry.parked).length;
}

export async function enqueue(entry: {
  id: string;
  url: string;
  body: unknown;
  headers?: Record<string, string>;
}): Promise<OutboxEntry> {
  const record: OutboxEntry = {
    id: entry.id,
    url: entry.url,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(entry.headers ?? {}) },
    body: JSON.stringify(entry.body),
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    parked: false,
  };
  await transact('readwrite', (store) => store.put(record));
  notify();
  return record;
}

async function remove(id: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(id));
}

/**
 * The entry currently being sent, if any.
 *
 * Undo is only honest while the write is still sitting here, and "still
 * sitting here" has to exclude the entry whose request is in the air right
 * now: deleting that one would remove the queue record while the Mac mini goes
 * on to store the row, and the screen would claim an undo that did not happen.
 * The flusher runs in this page, so one variable is the whole answer.
 */
let inFlight: string | null = null;

/** Is this write still in the queue, and therefore still genuinely reversible. */
export async function pending(id: string): Promise<boolean> {
  if (inFlight === id) return false;
  return stillQueued(id);
}

/**
 * Is this write still on this phone, whether or not a send is in the air.
 *
 * A different question from `pending`, and the difference is what the screen
 * says versus what Undo may do. `pending` is about REVERSIBILITY and excludes
 * the entry whose request is in flight, because removing that one could delete
 * the queue record while the Mac mini goes on to store the row. This one is
 * about WHERE THE WRITE IS, and a request in the air has not landed.
 *
 * They were the same function for a while and the row read `Stored` the moment
 * the flusher picked the entry up, for as long as the send took: milliseconds on
 * a good tailnet, and up to the ten-second timeout on a captive-portal wifi,
 * which is exactly the case the queue exists for. Measured on the scratch
 * instance with the origin taken away: the row said Stored beside an offline
 * line reading "1 entry saved on this phone", which is the app contradicting
 * itself about the owner's own data in two places on one screen.
 */
export async function stillQueued(id: string): Promise<boolean> {
  const rows = await allEntries();
  return rows.some((entry) => entry.id === id && !entry.parked);
}

/**
 * Drop a queued write, and say whether there was one to drop.
 *
 * This is the only reversal in the product that removes rather than corrects,
 * and it is only available for as long as the entry has not left this phone.
 * Once the Mac mini has it, `measurement` refuses DELETE and undo becomes a
 * correction, which is a different act with a different word on the button.
 */
export async function discard(id: string): Promise<boolean> {
  // A send that is in the air is not a send that landed, and Undo waits for it
  // to settle rather than answering while it cannot know. The wait is bounded by
  // the flusher's own ten-second timeout on the request: when it clears, the
  // entry is either gone, because it really did upload, or back in the queue,
  // because it did not, and the answer is the truth in both cases. Refusing
  // during the flight reported "it had already uploaded" for writes that were
  // still sitting on the phone and came back to the queue a second later.
  for (let waited = 0; inFlight === id && waited < 11_000; waited += 100) {
    await new Promise((settle) => setTimeout(settle, 100));
  }
  if (!(await pending(id))) return false;
  await remove(id);
  notify();
  return true;
}

async function save(entry: OutboxEntry): Promise<void> {
  await transact('readwrite', (store) => store.put(entry));
}

/** Subscribers, so the queue count on screen is the queue and not a guess. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Statuses the server will never accept, however many times it is asked. */
const PARK_ON = new Set([400, 404, 405, 410, 413, 422]);

let flushing = false;

export type FlushReport = { sent: number; remaining: number; lastError: string | null };

/**
 * Drains the queue oldest first, one at a time, and stops the whole run on the
 * first failure. Parallel replay reorders writes, and on a log of what happened
 * to a body, order is meaning.
 */
export async function flushOutbox(options: { force?: boolean } = {}): Promise<FlushReport> {
  if (flushing) return { sent: 0, remaining: await depth(), lastError: null };
  flushing = true;
  let sent = 0;
  let lastError: string | null = null;
  // A trigger is new information. The phone came back to the front, or the
  // network came up, or a request of the app's own just succeeded, and holding
  // the owner's waist measurement back for four more minutes of backoff because
  // of failures that happened in a lift is the wrong answer. Backoff governs
  // the poll and the retry loop; an explicit trigger goes now.
  let force = options.force === true;
  try {
    for (;;) {
      const queue = await allEntries();
      const entry = force
        ? queue.find((row) => !row.parked)
        : queue.find((row) => !row.parked && row.nextAttemptAt <= Date.now());
      force = false;
      if (!entry) break;

      try {
        inFlight = entry.id;
        const response = await fetch(entry.url, {
          method: entry.method,
          headers: {
            ...entry.headers,
            'Idempotency-Key': entry.id,
            'x-vernier-csrf': await currentCsrfToken(),
          },
          body: entry.body,
          signal: AbortSignal.timeout(10_000),
        });

        // 409 is the server saying it already has this key. That is applied,
        // not failed, and the entry leaves the queue.
        if (response.ok || response.status === 409) {
          await remove(entry.id);
          sent += 1;
          notify();
          continue;
        }

        // 401 and 403 mean the session or the token went stale while this sat
        // in the queue. That is not a bad write and the owner's data is not
        // thrown away for it: back off and go again after the next sign-in.
        // Parking is for a request the server will never accept.
        if (PARK_ON.has(response.status)) {
          entry.parked = true;
          entry.lastError = strings.todayLog.uploadStatus(response.status);
          lastError = entry.lastError;
          await save(entry);
          notify();
          continue;
        }

        throw new Error(strings.todayLog.uploadStatus(response.status));
      } catch (error) {
        entry.attempts += 1;
        const base = Math.min(2 ** entry.attempts * 1000, 5 * 60_000);
        entry.nextAttemptAt = Date.now() + base * (0.7 + Math.random() * 0.6);
        entry.lastError = error instanceof Error ? error.message : String(error);
        lastError = entry.lastError;
        await save(entry);
        notify();
        break;
      } finally {
        inFlight = null;
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, remaining: await depth(), lastError };
}

/**
 * Can this device reach the Mac mini right now. Answers the indicator and
 * nothing else: no write waits on it, no branch depends on it.
 */
export async function originReachable(): Promise<boolean> {
  try {
    const response = await fetch('/healthz', {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

let started = false;

/**
 * The six triggers from .forge/research/ios-pwa.md section 3, plus the poll it
 * names. No single one is reliable on iOS, which is why there are six:
 *
 * 1. `online`
 * 2. `visibilitychange` to visible, the main one, since iOS suspends and
 *    resumes constantly
 * 3. `pageshow`, which covers a back-forward cache restore
 * 4. app boot, which is this call
 * 5. after any successful request the app made, because connectivity just
 *    proved itself
 * 6. the service worker's `push` handler, in public/sw.js, the only background
 *    execution iOS offers
 */
export function startFlushTriggers(): () => void {
  if (started) return () => undefined;
  started = true;

  const kick = () => {
    void flushOutbox({ force: true });
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') kick();
  };

  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', kick);

  // Trigger 4: boot.
  kick();

  // The poll, 25 s, and only while the app is in front with something queued.
  const timer = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    void depth().then((n) => {
      if (n > 0) kick();
    });
  }, 25_000);

  return () => {
    window.removeEventListener('online', kick);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', kick);
    window.clearInterval(timer);
    started = false;
  };
}

/** Trigger 5. Called by the app after any request of its own that succeeded. */
export function connectivityProved(): void {
  void flushOutbox({ force: true });
}
