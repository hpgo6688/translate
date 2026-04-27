## Why

The extension currently relies on popup-first interactions, which limits usability for longer translation sessions and hides key options behind compact UI. Introducing a dedicated side panel now enables a persistent, task-focused workspace and aligns the product with the richer interaction shown in the target design.

## What Changes

- Add a new Open Side Panel experience for text translation with a layout and interaction model that mirrors the provided UI reference.
- Implement service switch capability in the side panel so users can choose and switch translation providers from a model/service picker.
- Reuse existing translation pipeline and account entitlement logic, while adapting state handling to support side-panel lifecycle.
- Keep popup and side panel capabilities consistent for core translation behavior (language selection, source input, translate action, and output rendering).

## Capabilities

### New Capabilities
- `side-panel-translate-workspace`: Provide a persistent side panel translation workspace that reproduces the target UI structure and primary actions.
- `side-panel-service-switch`: Provide in-panel translation provider selection and switching with entitlement-aware options.

### Modified Capabilities
None.

## Impact

- Affected code: `translate-extension/entrypoints/content.tsx`, side panel entrypoints/components, popup state store, and shared translation service selection state.
- Affected APIs/systems: browser extension side panel API usage, existing translation provider APIs, and subscription/entitlement checks.
- Dependencies: no new external backend required; may require additional extension manifest permissions or side-panel wiring depending on current setup.
