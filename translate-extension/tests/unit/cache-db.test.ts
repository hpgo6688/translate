import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CACHE_SCHEMA_VERSION,
  TranslationCacheDb,
  buildCacheKey,
  buildCacheKeyFromText,
} from '@/core/cache/db';

describe('translation cache db', () => {
  let db: TranslationCacheDb;

  beforeEach(async () => {
    db = new TranslationCacheDb(`test-cache-${crypto.randomUUID()}`);
    await db.open();
  });

  it('treats schema mismatch as miss', async () => {
    const key = 'google|en|zh-CN|mismatch';
    await db.paragraphs.add({
      key,
      translation: '译文',
      provider: 'google',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      createdAt: Date.now(),
      lastHitAt: Date.now(),
      hitCount: 0,
      schemaVersion: CACHE_SCHEMA_VERSION - 1,
    });

    const result = await db.lookup([key]);
    expect(result.get(key)).toBeNull();
  });

  it('hits with normalized key built from equivalent text', async () => {
    const key = await buildCacheKeyFromText({
      provider: 'google',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      text: ' Hello   world. ',
    });
    await db.put({
      key,
      translation: '你好，世界。',
      provider: 'google',
      sourceLang: 'en',
      targetLang: 'zh-CN',
    });

    const sameKey = await buildCacheKeyFromText({
      provider: 'google',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      text: 'Hello world.',
    });
    const result = await db.lookup([sameKey]);
    expect(result.get(sameKey)?.translation).toBe('你好，世界。');
  });

  it('uses a single transaction for bulk lookup', async () => {
    const keys = ['k1', 'k2', 'k3'];
    await db.putMany(
      keys.map((key) => ({
        key,
        translation: `${key}-t`,
        provider: 'google',
        sourceLang: 'en',
        targetLang: 'zh-CN',
      })),
    );

    const transactionSpy = vi.spyOn(db, 'transaction');
    await db.lookup(keys);
    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });

  it('evicts expired entries by ttl', async () => {
    const oldTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const key = buildCacheKey({
      provider: 'google',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      normalizedTextHash: 'old',
    });

    await db.put({
      key,
      translation: 'old translation',
      provider: 'google',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      createdAt: oldTimestamp,
      lastHitAt: oldTimestamp,
    });

    await db.runEvictionSweep({ ttlDays: 30, maxRecords: 10 });
    const result = await db.lookup([key]);
    expect(result.get(key)).toBeNull();
  });

  it('evicts least recently used entries over bound', async () => {
    const now = Date.now();
    await db.putMany([
      {
        key: 'k-old',
        translation: 'old',
        provider: 'google',
        sourceLang: 'en',
        targetLang: 'zh-CN',
        lastHitAt: now - 3_000,
      },
      {
        key: 'k-mid',
        translation: 'mid',
        provider: 'google',
        sourceLang: 'en',
        targetLang: 'zh-CN',
        lastHitAt: now - 2_000,
      },
      {
        key: 'k-new',
        translation: 'new',
        provider: 'google',
        sourceLang: 'en',
        targetLang: 'zh-CN',
        lastHitAt: now - 1_000,
      },
    ]);

    await db.runEvictionSweep({ ttlDays: 365, maxRecords: 2 });
    const result = await db.lookup(['k-old', 'k-mid', 'k-new']);
    expect(result.get('k-old')).toBeNull();
    expect(result.get('k-mid')).not.toBeNull();
    expect(result.get('k-new')).not.toBeNull();
  });
});
