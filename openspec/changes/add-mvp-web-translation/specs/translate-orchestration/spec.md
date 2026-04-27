## ADDED Requirements

### Requirement: Service Worker as Sole Provider Caller

All outbound calls to translation Provider APIs MUST originate from the extension's background service worker. Content scripts and UI surfaces (popup, options) MUST NOT call Provider APIs directly; they communicate translation needs to the service worker via the typed messaging bus.

#### Scenario: Content script requests translation
- **WHEN** a content script needs to translate paragraphs
- **THEN** it SHALL send a `TRANSLATE_BATCH` message to the service worker, and the service worker SHALL be the only context that issues `fetch` to the Provider endpoint

#### Scenario: Popup requests translation preview
- **WHEN** the popup wants to test the configured Provider with a sample input
- **THEN** it SHALL also route the request through the service worker, not call the Provider directly

### Requirement: Batch Merging

The orchestrator SHALL merge multiple paragraphs from the same content script into a single Provider request when possible, subject to:
- maximum 50 segments per request
- maximum 4000 normalized characters per request
- maximum debounce window of 100 ms before flushing a partial batch

Cache hits MUST be filtered out before batching; only cache-miss segments are sent to the Provider.

#### Scenario: Multiple segments merged
- **WHEN** the content script reports 30 cache-miss paragraphs within 100 ms
- **THEN** the orchestrator SHALL combine them into a single Provider request

#### Scenario: Batch split by segment count
- **WHEN** the content script reports 80 cache-miss paragraphs at once
- **THEN** the orchestrator SHALL split them into at least 2 Provider requests (each ≤ 50 segments)

#### Scenario: Cache hits filtered before batch
- **WHEN** 10 paragraphs are reported and 7 are cache hits
- **THEN** only the 3 cache-miss paragraphs SHALL be batched and sent to the Provider; the 7 hits SHALL be returned to the content script directly

### Requirement: Streamed Per-Segment Delivery

The orchestrator MUST surface translation results to the content script as each segment becomes ready, not after the whole batch completes. The Provider abstraction returns an async iterable; for each yielded segment, the orchestrator MUST forward it to the originating content script immediately.

#### Scenario: First segment shown before last completes
- **WHEN** a 10-segment batch is in flight and segments arrive in order
- **THEN** the content script SHALL receive segment 1 and inject it before segment 10 has finished translating

#### Scenario: Out-of-order segments handled
- **WHEN** segments arrive out of order
- **THEN** the content script SHALL still inject each segment to its correct DOM target by paragraph id, regardless of arrival order

### Requirement: Client-Side Rate Limiting

The orchestrator MUST enforce a global rate limit across all tabs and Providers, configurable per Provider:
- default global concurrency: 4 in-flight requests
- default per-Provider QPS: 10 (overridable per Provider's known limits)
- queue ordering: FIFO across requesting tabs to prevent starvation

When the queue depth exceeds 50 requests, new requests MUST be rejected with a `RATE_LIMITED_LOCAL` error rather than queued indefinitely.

#### Scenario: Concurrency cap enforced
- **WHEN** 10 batches are submitted simultaneously
- **THEN** at most 4 SHALL be in flight to the Provider at any moment, the rest queued

#### Scenario: Queue overflow
- **WHEN** 100 batches are submitted while 4 are already in flight
- **THEN** the orchestrator SHALL accept queue depth 50 and reject additional submissions with `RATE_LIMITED_LOCAL`

### Requirement: Local Usage Metering

The orchestrator MUST record per-Provider usage locally for the user's reference:
- total characters submitted
- estimated character cost (for character-billed Providers)
- request count, success count, failure count
- counters reset at the start of each calendar month (browser local time)

Usage data MUST be persisted to IndexedDB and survive service worker restarts.

#### Scenario: Counter increments after success
- **WHEN** a 1000-character batch is successfully translated by Google Provider
- **THEN** the Google Provider's `chars_submitted` counter SHALL increase by 1000 and `success_count` by 1

#### Scenario: Counter persists across restart
- **WHEN** the service worker is suspended and a new event wakes it up
- **THEN** previously accumulated counters SHALL be available without loss

#### Scenario: Monthly reset
- **WHEN** the local clock crosses into a new month
- **THEN** subsequent reads of the current-month counters SHALL show zero, while historical months remain available for query

### Requirement: Failure Handling and Retry

For Provider HTTP errors classified as transient (network errors, HTTP 502/503/504, HTTP 429 with `Retry-After`), the orchestrator MUST retry with exponential backoff: 1s, 2s, 4s, max 3 attempts, then fail. Non-transient errors (4xx other than 429) MUST fail immediately and the failure MUST be reported back to the content script with a structured error code.

#### Scenario: Transient retry
- **WHEN** the Provider returns HTTP 503 on the first attempt
- **THEN** the orchestrator SHALL wait 1 second and retry; on second 503 wait 2s and retry; on third 503 fail with `PROVIDER_FAILED`

#### Scenario: Permanent failure not retried
- **WHEN** the Provider returns HTTP 401 (invalid key)
- **THEN** the orchestrator SHALL NOT retry and SHALL surface `AUTH_FAILED` to the content script
