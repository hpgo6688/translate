## Why

Current page translation applies broadly and cannot be quickly focused on one target element. Users need a lightweight way to translate only the hovered element and hide it again without changing the rest of the page, especially when reading mixed-language content.

## What Changes

- Add a hover-target translation interaction that translates only the currently hovered DOM element when a configured shortcut key is pressed.
- Add toggle behavior on repeated shortcut presses over the same element to show or hide translation output.
- Add user-configurable shortcut key support (defaulting to `Option`) in extension settings and persist it for content scripts.
- Keep non-target page content untouched during this interaction.

## Capabilities

### New Capabilities
- `hover-hotkey-element-translation`: Translate only the hovered element via a configurable shortcut key, with toggle-on/off behavior.

### Modified Capabilities
- None.

## Impact

- Affected areas: content script event handling, DOM injector/shadow-host logic, and settings state/persistence.
- APIs/data flow: settings storage must expose the configured hotkey to the content script runtime.
- UX: introduces focused translation mode without changing existing full-page translation pathways.
