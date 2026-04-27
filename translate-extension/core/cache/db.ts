import Dexie, { type Table } from 'dexie';

import { paragraphId } from '@/utils/normalize';

export const CACHE_SCHEMA_VERSION = 1;
export const DEFAULT_TTL_DAYS = 30;
export const DEFAULT_MAX_RECORDS = 50_000;
const HIT_FLUSH_INTERVAL_MS = 5_000;

export interface CacheRecord {
  key: string;
  translation: string;
  provider: string;
  sourceLang: string;
  targetLang: string;
  createdAt: number;
  lastHitAt: number;
  hitCount: number;
  schemaVersion: number;
}

interface ParagraphEntity extends CacheRecord {
  id?: number;
}

interface HitRateSnapshot {
  hits: number;
  misses: number;
  hitRate: number;
}

type HitBufferEntry = {
  hitCountDelta: number;
  lastHitAt: number;
};

type HitRateWindow = {
  samples: boolean[];
  cursor: number;
  size: number;
  hits: number;
};

export function buildCacheKey(parts: {
  provider: string;
  sourceLang: string;
  targetLang: string;
  normalizedTextHash: string;
}): string {
  const { provider, sourceLang, targetLang, normalizedTextHash } = parts;
  return `${provider}|${sourceLang}|${targetLang}|${normalizedTextHash}`;
}

export async function buildCacheKeyFromText(parts: {
  provider: string;
  sourceLang: string;
  targetLang: string;
  text: string;
}): Promise<string> {
  const hash = await paragraphId(parts.text);
  return buildCacheKey({
    provider: parts.provider,
    sourceLang: parts.sourceLang,
    targetLang: parts.targetLang,
    normalizedTextHash: hash,
  });
}

function providerFromKey(key: string): string {
  return key.split('|', 1)[0] ?? 'unknown';
}

export class TranslationCacheDb extends Dexie {
  paragraphs!: Table<ParagraphEntity, number>;

  private hitUpdateBuffer = new Map<string, HitBufferEntry>();
  private hitFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private hitRateByProvider = new Map<string, HitRateWindow>();
  private readonly hitRateWindowSize = 1000;

  constructor(dbName = 'translation-cache') {
    super(dbName);
    this.version(1).stores({
      paragraphs:
        '++id,&key,provider,sourceLang,targetLang,[sourceLang+targetLang],lastHitAt,createdAt,hitCount,schemaVersion',
    });
    this.paragraphs = this.table('paragraphs');
  }

  async lookup(keys: string[]): Promise<Map<string, CacheRecord | null>> {
    const result = new Map<string, CacheRecord | null>();
    if (keys.length === 0) {
      return result;
    }

    await this.transaction('r', this.paragraphs, async () => {
      const rows = await this.paragraphs.where('key').anyOf(keys).toArray();
      const rowMap = new Map(rows.map((row) => [row.key, row]));

      for (const key of keys) {
        const row = rowMap.get(key);
        if (!row || row.schemaVersion !== CACHE_SCHEMA_VERSION) {
          result.set(key, null);
          this.recordLookupSample(providerFromKey(key), false);
          continue;
        }

        result.set(key, row);
        this.recordLookupSample(row.provider, true);
        this.bufferHitUpdate(key);
      }
    });

    return result;
  }

  async put(
    record: Omit<CacheRecord, 'schemaVersion' | 'createdAt' | 'lastHitAt' | 'hitCount'> &
      Partial<Pick<CacheRecord, 'createdAt' | 'lastHitAt' | 'hitCount'>>,
  ): Promise<void> {
    const now = Date.now();
    await this.paragraphs.put({
      ...record,
      createdAt: record.createdAt ?? now,
      lastHitAt: record.lastHitAt ?? now,
      hitCount: record.hitCount ?? 0,
      schemaVersion: CACHE_SCHEMA_VERSION,
    });
  }

  async putMany(
    records: Array<
      Omit<CacheRecord, 'schemaVersion' | 'createdAt' | 'lastHitAt' | 'hitCount'> &
        Partial<Pick<CacheRecord, 'createdAt' | 'lastHitAt' | 'hitCount'>>
    >,
  ): Promise<void> {
    const now = Date.now();
    const normalized = records.map((record) => ({
      ...record,
      createdAt: record.createdAt ?? now,
      lastHitAt: record.lastHitAt ?? now,
      hitCount: record.hitCount ?? 0,
      schemaVersion: CACHE_SCHEMA_VERSION,
    }));
    await this.paragraphs.bulkPut(normalized);
  }

