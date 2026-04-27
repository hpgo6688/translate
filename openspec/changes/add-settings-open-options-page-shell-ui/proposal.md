## Why

Users expect the popup `Settings` entry to open a full options page for deeper configuration, similar to mainstream translation extensions. The current experience keeps users inside limited popup space, which makes advanced settings harder to scan and operate.

## What Changes

- Add a popup settings entry behavior that opens extension options at `options.html#general` (or equivalent hash route).
- Introduce a first-pass options page shell UI with clear left navigation and right content area, prioritizing overall structure instead of full feature-complete controls.
- Align top-level visual hierarchy with competitor patterns: category menu, section header, and grouped setting blocks.
- Keep existing options behavior/functionality stable where already implemented, while allowing placeholder UI sections for not-yet-implemented settings.

## Capabilities

### New Capabilities
- `popup-settings-open-options`: Defines popup-to-options navigation so clicking settings opens the options page at the general section.
- `options-shell-layout`: Defines a baseline options page shell UI (navigation + content framework) for iterative completion.

### Modified Capabilities
- None.

## Impact

- Affected code: `translate-extension/entrypoints/popup/App.tsx`, `translate-extension/entrypoints/options/App.tsx`, related options entrypoint routing/wiring.
- Affected UX: popup settings interaction flow and initial options information architecture.
- No backend/API dependency changes expected; this is UI/navigation focused.
