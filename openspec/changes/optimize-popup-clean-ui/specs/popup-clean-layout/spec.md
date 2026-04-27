## ADDED Requirements

### Requirement: Popup prioritizes primary translation flow
The popup SHALL present source language, target language, translation service selection, and the main translate action in a visually dominant top flow so users can complete a translation setup without scanning secondary controls first.

#### Scenario: User opens popup and sees core flow first
- **WHEN** the user opens the extension popup
- **THEN** the language selectors, service selector, and translate CTA are visible in the primary viewport region before secondary preference rows

#### Scenario: Primary action remains clear in compact layout
- **WHEN** multiple optional settings are enabled in the popup
- **THEN** the translate CTA remains visually emphasized and distinguishable from secondary controls

### Requirement: Popup uses consistent compact row patterns for settings
The popup SHALL render persistent preference controls (for example site auto-translate, hover translation, selection translation, and language-specific auto-translate toggles) using a consistent row pattern with aligned labels and trailing state controls.

#### Scenario: Rows remain scannable across mixed control types
- **WHEN** a user reviews the preference list
- **THEN** each row uses consistent spacing, typography hierarchy, and control alignment regardless of whether the trailing control is a switch, selector, or status badge

#### Scenario: Existing preferences remain available after redesign
- **WHEN** a user compares popup controls before and after the redesign
- **THEN** all previously available popup preference controls are still accessible without requiring navigation to the options page

### Requirement: Popup clarifies disabled and pro-only states
The popup SHALL provide explicit visual treatment for disabled features and pro-only affordances, including muted text/icon styling and contextual indicators, so users can distinguish unavailable controls from active ones.

#### Scenario: Pro-only control is shown as gated
- **WHEN** a control depends on a pro entitlement that is not active
- **THEN** the popup shows a visible gated indicator and does not style the control as fully active

#### Scenario: Disabled control avoids ambiguous affordance
- **WHEN** a popup setting is temporarily disabled due to state constraints
- **THEN** the control displays a disabled visual state and the row remains readable without implying it can be toggled immediately
