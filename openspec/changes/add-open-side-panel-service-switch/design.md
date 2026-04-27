## Context

The current extension experience is optimized for popup usage, which constrains multi-step translation flows and makes complex service selection interactions harder to use. The requested change adds a side panel translation workspace that mirrors the provided target UI while preserving existing translation APIs, state semantics, and entitlement constraints used in popup/content workflows.

This work spans UI composition, extension entrypoint wiring, and shared translation-provider state so that service switching behavior remains consistent across surfaces.

## Goals / Non-Goals

**Goals:**
- Add a side panel translation workspace with source input, language selectors, translate action, and result area aligned with the target UX.
- Add an in-panel service/model switcher that lists available providers by user tier and allows switching before translation.
- Reuse existing translation execution and provider metadata logic to avoid behavior drift and duplicated service definitions.
- Maintain compatibility with existing popup translation state where practical (selected service, language direction, input/output lifecycle).

**Non-Goals:**
- Building new backend translation providers or changing provider billing/entitlement policy.
- Redesigning the popup UI in this change (except shared store adjustments required for consistency).
- Implementing new translation modes beyond the referenced panel scope (e.g., document/video/image pipelines).

## Decisions

1. **Introduce side panel as a dedicated entrypoint that composes shared translation modules**
   - **Why:** This keeps panel-specific layout concerns isolated while reusing existing translation business logic.
   - **Alternative considered:** Reusing popup component directly inside side panel. Rejected because popup-specific layout constraints and lifecycle assumptions increase coupling and make screenshot parity harder.

2. **Centralize provider selection state in a shared store contract**
   - **Why:** Service switching must behave consistently between popup and side panel, and future surfaces can share the same source of truth.
   - **Alternative considered:** Separate panel-local provider state. Rejected because it causes divergence in defaults, entitlement filtering, and persistence behavior.

3. **Use entitlement-aware provider grouping in the switcher UI**
   - **Why:** The target design differentiates free/pro model sections and requires clear availability constraints.
   - **Alternative considered:** Flat provider list with disabled items only. Rejected because tier boundaries become unclear and scanning cost increases.

4. **Keep translation trigger flow aligned with existing action pipeline**
   - **Why:** Preserves current request shaping, telemetry semantics, and error handling behaviors.
   - **Alternative considered:** New panel-specific translation executor. Rejected due to duplicate logic and increased regression risk.

## Risks / Trade-offs

- **[Risk] Side panel and popup state collisions** -> **Mitigation:** Define explicit shared state ownership and initialization order; keep transient UI-only state local to each surface.
- **[Risk] UI parity with screenshot may conflict with existing component primitives** -> **Mitigation:** Build thin panel-specific wrappers around shared primitives instead of hard-forking base components.
- **[Risk] Entitlement filtering errors may expose unavailable providers** -> **Mitigation:** Reuse existing entitlement guards and add tests for free/pro visibility and selection fallbacks.
- **[Risk] Manifest/permission mismatch for side panel runtime** -> **Mitigation:** Validate extension manifest and side panel registration in development and e2e smoke tests before release.

## Migration Plan

1. Add side panel entrypoint and route wiring, including extension manifest updates if required.
2. Implement side panel translation workspace UI using shared translation logic and state contracts.
3. Integrate provider switcher with entitlement-aware sections and persisted selected service.
4. Add regression tests for provider visibility, selection persistence, and translation trigger behavior.
5. Roll out behind existing extension release channel; rollback by disabling side panel registration and hiding panel trigger if issues occur.

## Open Questions

- Should the side panel and popup share one persisted source text draft, or keep drafts isolated per surface?
- Should provider selection updates immediately sync to popup if both surfaces are open, or only on next mount?
- Is screenshot-level visual parity required for spacing/typography, or is functional parity with theme alignment sufficient?
