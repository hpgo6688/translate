import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { splitIntoBatches } from '@/core/orchestrator/batcher';
import { OrchestratorQueue } from '@/core/orchestrator/queue';
import { shouldRetryError, withProviderRetry } from '@/core/orchestrator/retry';
import { streamToTab } from '@/core/orchestrator/streamer';
import { TranslateProviderError } from '@/core/translators/base';
import { UsageMeter } from '@/core/usage/meter';

describe('orchestrator', () => {
  it('splits by batch thresholds', () => {
    const segments = Array.from({ length: 80 }, (_, i) => ({
      id: `s-${i}`,
      text: 'hello world',
    }));
    const batches = splitIntoBatches(segments);
    expect(batches.length).toBeGreaterThan(1);
    expect(Math.max(...batches.map((batch) => batch.length))).toBeLessThanOrEqual(50);
  });

  it('streams chunks regardless of order', async () => {
    const sent: Array<{ id: string; text: string; done: boolean }> = [];
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: {
        sendMessage: (_tabId: number, message: { payload: { id: string; text: string; done: boolean } }) => {
          sent.push(message.payload);
          return Promise.resolve();
        },
      },
    };

    async function* source() {
      await Promise.resolve();
      yield { id: '2', text: 'B', done: true };
      await Promise.resolve();
      yield { id: '1', text: 'A', done: true };
    }

    await streamToTab(1, source());
    expect(sent.map((item) => item.id)).toEqual(['2', '1']);
  });

  it('rejects when queue exceeds local limit', async () => {
    const queue = new OrchestratorQueue(1, 1, 10);
    const blocker = new Promise<void>(() => {});
    void queue.add(async () => blocker);
    await expect(queue.add(() => Promise.resolve('x'))).rejects.toThrow('RATE_LIMITED_LOCAL');
  });

  it('retries transient failures but not auth failures', async () => {
    let calls = 0;
    await expect(
      withProviderRetry(() => {
        calls += 1;
        if (calls < 3) {
          return Promise.reject(new Error('503'));
        }
        return Promise.resolve('ok');
      }),
    ).resolves.toBe('ok');
    expect(calls).toBe(3);
    expect(
      shouldRetryError(new TranslateProviderError('AUTH_FAILED', 'bad key')),
    ).toBe(false);
  });

  it('usage meter rolls over by month', async () => {
    const meter = new UsageMeter(`usage-test-${crypto.randomUUID()}`);
    await meter.increment({
      provider: 'google',
      charsSubmitted: 100,
      success: true,
      at: new Date('2026-04-30T12:00:00Z'),
    });
    const april = await meter.readCurrentMonth('google', new Date('2026-04-30T12:00:00Z'));
    const may = await meter.readCurrentMonth('google', new Date('2026-05-01T12:00:00Z'));
    expect(april.charsSubmitted).toBe(100);
    expect(may.charsSubmitted).toBe(0);
  });
});
