## Why

The current popup prioritizes exposing many controls, but the visual density and mixed emphasis make core actions harder to scan quickly. We should align the popup with a cleaner, more focused layout so users can start translation faster and understand state at a glance.

## What Changes

- Redesign popup information hierarchy to emphasize primary translation flow (language pair, service, main CTA) and de-emphasize advanced options.
- Introduce clearer grouping and spacing for toggles such as hover translation and site-level auto-translate, matching a compact, modern card style.
- Improve copy consistency and control labels so quick actions and persistent preferences are easier to distinguish.
- Define interaction states for enabled/disabled/pro-only UI elements to avoid clutter and ambiguity.
- Keep existing translation capabilities intact while updating popup layout, visual style tokens, and interaction affordances.

## Capabilities

### New Capabilities
- `popup-clean-layout`: Defines a streamlined popup layout with stronger visual hierarchy, compact grouping, and clearer primary action focus.

### Modified Capabilities
- None.

## Impact

- Affected code: `translate-extension/entrypoints/popup` UI components and shared popup styling.
- Affected state wiring: popup settings binding for language, provider, and feature toggles.
- Potentially affected assets: iconography and spacing/color tokens used by popup controls.
- No backend/API contract changes expected; behavior remains UI-focused.
