## Context

The popup currently exposes many controls with similar visual weight, which increases cognitive load before users can trigger translation. The user feedback and reference screenshot indicate a preference for a compact panel that keeps primary actions obvious while still preserving key toggles. The existing codebase already has popup state bindings for language/provider/toggles, so the work is mainly UI composition, style token updates, and interaction-state polish rather than core translation flow changes.

## Goals / Non-Goals

**Goals:**
- Reorganize popup layout into clear sections with stronger hierarchy: translation setup, primary action, quick toggles, and secondary links.
- Reduce visual clutter by simplifying labels, spacing, and control density while keeping current capabilities available.
- Standardize interaction styles for toggle rows, CTA button, dropdowns, and disabled/pro indicators.
- Preserve existing data bindings and behavior semantics for settings changes.

**Non-Goals:**
- No changes to translation pipeline, provider backend integration, or storage schema.
- No new premium entitlement logic; only visual treatment and messaging improvements for existing states.
- No redesign of options page or content script behavior outside popup-triggered interactions.

## Decisions

1. **Use a sectioned card architecture inside popup**
   - Decision: Split popup into top profile/header bar, language/service controls, primary CTA block, and preference list rows.
   - Rationale: Mirrors the reference style and allows faster visual scanning.
   - Alternative considered: Keep current flat list and only adjust spacing; rejected because hierarchy would remain weak.

2. **Adopt a compact row component for preference toggles**
   - Decision: Build reusable row primitives for label + optional description + trailing switch/icon state.
   - Rationale: Keeps style consistent and makes future toggle additions low-cost.
   - Alternative considered: Hand-craft each row independently; rejected due to maintenance overhead and inconsistency risk.

3. **Preserve current setting keys and event handlers**
   - Decision: Refactor presentation layer without changing persisted key names or message contracts.
   - Rationale: Avoid migration risk and keep behavior stable while improving UX.
   - Alternative considered: Rename/re-group settings payload; rejected because it adds unnecessary compatibility work.

4. **Define explicit style tokens for dark popup theme**
   - Decision: Introduce popup-specific tokens/classes for background layers, border contrast, muted text, active accent, and hover states.
   - Rationale: Ensures consistent visual language and easier iterative tuning.
   - Alternative considered: Inline ad-hoc class changes only; rejected due to poor long-term maintainability.

## Risks / Trade-offs

- **[Risk] Visual-only redesign may accidentally hide important controls** -> **Mitigation:** keep feature parity checklist and verify all existing toggles/actions remain reachable within one scroll.
- **[Risk] Denser layout can reduce readability in localized strings** -> **Mitigation:** validate with longer i18n strings and reserve flexible width/truncation behavior for labels.
- **[Risk] Refactor of popup component structure could break wiring to storage updates** -> **Mitigation:** keep handler logic unchanged and add focused interaction tests/manual checklist for each control.
- **[Trade-off] Prioritizing clean hierarchy may push secondary controls lower** -> **Mitigation:** retain clear section titles/icons and keep advanced rows discoverable without deep navigation.
