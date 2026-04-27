## ADDED Requirements

### Requirement: Unified Provider Interface

All translation Providers MUST implement a single TypeScript interface defined in `core/translators/base.ts`:

```ts
interface TranslateProvider {
  readonly id: string;
  readonly displayName: string;
  readonly requiresKey: boolean;
  readonly supportedLangs: { source: string[]; target: string[] };
  readonly limits: { maxSegmentChars: number; maxBatchSegments: number; qps: number };

  translate(
    segments: { id: string; text: string }[],
    opts: { sourceLang: string; targetLang: string; signal: AbortSignal }
  ): AsyncIterable<{ id: string; text: string; done: boolean }>;
}
```

A Provider that does not natively stream MUST still return an `AsyncIterable`, internally yielding all results once the underlying call resolves. New Providers added in later changes MUST conform to this interface without modification.

#### Scenario: Non-streaming Provider conforms
- **WHEN** the Google Provider receives a 5-segment batch and the underlying API returns all 5 translations in one response
- **THEN** the implementation SHALL yield 5 segments via the `AsyncIterable`, each with `done: true`, before the iterable closes

#### Scenario: Abort honored
- **WHEN** the caller aborts the `AbortSignal` mid-translation
- **THEN** the underlying HTTP call SHALL be cancelled and the iterable SHALL throw an `AbortError`

### Requirement: Google Provider Implementation

The system SHALL ship a `GoogleProvider` adapter that targets the public free Google Translate endpoint, requiring no API key. It MUST handle source-language `auto` by passing the API's auto-detect parameter.

#### Scenario: Auto detection
- **WHEN** caller invokes `translate(...)` with `sourceLang: 'auto'` on English text targeting `zh-CN`
- **THEN** the Provider SHALL succeed and return Chinese translation

#### Scenario: Unsupported language pair
- **WHEN** caller requests a target language outside Google's supported list
- **THEN** the Provider SHALL throw `UNSUPPORTED_LANG_PAIR` before issuing any HTTP request

### Requirement: DeepL Free Provider Implementation

The system SHALL ship a `DeepLFreeProvider` adapter that targets DeepL's free API endpoint and requires the user to supply a free-tier API key. It MUST honor DeepL's known QPS limit (`limits.qps = 5` by default).

#### Scenario: Missing key rejected
- **WHEN** the user has not configured a DeepL key and selects DeepL as Provider
- **THEN** the Provider SHALL throw `PROVIDER_KEY_MISSING` immediately when `translate` is called

#### Scenario: Quota exceeded surfaced
- **WHEN** DeepL returns HTTP 456 (quota exceeded)
- **THEN** the Provider SHALL throw `QUOTA_EXCEEDED` with a clear message that the user has used up free-tier characters

### Requirement: Encrypted Key Storage

Provider API keys MUST NOT be stored in plain text. The system SHALL:
- prompt the user to set a master password on first key entry (or first launch with key entry disabled)
- derive an AES-GCM 256 key via PBKDF2 (SHA-256, 200 000 iterations, random 16-byte salt)
- encrypt each Provider key under that derived key with a fresh 12-byte IV per encryption
- store ciphertext, IV, and salt in `chrome.storage.local`; the master password MUST NEVER be persisted

The decrypted derived key MUST be held only in service-worker memory and MUST be cleared when the service worker is suspended, requiring re-unlock on resume.

#### Scenario: First-time key setup
- **WHEN** the user enters their first Provider API key in options
- **THEN** the system SHALL prompt for a master password, derive a key, encrypt the API key, and persist only the ciphertext + IV + salt

#### Scenario: Re-unlock after SW suspension
- **WHEN** the service worker has been suspended and a new translation request arrives
- **THEN** the orchestrator SHALL detect the missing in-memory key, send a `NEEDS_UNLOCK` message to the active popup or open a prompt, and wait for the user to enter the master password before proceeding

#### Scenario: Wrong master password
- **WHEN** user enters an incorrect master password during unlock
- **THEN** AES-GCM decryption SHALL fail and the system SHALL display "Incorrect password" without leaking which Provider keys exist

### Requirement: Master Password Reset

The system SHALL provide a "reset master password" action in options. Reset MUST irreversibly clear all encrypted Provider keys (since they cannot be recovered) and prompt the user to set a new password and re-enter their Provider keys.

#### Scenario: Reset clears all keys
- **WHEN** user clicks "Reset master password"
- **THEN** all stored ciphertext, IV, and salt entries SHALL be deleted from `chrome.storage.local` and the user SHALL be prompted to set a new master password

### Requirement: Provider Configuration CRUD

The system SHALL provide an API (used by options page) to:
- list all available Providers (built-in registry)
- enable / disable a Provider
- set / update / clear the API key for a Provider that requires one
- mark one Provider as the default

Configuration changes MUST be observable by the service worker via `chrome.storage.onChanged` and take effect within 1 second without browser restart.

#### Scenario: Enable Provider
- **WHEN** user enables DeepL in options
- **THEN** the service worker SHALL detect the change within 1 second and accept DeepL as a routing target for subsequent requests

#### Scenario: Default Provider switch
- **WHEN** user changes default Provider from Google to DeepL
- **THEN** new translation requests originating from popup or floating button (without explicit Provider override) SHALL use DeepL
