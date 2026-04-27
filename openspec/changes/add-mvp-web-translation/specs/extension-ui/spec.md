## ADDED Requirements

### Requirement: Popup Surface

The browser-toolbar popup SHALL provide, for the active tab:
- a master toggle to enable / disable translation on the current tab
- a target-language selector (BCP-47 codes, default from options)
- a Provider selector (limited to enabled Providers)
- a current-tab usage line: characters submitted in this session, cache hit rate
- a link to open Options

State MUST persist via Zustand `persist` middleware; cross-context updates MUST sync via `chrome.storage.onChanged` within 1 second.

#### Scenario: Toggle on
- **WHEN** the user opens popup and clicks the master toggle to "on"
- **THEN** within 500 ms the active tab's content script SHALL begin translating visible paragraphs

#### Scenario: Provider switch
- **WHEN** the user changes Provider in popup from Google to DeepL while the page already has Google translations injected
- **THEN** subsequent paragraphs entering the viewport SHALL be translated via DeepL; already-injected Google translations SHALL remain (not retranslated)

#### Scenario: Cross-context sync
- **WHEN** the user changes target language in popup
- **THEN** the options page (if open) SHALL reflect the new value within 1 second without manual refresh

### Requirement: Options Page

The options page SHALL provide configuration for at least:
- **General**: default target language, default source language (`auto` allowed), default Provider, master enable
- **Display**: bilingual mode (`below` / `side-by-side` / `replace`), text color, font size, decoration, blur effect
- **Shortcuts**: keyboard shortcut to toggle translation on the current tab (default `Alt+A`)
- **Providers**: list of built-in Providers, per-Provider enable, per-Provider API key entry (with master-password unlock flow)
- **Cache**: TTL, LRU max records, "Clear cache" actions
- **About**: version, links

All form fields MUST use `react-hook-form` and validate via `zod` schemas. Invalid values MUST NOT be persisted.

#### Scenario: Invalid font size rejected
- **WHEN** the user enters `300` in the font-size field which is constrained to 50-150
- **THEN** the form SHALL display an error and SHALL NOT persist the value

#### Scenario: Shortcut conflict
- **WHEN** the user assigns a shortcut already used by another extension
- **THEN** the system SHALL show a warning notice from `chrome.commands` and the shortcut SHALL fall back to default

### Requirement: Floating One-Click Translate Button

The system SHALL inject a floating button into the bottom-right corner of every top-level frame on every page (subject to global toggle in options). Clicking the button SHALL trigger translation of the entire visible viewport's paragraphs and continue translating as the user scrolls.

The button MUST:
- be rendered inside Shadow DOM
- be hidden when the global toggle is off
- not be injected into iframes (to avoid duplication)
- be dismissible per-page via close affordance, with the dismissal lasting only until next reload

#### Scenario: Click triggers translation
- **WHEN** user clicks the floating button on a page with no prior translation
- **THEN** within 200 ms the visible viewport's paragraphs SHALL begin to be translated and injected per the configured display mode

#### Scenario: Not in iframes
- **WHEN** a page contains nested iframes
- **THEN** the floating button SHALL appear only in the top frame, not in any iframe

#### Scenario: Per-page dismiss
- **WHEN** user clicks the button's dismiss control
- **THEN** the button SHALL hide on the current page, and SHALL re-appear on next reload of the same page

### Requirement: Internationalization

All user-facing strings in popup, options, and floating-button tooltips MUST be served via i18next. The MVP SHALL ship with at minimum two locales: `zh-CN` and `en`. Locale resolution MUST use `chrome.i18n.getUILanguage()` as the default, with a manual override in options.

#### Scenario: Default locale follows browser
- **WHEN** the user's Chrome UI language is `zh-CN` and the user has not chosen a manual override
- **THEN** popup and options SHALL render in Chinese

#### Scenario: Manual locale override
- **WHEN** the user selects "English" in options
- **THEN** subsequent renders of popup, options, and floating button SHALL use English regardless of browser UI language

### Requirement: Cross-Context State Synchronization

State that the user can change in any context (popup, options, content-script settings) MUST converge across contexts using `chrome.storage` as the single source of truth and `chrome.storage.onChanged` as the change channel.

The Zustand stores in popup and options MUST subscribe to `onChanged` and apply diffs locally; they MUST NOT poll.

Maximum end-to-end propagation time from change in one context to visible effect in another MUST be ≤ 1 second.

#### Scenario: Options change reaches content script
- **WHEN** the user changes display mode from `below` to `side-by-side` in options
- **THEN** within 1 second, the active tab's content script SHALL re-render existing translations in side-by-side mode

#### Scenario: No polling
- **WHEN** popup is open and idle
- **THEN** popup SHALL NOT issue any periodic `chrome.storage.get` calls; updates SHALL only be received via `onChanged` events
