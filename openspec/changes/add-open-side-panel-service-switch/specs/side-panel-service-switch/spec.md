## ADDED Requirements

### Requirement: Entitlement-aware service list in side panel
The side panel SHALL provide a service/model switcher that groups and presents translation services according to user entitlement tiers.

#### Scenario: Free user views switcher
- **WHEN** a free-tier user opens the side panel service switcher
- **THEN** the system displays free services as selectable and pro services according to existing entitlement restrictions

#### Scenario: Pro user views switcher
- **WHEN** a pro-tier user opens the side panel service switcher
- **THEN** the system displays both free and pro services as selectable according to provider availability rules

### Requirement: Service selection updates translation execution
The side panel SHALL use the currently selected service for subsequent translation requests.

#### Scenario: User switches provider before translating
- **WHEN** the user selects a different service in the switcher
- **THEN** the selected service becomes active and the next translation request uses that service

### Requirement: Service selection persistence across panel sessions
The system SHALL persist selected translation service according to existing extension preference behavior so users retain their last chosen service.

#### Scenario: User reopens side panel after selecting service
- **WHEN** the user closes and later reopens the side panel
- **THEN** the previously selected valid service is restored as active

#### Scenario: Previously selected service becomes unavailable
- **WHEN** the persisted selected service is no longer permitted for the current entitlement
- **THEN** the system falls back to a valid default service and reflects it in the switcher UI
