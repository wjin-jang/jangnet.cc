# Design Bible

This document defines the visual design system. All UI work must conform to these rules. No exceptions.

---

## Palette

Two colours, plus one functional variant. No exceptions.

- **Paper:** `#e9e3d3` — background, light surfaces.
- **Ink:** `#101033` — text, borders, dark surfaces.
- **Code-bg:** `#f5f2ea` — code block backgrounds only. A subtle paper variant for distinguishing code from prose.

These are the only colours in the entire system. No greys, no tints, no accent colours, no `rgba()` with partial alpha to fake intermediate shades. If something needs to feel lighter or secondary, use dithering (see below) or reduce font size — do not reach for `opacity` to create grey text or faded elements.

Where contrast or visual hierarchy is needed between ink-on-paper elements, use **weight** (bold vs regular), **size** (smaller text for metadata), **case** (uppercase for labels), or **inversion** (ink background with paper text) — never a third colour or transparency.

The only acceptable use of `opacity` is for interactive affordances like hover transitions where an element appears/disappears (e.g. a copy button fading in on hover). It must not be used to create a "grey" or "muted" text colour.

---

## Typography

Monospace only. Two font families:

- **Body/Headings:** `'Space Mono', monospace`
- **Code/Data:** `'Fira Code', monospace`

No sans-serif. No serif. No display fonts.

Headings are uppercase, rendered as full-width inverted bars (ink background, paper text). They are structural dividers, not floating labels.

---

## Grid

Everything is built on the master grid. Every element snaps to it. No freehand positioning.

- Spacing uses the `--pad` and `--gap` variables. All dimensions derive from these.
- Every element's width matches its parent. Nothing is narrower than its container unless it is a horizontal subdivision of an item.
- No element may be positioned outside the grid. No `position: absolute` for layout (only for overlays like captions or copy buttons within their parent item).

---

## Panels, Lists, and Items

The UI hierarchy is: **Panel → List → Item**.

### Panel

A panel is a bordered rectangular container. It is the top-level structural unit.

- A panel has `border: var(--cell)` and `box-shadow: var(--shadow)`.
- A panel contains one or more lists.
- Multiple panels can be laid out on the page using CSS grid, separated by `var(--gap)`.
- The `body` element in `style.css` is itself a panel (bordered, shadowed, single-column).
- There can be any number of panels on a page.

### List

A list is a vertical stack of items inside a panel.

- A list has no styling of its own — it is simply the sequence of items within a panel.
- Items in a list are separated by `border-bottom: var(--cell)`.
- The last item in a list does not need a bottom border if it sits against the panel edge.

### Item

An item is a single row in a list. Items are the atomic content unit.

- An item's width always matches its parent (the panel). No item is narrower than its panel.
- Items can be variable height.
- An item can be subdivided horizontally (e.g. a grid or flex row splitting into columns). Horizontal subdivisions are separated by `border-right: var(--cell)`, never duplicating borders.
- An item can contain its own nested list (creating a sub-panel within the item), but all nested content still aligns to the master grid.
- Items contain content: text, images, controls, or nested lists. Content is padded with `var(--pad)`.
- Headings are items — they are full-width inverted bars (ink background, paper text), not floating labels.

---

## Borders

No duplicate borders. When two panels or items are adjacent, they share a single border.

- Use `border-collapse: collapse` for tables.
- Adjacent items use `border-bottom` on each item — the next item does not add `border-top`.
- Horizontal subdivisions within an item use `border-right` on the left element — the right element does not add `border-left`.
- The last item in a list may drop its `border-bottom` if it sits against the panel edge.
- One border weight everywhere: `var(--bw)` (2px), solid, ink colour. No thin/thick mixing.
- Box shadows use ink colour, hard offset (`4px 4px 0` or `6px 6px 0`), no blur.

---

## Images

Images fill their item edge-to-edge.

- `width: 100%; height: auto; display: block;`
- No `border-radius`. No rounded corners. Ever.
- No padding or margin around images inside their item.
- Images sit inside an item or figure element that is itself grid-aligned.
- `object-fit: cover` or `contain` as appropriate, but the container is always grid-aligned.

---

## Icons

All icons are pixel art PNGs, scaled with smooth interpolation (`image-rendering: auto`) so they look clean at any size.

- Do not use `image-rendering: pixelated` — it looks bad at irregular scales.
- No SVG icons. No icon fonts. No Unicode symbols as icons.
- Icons use only the two palette colours (ink and paper).
- Icon containers are sized to grid multiples.
- On hover/inversion, icons use `filter: invert(1)` to swap ink↔paper.

---

## Colour Inversion

Interactive and header elements use full colour inversion rather than intermediate states.

- Headings: ink background, paper text.
- Hover states: swap to ink background, paper text. No gradual fades, no grey middle ground.
- Active/selected states: same full inversion as hover.
- Transitions should be fast (0.15s) and affect `background` and `color` together.

---

## Dithering

Where texture or visual weight is needed without introducing a third colour, use dithering.

- Dithering is achieved with CSS background patterns using `radial-gradient` dot grids (e.g. `background-size: 4px 4px`).
- Dots are ink-coloured on a paper background.
- Dithering replaces what would otherwise be grey fills or opacity-based shading.
- Use consistent dot size and spacing throughout.
- **Never place text over dithering.** Dithered areas are for empty/decorative regions only (e.g. depth markers, progress bar tracks). If an area contains readable text, use a solid background (paper, ink, or code-bg).

---

## Shape

No curves. Everything is rectilinear.

- `border-radius: 0` on everything. No rounded corners. No pills. No circles.
- No curved SVG paths.
- All shapes are rectangles or use straight lines only.
- Box shadows are hard-edged (no blur radius).

---

## Summary

| Rule | Requirement |
|---|---|
| Palette | Two colours + code-bg: `#e9e3d3` (paper), `#101033` (ink), `#f5f2ea` (code-bg). No opacity for fake greys. |
| Typography | Monospace only. Space Mono + Fira Code. Headings are uppercase inverted bars. |
| Grid | All elements snap to master grid. Item widths match their parent. |
| Panels | Bordered, shadowed containers. Body is a panel. Multiple panels allowed. |
| Lists | Vertical stack of items within a panel, separated by border-bottom. |
| Items | Full-width rows. Variable height. Can subdivide horizontally or nest lists. |
| Borders | No duplicate borders. One weight (2px). Hard box shadows, no blur. |
| Images | Edge-to-edge within cells. No border-radius. |
| Icons | Pixel art PNGs, `image-rendering: auto`, two-colour only, no SVG, no Unicode symbols. |
| Inversion | Hover/active states swap ink↔paper fully. No intermediate states. |
| Dithering | Dot-grid patterns for texture. Replaces grey/opacity. Never over text. |
| Shape | No curves anywhere. All rectangles, all straight lines. |
