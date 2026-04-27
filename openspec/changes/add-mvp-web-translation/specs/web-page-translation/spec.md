## ADDED Requirements

### Requirement: Translatable Paragraph Identification

The system SHALL scan the host page DOM and identify a set of translatable text paragraphs, excluding non-content elements.

The walker MUST skip elements matching any of the following criteria:
- semantic non-content tags: `nav`, `header`, `footer`, `aside`, `script`, `style`, `noscript`, `template`, `svg`, `canvas`, `code`, `pre`, `kbd`, `samp`
- math content: any `math` element or descendants of nodes carrying `class*="math"` or `data-math` attributes
- form controls: `input`, `textarea`, `select`, `button`, `option`
- explicitly excluded nodes: any element with `translate="no"`, `class="notranslate"`, or matching the user's "never translate" CSS selector list
- pure structural wrappers without direct text content
- text nodes containing fewer than 4 characters or containing zero Latin/CJK letters

#### Scenario: Skip navigation and footer
- **WHEN** the walker encounters a `<nav>` or `<footer>` element
- **THEN** none of its descendants SHALL be added to the translatable set

#### Scenario: Skip code blocks
- **WHEN** the walker encounters a `<pre>` or `<code>` element
- **THEN** its content SHALL NOT be translated even if it contains natural language

#### Scenario: Respect translate=no
- **WHEN** an element carries `translate="no"` or `class="notranslate"`
- **THEN** the walker SHALL skip the element and all descendants

#### Scenario: Reject too-short text
- **WHEN** a text node contains fewer than 4 characters or no letters (e.g. `"123"`, `"—"`)
- **THEN** the walker SHALL NOT include it as a translatable paragraph

### Requirement: Stable Paragraph Identifiers

Each identified paragraph MUST receive a deterministic identifier derived from its normalized text content, such that the same paragraph text yields the same identifier across reloads, sessions, and host-DOM rerenders.

The identifier MUST be computed as `hash(normalize(text))` where:
- `normalize` collapses runs of whitespace to a single space, trims leading/trailing whitespace, and applies Unicode NFC normalization
- `hash` is SHA-1 truncated to 16 bytes, encoded as Base64URL
- when the same normalized text appears multiple times within the same scan, a `#<index>` suffix MUST be appended to disambiguate

#### Scenario: Same text yields same id across reloads
- **WHEN** a paragraph with text `"Hello world."` is scanned on first page load and rescanned after navigation
- **THEN** both scans SHALL produce the identical 16-byte hash identifier

#### Scenario: Whitespace differences do not change id
- **WHEN** two pages contain the texts `"Hello   world."` and `" Hello world. "`
- **THEN** both texts SHALL normalize to `"Hello world."` and produce the same identifier

#### Scenario: Duplicate text in the same scan
- **WHEN** the same normalized text appears 3 times on a page
- **THEN** the three occurrences SHALL receive identifiers `<hash>`, `<hash>#1`, `<hash>#2`

### Requirement: Bilingual Injection Modes

The system SHALL support three display modes for the translated text and the user MUST be able to switch between them at runtime:
- `below`: translated text appears as a sibling block immediately after the original
- `side-by-side`: original on the left, translation on the right, in a flex container
- `replace`: translated text replaces the visible original; the original SHALL remain in DOM but visually hidden, and SHALL be revealed on hover

The injection MUST preserve the original text node's parent, surrounding siblings, inline styling, links, and inline formatting tags (`<a>`, `<em>`, `<strong>`, `<code>`, etc.).

#### Scenario: Below mode
- **WHEN** display mode is `below` and a paragraph translation arrives
- **THEN** the system SHALL insert a new block immediately after the original paragraph node, containing the translated text inside a Shadow DOM root

#### Scenario: Replace mode preserves original
- **WHEN** display mode is `replace`
- **THEN** the original element SHALL be hidden via CSS but kept in DOM, and revealing it on mouse hover SHALL be possible

#### Scenario: Inline formatting preserved
- **WHEN** the original paragraph contains `<a href="...">link</a>`
- **THEN** the injected translation SHALL also include the corresponding `<a>` element wrapping the matching translated phrase, with the original `href` intact

### Requirement: Style Engine

The system SHALL allow the user to customize translated-text appearance, with the following properties available in options:
- text color
- font size (relative percentage of original)
- decoration: none / underline / dashed-underline / wavy-underline / dashed-box
- background blur effect for un-hovered translations

Style changes MUST take effect within 200 ms on already-injected paragraphs without requiring a full page reload.

#### Scenario: Underline decoration
- **WHEN** user sets decoration to `underline`
- **THEN** all injected translation elements SHALL render with `text-decoration: underline`

#### Scenario: Live style update
- **WHEN** user changes font-size from 100% to 90% while a page already has injected translations
- **THEN** the new size SHALL be applied to existing injections within 200 ms without page reload

### Requirement: Shadow DOM Isolation

All translation UI injected into the host page (translated text containers, floating button, on-page tooltips) MUST be rendered inside a Shadow DOM created via WXT's `createShadowRootUi`. Host-page CSS MUST NOT inherit into the Shadow root, and the extension's CSS MUST NOT leak to the host page.

#### Scenario: Host CSS does not affect translation UI
- **WHEN** the host page has `* { color: red !important }` and a translation is injected
- **THEN** the translation text SHALL render in the user's configured color (not red)

#### Scenario: Extension CSS does not affect host
- **WHEN** the extension uses Tailwind utility classes inside its Shadow root
- **THEN** the host page's elements outside the Shadow root SHALL retain their original styling

### Requirement: Viewport-Driven Lazy Translation

The system SHALL use IntersectionObserver to translate paragraphs only when they enter or are about to enter the viewport (rootMargin 200 px). Paragraphs outside the viewport MUST NOT trigger Provider calls until they approach the viewport.

#### Scenario: Off-screen paragraph deferred
- **WHEN** a long article has 500 paragraphs and the user has scrolled to the top
- **THEN** only paragraphs within roughly the first viewport-height plus 200 px buffer SHALL be sent for translation initially

#### Scenario: Paragraph translated on approach
- **WHEN** the user scrolls down such that a previously off-screen paragraph enters the 200 px buffer above the viewport
- **THEN** the system SHALL submit it for translation before it becomes visible

### Requirement: SPA Dynamic Content Tracking

The system SHALL use a debounced (200 ms) MutationObserver on the host page to detect newly inserted content and apply the same paragraph identification and translation pipeline. The observer MUST ignore mutations within Shadow roots created by the extension itself to avoid feedback loops.

#### Scenario: New paragraph after AJAX load
- **WHEN** a SPA loads a new article after a route change, inserting new `<p>` elements
- **THEN** the observer SHALL detect them within 200 ms and translate them according to the current mode

#### Scenario: Self-mutations ignored
- **WHEN** the extension itself injects a translation block into the page
- **THEN** the MutationObserver SHALL NOT treat the injected block as new translatable content