  async runEvictionSweep(config?: {
    ttlDays?: number;
    maxRecords?: number;
  }): Promise<void> {
    const ttlDays = config?.ttlDays ?? DEFAULT_TTL_DAYS;
    const maxRecords = config?.maxRecords ?? DEFAULT_MAX_RECORDS;
    const expireBefore = Date.now() - ttlDays * 24 * 60 * 60 * 1000;

    await this.transaction('rw', this.paragraphs, async () => {
      const expiredKeys = await this.paragraphs
        .where('lastHitAt')
        .below(expireBefore)
        .primaryKeys();
      if (expiredKeys.length > 0) {
        await this.paragraphs.bulkDelete(expiredKeys);
      }

      const total = await this.paragraphs.count();
      if (total <= maxRecords) {
        return;
      }

      const overflow = total - maxRecords;
      const oldestRows = await this.paragraphs
        .orderBy('lastHitAt')
        .limit(overflow)
        .primaryKeys();
      await this.paragraphs.bulkDelete(oldestRows);
    });
  }

  async clearByProvider(provider: string): Promise<void> {
    await this.paragraphs.where('provider').equals(provider).delete();
  }

  async clearByLanguagePair(sourceLang: string, targetLang: string): Promise<void> {
    const rows = await this.paragraphs
      .where('[sourceLang+targetLang]')
      .equals([sourceLang, targetLang])
      .primaryKeys();
    await this.paragraphs.bulkDelete(rows);
  }

  async clearAll(): Promise<void> {
    await this.paragraphs.clear();
  }

  scheduleHourlySweep(config?: { ttlDays?: number; maxRecords?: number }): () => void {
    const timer = setInterval(() => {
      void this.runEvictionSweep(config);
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }

  getHitRate(provider: string): HitRateSnapshot {
    const window = this.hitRateByProvider.get(provider);
    if (!window || window.size === 0) {
      return { hits: 0, misses: 0, hitRate: 0 };
    }
    const misses = window.size - window.hits;
    return {
      hits: window.hits,
      misses,
      hitRate: window.hits / window.size,
    };
  }

  getAllHitRates(): Record<string, HitRateSnapshot> {
    const snapshots: Record<string, HitRateSnapshot> = {};
    for (const provider of this.hitRateByProvider.keys()) {
      snapshots[provider] = this.getHitRate(provider);
    }
    return snapshots;
  }

  async flushHitUpdates(): Promise<void> {
    if (this.hitUpdateBuffer.size === 0) {
      return;
    }
    const entries = Array.from(this.hitUpdateBuffer.entries());
    this.hitUpdateBuffer.clear();

    await this.transaction('rw', this.paragraphs, async () => {
      const rows = await this.paragraphs
        .where('key')
        .anyOf(entries.map(([key]) => key))
        .toArray();
      const rowByKey = new Map(rows.map((row) => [row.key, row]));

      const patchRows = entries
        .map(([key, update]) => {
          const row = rowByKey.get(key);
          if (!row) {
            return null;
          }
          return {
            ...row,
            hitCount: row.hitCount + update.hitCountDelta,
            lastHitAt: Math.max(row.lastHitAt, update.lastHitAt),
          };
        })
        .filter((row): row is ParagraphEntity => row !== null);

      if (patchRows.length > 0) {
        await this.paragraphs.bulkPut(patchRows);
      }
    });
  }

  private bufferHitUpdate(key: string): void {
    const current = this.hitUpdateBuffer.get(key);
    const now = Date.now();
    if (current) {
      current.hitCountDelta += 1;
      current.lastHitAt = now;
    } else {
      this.hitUpdateBuffer.set(key, {
        hitCountDelta: 1,
        lastHitAt: now,
      });
    }

    if (this.hitFlushTimer) {
      return;
    }

    this.hitFlushTimer = setTimeout(() => {
      this.hitFlushTimer = null;
      void this.flushHitUpdates();
    }, HIT_FLUSH_INTERVAL_MS);
  }

  private recordLookupSample(provider: string, hit: boolean): void {
    const current = this.hitRateByProvider.get(provider) ?? {
      samples: new Array<boolean>(this.hitRateWindowSize),
      cursor: 0,
      size: 0,
      hits: 0,
    };

    if (current.size < this.hitRateWindowSize) {
      current.samples[current.cursor] = hit;
      current.size += 1;
      if (hit) {
        current.hits += 1;
      }
      current.cursor = (current.cursor + 1) % this.hitRateWindowSize;
      this.hitRateByProvider.set(provider, current);
      return;
    }

    const oldValue = current.samples[current.cursor] ?? false;
    if (oldValue) {
      current.hits -= 1;
    }
    current.samples[current.cursor] = hit;
    if (hit) {
      current.hits += 1;
    }
    current.cursor = (current.cursor + 1) % this.hitRateWindowSize;
    this.hitRateByProvider.set(provider, current);
  }
}

export const cacheDb = new TranslationCacheDb();
