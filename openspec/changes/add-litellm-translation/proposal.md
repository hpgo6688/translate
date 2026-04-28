## Why

The project currently supports Google translation only, which limits flexibility for users who need model-driven translation quality and customizable prompts. Adding LiteLLM-based translation now enables access to multiple LLM backends through a single endpoint and allows the extension to support AI translation scenarios.

## What Changes

- Add a new LLM translation service option alongside existing Google translation.
- Introduce configuration fields for LiteLLM endpoint, API key, model, and optional generation parameters.
- Implement a translation pipeline that calls LiteLLM chat/completions APIs and normalizes responses to the existing translation result format.
- Update sidepanel and popup UI to allow users to choose and configure LLM translation.
- Add error handling and fallback behavior for failed LLM requests, including clear user-facing error messages.

## Capabilities

### New Capabilities
- `llm-translation`: Translate text through configurable LLM providers via LiteLLM-compatible APIs.

### Modified Capabilities
- None.

## Impact

- Affected code: translation service selection logic, background request flow, sidepanel and popup configuration UI, and shared service option types.
- APIs: adds outbound requests to user-configured LiteLLM endpoint.
- Dependencies: may require validating existing HTTP client usage and secure storage patterns for API keys.
- Systems: browser extension runtime, settings persistence, and translation result rendering.
