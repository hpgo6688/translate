## 1. Configuration and service modeling

- [x] 1.1 Add `llm` provider type and LiteLLM config schema to shared translation service option types.
- [x] 1.2 Add settings persistence and validation for LiteLLM endpoint, API key, and model fields.
- [x] 1.3 Add default LLM generation parameters (for example timeout/temperature/max tokens) with safe bounds.

## 2. Background translation pipeline

- [x] 2.1 Implement LiteLLM request builder and response normalizer in the background translation flow.
- [x] 2.2 Add LLM-specific prompt template that enforces translation-only output.
- [x] 2.3 Wire provider dispatch so selected `llm` provider routes requests to the new pipeline.

## 3. UI and interaction updates

- [x] 3.1 Update sidepanel service selection UI to include the LLM provider option.
- [x] 3.2 Add LiteLLM configuration form fields in sidepanel/popup with inline validation feedback.
- [x] 3.3 Ensure selected provider and config updates are reflected immediately in translation actions.

## 4. Error handling and quality checks

- [x] 4.1 Map timeout/auth/invalid-response failures to stable user-facing error states.
- [x] 4.2 Add tests for provider selection, config validation, successful LLM translation, and failure paths.
- [x] 4.3 Perform manual verification for Google path regression and LLM path end-to-end behavior.
