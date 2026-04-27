## Context

The popup is optimized for quick actions, but users need a larger workspace for broad settings management. Competitor behavior establishes a familiar expectation that clicking popup settings opens a dedicated options page with anchored navigation (for example, `options.html#general`). In this project, options entrypoint exists but the structure can be improved into a clearer shell layout that supports progressive completion of sections.

## Goals / Non-Goals

**Goals:**
- Make popup settings entry open extension options page at the general section hash route.
- Establish a robust options shell UI with left-side section navigation and right-side content panel.
- Provide a first-pass visual framework for multiple settings categories, including placeholders where details are not yet implemented.
- Preserve existing settings logic and avoid storage or backend contract changes.

**Non-Goals:**
- Not implementing every detailed control from competitor pages in this phase.
- No overhaul of translation engine behavior, provider APIs, or content script pipeline.
- No permissions/model changes for extension runtime beyond standard options-page navigation.

## Decisions

1. **Use Chrome options-page opening API from popup**
   - Decision: Trigger options page opening through extension API and include `#general` route/hash.
   - Rationale: This matches expected extension behavior and decouples detailed settings from popup constraints.
   - Alternative considered: Open internal route inside popup panel; rejected because popup space remains limited and does not scale for large settings.

2. **Create options shell as reusable layout scaffold**
   - Decision: Build a stable container with sidebar navigation, active section state, and standardized section block styling.
   - Rationale: Enables incremental implementation of each settings section without reworking global layout repeatedly.
   - Alternative considered: Implement sections ad hoc one by one; rejected due to inconsistent UX and refactor churn.

3. **Use placeholder blocks for incomplete sections**
   - Decision: Render clear "coming soon / scaffolded" blocks for sections not fully implemented.
   - Rationale: Delivers target information architecture early while signaling implementation boundaries.
   - Alternative considered: Hide unfinished sections; rejected because navigation completeness is part of desired UI direction.

4. **Keep existing settings state/store interfaces unchanged**
   - Decision: Map shell UI to current settings store and only add presentational wrappers where needed.
   - Rationale: Minimizes regression risk and keeps this phase focused on UX structure.
   - Alternative considered: Redesign settings schema to match new UI hierarchy; rejected as out of scope.

## Risks / Trade-offs

- **[Risk] Hash routing and selected section can drift** -> **Mitigation:** normalize section ids and centralize route parsing/serialization logic.
- **[Risk] Placeholder-heavy page may be perceived as incomplete** -> **Mitigation:** keep core "General" section functional and clearly label staged sections.
- **[Risk] Sidebar expansion adds complexity for i18n labels** -> **Mitigation:** use flexible layout with truncation/wrap rules and test with longer strings.
- **[Trade-off] Prioritizing shell first delays deep control parity** -> **Mitigation:** produce explicit follow-up tasks per section after shell stabilizes.
