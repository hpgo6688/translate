## 1. Popup Layout Refactor

- [x] 1.1 Audit current popup component structure and map existing controls to target sections (header, primary flow, preferences, footer).
- [x] 1.2 Refactor popup JSX into sectioned containers with clear hierarchy for language/service controls and main translate CTA.
- [x] 1.3 Introduce reusable row components/styles for preference items with consistent label/control alignment.

## 2. Visual Style Simplification

- [x] 2.1 Define and apply popup style tokens/classes for dark card layers, spacing rhythm, muted text, and accent CTA states.
- [x] 2.2 Update switches, dropdowns, and button styles to match the compact clean visual baseline from the reference direction.
- [x] 2.3 Add explicit visual states for disabled and pro-only controls (including gated badge/indicator treatment).

## 3. Behavior Preservation and Verification

- [x] 3.1 Rebind all existing popup controls to current settings/actions without changing storage keys or message contracts.
- [x] 3.2 Validate interaction behavior for main translation trigger, language/service selection, and each preference toggle.
- [ ] 3.3 Run local lint/type checks and perform manual UI verification to confirm feature parity with improved clarity.
