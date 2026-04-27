## ADDED Requirements

### Requirement: Configurable Hover Translation Hotkey
The system MUST allow users to configure a single-key hotkey used to trigger hovered element translation, and MUST default to `Option` when no user preference exists.

#### Scenario: Default hotkey is available
- **WHEN** the extension initializes settings for a user without an existing hotkey preference
- **THEN** the hotkey value SHALL be set to `Option`

#### Scenario: User updates hotkey
- **WHEN** the user selects a different supported key in settings
- **THEN** the system SHALL persist the new hotkey and use it for future hover translation triggers

### Requirement: Translate Only Hovered Element
The system MUST translate only the element currently under pointer focus when the configured hotkey is pressed, and MUST NOT translate unrelated page content as part of this action.

#### Scenario: Trigger translation on hovered element
- **WHEN** the user hovers a translatable element and presses the configured hotkey
- **THEN** the system SHALL display translation output for that hovered element only

#### Scenario: Ignore non-hovered content
- **WHEN** the user triggers hover translation
- **THEN** elements other than the hovered target SHALL remain unmodified by this feature

### Requirement: Toggle Hovered Element Translation Visibility
The system MUST toggle visibility for translation output when the same hovered element receives repeated hotkey triggers.

#### Scenario: Hide translation on repeated trigger
- **WHEN** translation output is currently visible for the hovered element and the user presses the configured hotkey again on that same element
- **THEN** the system SHALL hide the translation output for that element

#### Scenario: Re-show translation after hiding
- **WHEN** translation output was hidden via toggle for the hovered element and the user triggers the hotkey again while hovering that element
- **THEN** the system SHALL show translation output again for that element
