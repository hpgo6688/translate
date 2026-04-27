import { cacheDb, buildCacheKeyFromText, type CacheRecord } from '@/core/cache/db';

export type ParagraphInput = {
  id: string;
  text: string;
};

export type CacheFilterInput = {
  provider: string;
  sourceLang: string;
  targetLang: string;
  segments: ParagraphInput[];
};

export type CacheFilterResult = {
  hits: Array<{ id: string; cache: CacheRecord }>;
  misses: ParagraphInput[];
  keyById: Map<string, string>;
};

export async function splitByCache(input: CacheFilterInput): Promise<CacheFilterResult> {
  const keyById = new Map<string, string>();
  const keys = await Promise.all(
    input.segments.map(async (segment) => {
      const key = await buildCacheKeyFromText({
        provider: input.provider,
        sourceLang: input.sourceLang,
        targetLang: input.targetLang,
        text: segment.text,
      });
      keyById.set(segment.id, key);
      return key;
    }),
  );

  const lookup = await cacheDb.lookup(keys);
  const misses: ParagraphInput[] = [];
  const hits: Array<{ id: string; cache: CacheRecord }> = [];

  for (const segment of input.segments) {
    const key = keyById.get(segment.id);
    if (!key) {
      misses.push(segment);
      continue;
    }
    const cached = lookup.get(key);
    if (cached) {
      hits.push({ id: segment.id, cache: cached });
    } else {
      misses.push(segment);
    }
  }

  return { hits, misses, keyById };
}
