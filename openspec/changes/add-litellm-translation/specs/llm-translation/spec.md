## ADDED Requirements

### Requirement: User can select LLM translation provider
The system SHALL provide an LLM translation provider option in translation service settings and persist the user's selection.

#### Scenario: User selects LLM provider in settings
- **WHEN** the user chooses the LLM provider in sidepanel or popup settings and saves
- **THEN** the system stores the selected provider and uses it for subsequent translation requests

### Requirement: System validates required LiteLLM configuration
The system SHALL require endpoint URL, API key, and model before executing an LLM translation request.

#### Scenario: Missing required configuration
- **WHEN** the selected provider is LLM and one or more required fields are empty
- **THEN** the system prevents request execution and shows a clear configuration error message

### Requirement: System translates text through LiteLLM-compatible API
The system SHALL send translation requests to the configured LiteLLM endpoint using the configured model and return translated text in the existing translation result shape.

#### Scenario: Successful LLM translation
- **WHEN** a valid translation request is submitted with complete LLM configuration
- **THEN** the system calls the LiteLLM-compatible API and returns translated text mapped to the extension's translation result format

### Requirement: System handles LLM translation failures deterministically
The system SHALL map timeout, authentication, and invalid response errors to stable user-facing failure states.

#### Scenario: LLM endpoint timeout
- **WHEN** the LiteLLM request exceeds the configured timeout threshold
- **THEN** the system returns a timeout error state with retry guidance and does not crash the UI

#### Scenario: LLM authentication failure
- **WHEN** the LiteLLM endpoint returns an authentication or authorization error
- **THEN** the system returns an invalid-credentials error state and prompts the user to update API settings

#### Scenario: LLM response cannot be parsed as translation
- **WHEN** the API response is missing expected text content
- **THEN** the system returns an invalid-response error state and preserves original input text in the UI
