## 1. Popup Settings Navigation

- [ ] 1.1 Identify the popup settings trigger location and wire it to extension options-page opening API.
- [ ] 1.2 Ensure settings action opens options page with `#general` (or equivalent normalized general-section route).
- [ ] 1.3 Verify popup behavior remains lightweight and no advanced settings panel expansion is reintroduced in popup.

## 2. Options Shell UI Foundation

- [ ] 2.1 Refactor options page into a shell layout with left category navigation and right content container.
- [ ] 2.2 Implement active category state driven by hash/route and synchronize sidebar highlight with displayed section.
- [ ] 2.3 Add shared shell-style primitives (section card, title row, spacing system) for consistent first-pass UI.

## 3. Section Scaffolding and Validation

- [ ] 3.1 Keep `general` section functional within the new shell layout.
- [ ] 3.2 Add structured placeholder blocks for planned-but-not-implemented sections to preserve IA completeness.
- [ ] 3.3 Run lint/type checks and perform manual navigation verification for popup→options flow and section switching.
