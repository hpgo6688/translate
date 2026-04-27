## 1. Settings and configuration

- [x] 1.1 Add `hoverTranslateHotkey` to extension settings model with default `Option` and backward-compatible initialization.
- [x] 1.2 Update options UI to let users choose the hover translation hotkey and persist the selected value.
- [x] 1.3 Ensure content script receives the latest hotkey setting from shared settings state/storage.

## 2. Hover target and trigger handling

- [x] 2.1 Add hovered element tracking in content runtime and filter out extension-owned/non-translatable nodes.
- [x] 2.2 Implement hotkey listener that matches normalized key input against configured `hoverTranslateHotkey`.
- [x] 2.3 Bind hotkey trigger to translate only the currently hovered element without invoking page-level translation flow.

## 3. Element-level toggle behavior

- [x] 3.1 Extend injector/shadow-host integration to associate rendered translation with the active hovered element.
- [x] 3.2 Implement toggle logic so pressing the hotkey again on the same hovered element hides existing translation output.
- [x] 3.3 Re-show translation on subsequent trigger for the same element and keep other page elements unaffected.

## 4. Validation and regression checks

- [x] 4.1 Add or update unit/integration tests for settings persistence, hotkey trigger, and per-element toggle behavior.
- [ ] 4.2 Manually verify behavior on representative pages (nested elements, dynamic content, and regular full-page translation path).
- [x] 4.3 Confirm no regressions in existing translation features and document any known limitations.
