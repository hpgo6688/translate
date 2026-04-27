## ADDED Requirements

### Requirement: Persistent Paragraph Cache

The system SHALL persist successfully translated paragraphs in IndexedDB via Dexie, surviving browser restarts. The cache schema MUST include a `schemaVersion` integer field on every record; reads with mismatched version SHALL be treated as cache misses and overwritten on next write.

The cache record SHALL include:
- `key`: composite of `provider | sourceLang | targetLang | normalizedTextHash`
- `translation`: translated text
- `provider`: provider id used
- `sourceLang`: detected or specified source language
- `targetLang`: target language
- `createdAt`: epoch ms
- `lastHitAt`: epoch ms, updated on each hit
- `hitCount`: integer, incremented on each hit
- `schemaVersion`: integer, currently 1

#### Scenario: Cache survives restart
- **WHEN** a paragraph is translated and stored, then the browser is closed and reopened
- **THEN** querying the same paragraph hash SHALL return the cached translation

#### Scenario: Schema version mismatch
- **WHEN** a record stored with `schemaVersion: 0` is read by code expecting version 1
- **THEN** the read SHALL be treated as a miss, and a fresh translation SHALL replace the stored record

### Requirement: Normalized Cache Key

The cache key's `normalizedTextHash` component MUST be derived using the same normalization rules as paragraph identification (Unicode NFC, whitespace collapse, trim) and the same hash algorithm (SHA-1 truncated to 16 bytes, Base64URL). This guarantees that the same logical paragraph hits the same cache entry across pages.

The full key MUST also include `provider`, `sourceLang`, and `targetLang` so that the same paragraph translated with different settings does not collide.

#### Scenario: Same text different sources
- **WHEN** the same English text is translated to Chinese with Google and to Chinese with DeepL
- **THEN** both translations SHALL be stored under different keys (different `provider` component), and both SHALL be retrievable independently

#### Scenario: Same text different target lang
- **WHEN** the same English text is translated to Chinese and Japanese with the same Provider
- **THEN** they SHALL be stored under different keys

### Requirement: Hit Lookup

The system SHALL provide a `lookup(keys: string[]): Map<string, CacheRecord | null>` API. Lookup MUST be a single IndexedDB transaction regardless of input size up to 1000 keys.

On hit, the record's `lastHitAt` MUST be updated to current time and `hitCount` incremented. The update MAY be deferred (batched) to avoid write amplification, as long as it is persisted within 5 seconds of the hit.

#### Scenario: Bulk lookup is one transaction
- **WHEN** the orchestrator queries 100 keys in one call
- **THEN** the lookup SHALL complete in a single IndexedDB read transaction

#### Scenario: Hit metadata updated
- **WHEN** a record is found via `lookup`
- **THEN** within 5 seconds, its `lastHitAt` SHALL be updated and `hitCount` SHALL be incremented in storage

### Requirement: LRU and TTL Eviction

The cache MUST enforce both:
- **TTL**: records older than the configured TTL (default 30 days, user-configurable in options between 1 and 365 days) MUST be deleted; expiration is based on `lastHitAt`, not `createdAt`
- **LRU bound**: when the total record count exceeds the configured maximum (default 50 000, user-configurable between 1 000 and 1 000 000), the records with the oldest `lastHitAt` SHALL be deleted until the count is below the bound

Eviction MUST run as a background sweep at most once per hour, and additionally on extension install / upgrade.

#### Scenario: TTL expiration
- **WHEN** a record's `lastHitAt` was 31 days ago and the configured TTL is 30 days
- **THEN** the next eviction sweep SHALL delete the record, and a subsequent `lookup` for its key SHALL return null

#### Scenario: LRU bound enforced
- **WHEN** the cache has 50 100 records and the bound is 50 000
- **THEN** the next sweep SHALL delete the 100 records with the oldest `lastHitAt`

### Requirement: Hit Rate Instrumentation

The system SHALL maintain rolling hit-rate counters per Provider over the last 1000 lookups, exposed to popup and options:
- `hits`: integer
- `misses`: integer
- `hitRate`: hits / (hits + misses), 0 if no samples

Counters MUST update synchronously on every lookup.

#### Scenario: Hit rate displayed
- **WHEN** 1000 lookups have occurred against the Google Provider with 700 hits
- **THEN** popup SHALL display "Cache hit rate: 70%" for Google

#### Scenario: Counter scoped per provider
- **WHEN** Google has 800 hits / 200 misses and DeepL has 100 hits / 900 misses
- **THEN** the popup SHALL show 80% for Google and 10% for DeepL, not a combined number

### Requirement: Manual Cache Clear

Options MUST provide actions to:
- clear cache for a specific Provider
- clear cache for a specific (sourceLang, targetLang) pair
- clear the entire cache

Clear actions MUST complete within 5 seconds for caches up to 100 000 records and report progress to the user.

#### Scenario: Clear by provider
- **WHEN** user clicks "Clear DeepL cache"
- **THEN** all records where `provider == 'deepl'` SHALL be deleted, and Google records SHALL remain intact
