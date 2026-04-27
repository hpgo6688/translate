## 1. Side Panel Foundation

- [x] 1.1 Add or wire a side panel entrypoint and required extension manifest configuration for opening the translation workspace.
- [x] 1.2 Implement the side panel translation page shell to match the target layout regions (header, input section, action area, output area).
- [x] 1.3 Connect language selectors, swap action, and text input controls to existing translation state and handlers.

## 2. Service Switch Capability

- [x] 2.1 Build a side panel service switcher UI that groups providers by free/pro tiers and reflects entitlement-based availability.
- [x] 2.2 Integrate service selection with shared provider state so selected service is used by side panel translation requests.
- [x] 2.3 Implement fallback behavior for unavailable persisted providers and ensure restored defaults are reflected in UI.

## 3. Translation Flow Integration

- [x] 3.1 Reuse existing translation execution pipeline for side panel submit action, including loading and error state handling.
- [x] 3.2 Ensure side panel output rendering follows existing translation response formatting and edge-case behavior.
- [x] 3.3 Validate state coordination between popup and side panel for service selection and language preferences.

## 4. Validation and Regression Coverage

- [x] 4.1 Add or update tests for side panel open flow, translation submission, and success/failure rendering scenarios.
- [x] 4.2 Add tests for entitlement-aware service visibility and service switching persistence/fallback behavior.
- [ ] 4.3 Perform manual verification against the reference UI interactions and document any intentional deviations.
