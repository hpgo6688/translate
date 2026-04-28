## Context

The extension currently routes translation requests through an existing Google translation path and exposes service selection in sidepanel and popup UI. The new requirement is to support AI translation through LiteLLM-compatible endpoints while keeping existing Google behavior stable. Because this change touches UI, background request handling, credential storage, and runtime error behavior, a shared design is needed to keep feature boundaries clear and minimize regressions.

## Goals / Non-Goals

**Goals:**
- Add an LLM translation path that can be selected by users in the same UI where translation providers are chosen.
- Support configurable LiteLLM endpoint, API key, and model per user settings.
- Keep the translation response contract compatible with current rendering logic.
- Handle timeout, auth failure, and malformed model output with deterministic user-facing errors.

**Non-Goals:**
- Building a universal prompt library for every language domain.
- Implementing provider-specific features outside the LiteLLM-compatible API contract.
- Replacing or removing existing Google translation support.

## Decisions

1. Introduce a dedicated `llm` translation service type in shared service option definitions.
   - Rationale: keeps provider switching explicit and allows service-specific validation.
   - Alternative considered: reusing a generic custom HTTP service entry. Rejected because it weakens type safety and increases runtime branching complexity.

2. Keep request execution in background context and not in UI entrypoints.
   - Rationale: API keys should remain in extension-managed storage and request logic is already centralized in background flow.
   - Alternative considered: direct fetch from sidepanel/popup. Rejected due to credential exposure risk and duplicated logic.

3. Use a stable prompt template with strict output expectation (translated text only) and post-process normalization.
   - Rationale: prevents noisy LLM responses from breaking existing rendering path.
   - Alternative considered: free-form response parsing. Rejected due to higher failure rate and inconsistent output shape.

4. Add configurable generation settings with conservative defaults (temperature low, max tokens bounded).
   - Rationale: improves translation determinism and cost control while still allowing advanced users to tune behavior.
   - Alternative considered: hardcoded generation options. Rejected because model behavior varies across backends.

5. Preserve provider fallback as user-driven rather than automatic cross-provider retries.
   - Rationale: automatic fallback can hide billing or policy differences; explicit user selection is safer and predictable.
   - Alternative considered: silent fallback to Google on failure. Rejected to avoid surprising behavior and data policy ambiguity.

## Risks / Trade-offs

- [LLM output includes extra explanation text] -> Mitigation: apply prompt constraints and output sanitizer before returning translation text.
- [Endpoint/API key misconfiguration causes repeated failures] -> Mitigation: validate required fields in settings UI and display actionable error messages.
- [Latency and token costs are higher than Google path] -> Mitigation: expose model/temperature controls and document recommended defaults.
- [Different models produce inconsistent language style] -> Mitigation: standardize system prompt and allow optional style instructions in future iterations.
