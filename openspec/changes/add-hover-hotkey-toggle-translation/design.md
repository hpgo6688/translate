## Context

The extension currently supports translation flows that can affect broad page regions, but it does not provide an interaction to translate only a specific hovered element on demand. The requested behavior adds a focused mode: user hovers an element, presses a configurable hotkey (default `Option`), sees translation for only that element, and presses again to hide it.

This change touches multiple modules: keyboard/mouse event capture in content entrypoint, target element lifecycle management, and DOM injection/show-hide handling in injector and shadow-host utilities. It also introduces settings-level configurability for hotkey selection.

## Goals / Non-Goals

**Goals:**
- Provide a single-element translation trigger using hovered target + configured hotkey.
- Ensure translation result is scoped to the hovered element only.
- Provide toggle behavior: repeated trigger on the same element hides previously shown translation.
- Persist and expose configurable hotkey setting to runtime logic.

**Non-Goals:**
- Replacing or removing existing page-level translation modes.
- Supporting multi-key chords (for example `Option+T`) in this iteration.
- Introducing per-site keybinding profiles.

## Decisions

1. **Hotkey event model: use keydown with normalized key string**
   - Capture `keydown` in content script and compare against a normalized settings value.
   - Rationale: reliable across pages and easier to map to settings UI than low-level key codes.
   - Alternative considered: `keyup` handling; rejected because it feels less responsive for hover interactions.

2. **Hovered element source of truth: maintain last pointer target**
   - Track current hovered element using pointer/mouse move events with lightweight filtering.
   - Rationale: keeps hotkey handling independent from DOM hit-testing at trigger time and avoids expensive repeated `elementFromPoint` calls.
   - Alternative considered: query target at hotkey press from cursor position; rejected due to additional edge cases with overlays and scroll shifts.

3. **Toggle state keyed by element identity**
   - Store active translated element reference (and/or identifier managed by injector) so repeated trigger on same target toggles hide.
   - Rationale: simple, deterministic toggle semantics.
   - Alternative considered: always retranslate on trigger; rejected because requirement explicitly asks for show/hide toggle.

4. **Settings integration: extend existing settings store**
   - Add `hoverTranslateHotkey` with default `Option`, synchronize to content runtime.
   - Rationale: reuse existing persistence and options UI patterns.
   - Alternative considered: hardcoded key; rejected because user requested customization.

## Risks / Trade-offs

- **[Risk] Modifier key inconsistencies across browsers/platforms** -> **Mitigation:** normalize `KeyboardEvent.key` values and document supported options in settings UI.
- **[Risk] Hover target churn on complex pages** -> **Mitigation:** ignore non-translatable nodes and debounce/cheap-check pointer updates.
- **[Risk] Injected translation UI may interfere with hover detection** -> **Mitigation:** skip extension-owned nodes when resolving target and preserve original target reference for toggle.
- **[Trade-off] Simpler single-key config limits flexibility** -> **Mitigation:** keep data model extensible for future chord support.

## Migration Plan

1. Add new settings field with default value and backward-compatible initialization.
2. Wire hotkey and hover tracking in content script behind existing startup path.
3. Update injector/shadow-host behavior for element-scoped toggle show/hide.
4. Validate on representative pages (simple text blocks, nested elements, dynamic content).
5. Rollback by disabling the feature flag path or reverting hotkey listener/injector linkage if regressions appear.

## Open Questions

- Should `Option` map to `Alt` label in all locales or remain platform-specific wording in options UI?
- For nested hovered elements, should translation target default to deepest node or nearest text-rich container?
