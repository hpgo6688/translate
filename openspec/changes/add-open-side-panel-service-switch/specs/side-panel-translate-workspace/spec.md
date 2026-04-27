## ADDED Requirements

### Requirement: Side panel translation workspace availability
The extension SHALL provide a dedicated side panel translation workspace that users can open without replacing existing popup functionality.

#### Scenario: User opens translation side panel
- **WHEN** the user triggers "Open Side Panel" from supported extension entry points
- **THEN** the extension opens the side panel and renders the translation workspace shell

### Requirement: Side panel translation input and language controls
The side panel workspace SHALL provide source text input, source language selection, target language selection, and language swap controls equivalent to popup translation capabilities.

#### Scenario: User configures translation direction
- **WHEN** the user chooses source and target languages in the side panel
- **THEN** the selected language pair is applied to the next translation request

### Requirement: Side panel translation execution and output
The side panel workspace SHALL execute translation through the existing translation pipeline and display result output with existing success and error semantics.

#### Scenario: Successful translation from side panel
- **WHEN** the user enters source text and clicks the translate action
- **THEN** the system sends a translation request using the selected service and language pair and displays translated output in the result area

#### Scenario: Translation request failure in side panel
- **WHEN** the translation request fails
- **THEN** the side panel displays an error state consistent with existing translation error handling
