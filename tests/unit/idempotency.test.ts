import { describe, expect, it } from 'vitest';
import { memoryStore, once } from '@/db/idempotency';

/**
 * F24, the half that is a rule rather than a round trip.
 *
 * The outbox retries and the retry is not optional, so the only thing standing
 * between a queue that works offline and a log that double-counts is the order
 * of six lines: claim the key, run, store the answer. This grades those six
 * lines with no Postgres in the way. The e2e suite grades the same claim
 * against the real table.
 */
describe('one idempotency key applies once', () => {
  it('runs the write once however many times the same key arrives', async () => {
    const store = memoryStore();
    let runs = 0;
    const write = async () => {
      runs += 1;
      return {
        outcome: 'applied' as const,
        handled: { status: 201, body: { saved: [{ id: 'm1' }] } as Record<string, unknown> },
      };
    };

    const first = await once('key-1', '/api/log', write, store);
    const second = await once('key-1', '/api/log', write, store);
    const third = await once('key-1', '/api/log', write, store);

    expect(runs).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(third.replayed).toBe(true);
  });

  it('gives a replay the original answer back, byte for byte', async () => {
    const store = memoryStore();
    const write = async () => ({
      outcome: 'applied' as const,
      handled: {
        status: 201,
        body: { saved: [{ id: 'm1', metric: 'waist' }] } as Record<string, unknown>,
      },
    });

    const first = await once('key-2', '/api/log', write, store);
    const replay = await once('key-2', '/api/log', write, store);

    expect(replay.handled.status).toBe(first.handled.status);
    expect(JSON.stringify(replay.handled.body)).toBe(JSON.stringify(first.handled.body));
  });

  it('logs one applied and one replayed, which is what the request log is for', async () => {
    const store = memoryStore();
    const write = async () => ({
      outcome: 'applied' as const,
      handled: { status: 201, body: {} as Record<string, unknown> },
    });

    await once('key-3', '/api/log', write, store);
    await once('key-3', '/api/log', write, store);

    expect(store.log.map((row) => row.outcome)).toEqual(['applied', 'replayed']);
    expect(store.replays.get('key-3')).toBe(1);
    expect(new Set(store.log.map((row) => row.key)).size).toBe(1);
  });

  it('answers 409 while the first arrival is still in flight, which the flusher reads as applied', async () => {
    const store = memoryStore();
    let release: () => void = () => undefined;
    const slow = async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        outcome: 'applied' as const,
        handled: { status: 201, body: {} as Record<string, unknown> },
      };
    };

    const inFlight = once('key-4', '/api/log', slow, store);
    // Arrives while the first is mid-write, which is exactly the race a retry
    // on a slow tailnet produces.
    const overlapping = await once('key-4', '/api/log', slow, store);
    expect(overlapping.handled.status).toBe(409);
    expect(overlapping.replayed).toBe(true);

    release();
    const settled = await inFlight;
    expect(settled.handled.status).toBe(201);
  });

  it('keeps two different keys apart', async () => {
    const store = memoryStore();
    let runs = 0;
    const write = async () => {
      runs += 1;
      return {
        outcome: 'applied' as const,
        handled: { status: 201, body: {} as Record<string, unknown> },
      };
    };

    await once('key-a', '/api/log', write, store);
    await once('key-b', '/api/log', write, store);
    expect(runs).toBe(2);
  });
});
