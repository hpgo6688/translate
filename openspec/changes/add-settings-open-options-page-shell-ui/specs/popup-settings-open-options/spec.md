## ADDED Requirements

### Requirement: Popup settings action opens options page
The system SHALL open the extension options page when the user clicks the settings entry from popup, and SHALL navigate to the general settings section anchor/hash by default.

#### Scenario: Settings click opens options general section
- **WHEN** the user clicks the settings control in popup
- **THEN** the extension opens `options.html#general` (or equivalent general section route) in the browser

#### Scenario: Popup remains lightweight after redirecting to options
- **WHEN** the settings action is triggered from popup
- **THEN** detailed settings editing occurs in options page rather than expanding complex controls inside popup
