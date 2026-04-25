---
name: CCF Eastwood Admin
description: Church management platform for staff tracking the full discipleship pipeline — members, groups, events, ministry, and volunteers.
colors:
  reliably-blue: "oklch(0.65 0.17 218)"
  reliably-blue-surface: "oklch(0.95 0.04 218)"
  still-water: "oklch(0.70 0.11 200)"
  deep-ink: "oklch(0.145 0 0)"
  quiet-mid: "oklch(0.556 0 0)"
  canvas: "oklch(1 0 0)"
  paper: "oklch(0.985 0 0)"
  surface-muted: "oklch(0.97 0 0)"
  hairline: "oklch(0.922 0 0)"
  danger-red: "oklch(0.577 0.245 27.325)"
typography:
  headline:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  title:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.15em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.reliably-blue}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "oklch(0.59 0.17 218)"
    textColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.reliably-blue-surface}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.md}"
  button-destructive:
    backgroundColor: "{colors.danger-red}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
    height: "36px"
  card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "20px 24px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.md}"
    height: "36px"
  input-focus:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.md}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
  nav-item-active:
    backgroundColor: "{colors.reliably-blue-surface}"
    textColor: "{colors.reliably-blue}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
---

# Design System: CCF Eastwood Admin

## 1. Overview

**Creative North Star: "The Clear Register"**

Every record in this system is a person at a specific point in their spiritual journey. The interface should be worthy of that fact — not by being ornamental or sentimental, but by being precise, calm, and completely trustworthy. Staff should be able to move through their work without thinking about the UI. The system gets out of the way.

The aesthetic is structured restraint. Density is moderate: enough information to be productive, not so much that the task becomes crowded. Whitespace is functional. Hierarchy is established through scale and weight — never through decoration. The palette is dominated by neutrals, with one deliberate voice: Reliably Blue, a mid-intensity institutional blue that appears only where there is something actionable or navigable. Still Water, a muted teal, marks positive movement in data; it signals quietly, without demanding attention.

What this system explicitly rejects: hero-metric layouts with giant numbers and gradient accents, glassmorphism, identical icon-card grids, gradient text, and every convention that reads as AI-assembled SaaS UI. The interface should not announce that it exists. It should make the work faster, and reflect the care that staff bring to managing a real community.

**Key Characteristics:**
- Moderate-density layout with clear spatial hierarchy
- Single accent color (Reliably Blue) reserved strictly for actionable elements
- Flat-to-subtly-lifted elevation — cards have presence without floating
- Geist Sans: geometric with humanist details — precise without coldness
- Label style (11px uppercase tracked) as a navigational convention, not a general treatment

## 2. Colors

The palette is intentionally narrow. One actionable blue. One positive-signal teal. Deep neutrals. Semantic red for destruction. Rarity of color is a design decision, not a budget constraint.

### Primary
- **Reliably Blue** (`oklch(0.65 0.17 218)`): The single actionable color in the system. Used for primary buttons, navigation active states, focus rings, and text links. Never decorative — it only appears where something can be clicked, navigated to, or acted upon.
- **Reliably Blue Surface** (`oklch(0.95 0.04 218)`): The ambient sibling — hover backgrounds on nav items, input focus halos, accent container backgrounds. The color of Reliably Blue at rest, spread over a surface.

### Secondary
- **Still Water** (`oklch(0.70 0.11 200)` / `#2AB9D0`): Used exclusively for positive deltas and growth signals in data displays (e.g. stat card delta lines). Not used for actions, labels, or navigation. Its restraint is its meaning.

### Neutral
- **Deep Ink** (`oklch(0.145 0 0)`): Primary text color for all content that demands reading — page titles, table cell data, form values, modal headings.
- **Quiet Mid** (`oklch(0.556 0 0)`): Supporting text — column headers, metadata, placeholder text, descriptions, icon accents. The voice of context, not content.
- **Canvas** (`oklch(1 0 0)`): Card backgrounds, modal surfaces, input backgrounds. The primary reading surface.
- **Paper** (`oklch(0.985 0 0)`): Sidebar background — a near-white that recedes behind content.
- **Surface Muted** (`oklch(0.97 0 0)`): Secondary background, hover row states, section fills. One step darker than Paper.
- **Hairline** (`oklch(0.922 0 0)`): All borders, table row separators, dividers. The minimum amount of structure.
- **Danger Red** (`oklch(0.577 0.245 27.325)`): Destructive actions and error states exclusively. Always paired with a confirmation dialog or an error message — never as the only signal.

**The One Voice Rule.** Reliably Blue appears on ≤15% of any given screen. When everything is blue, nothing is. Active nav item, primary CTA, focus ring: three uses, no more.

**The Tint Rule.** (Known gap.) The current neutral tokens carry zero chroma — pure `oklch(L 0 0)` grays. Against a blue accent they read cold. Future iterations should add a chroma of `0.005–0.008` at hue `218` to Canvas, Paper, Surface Muted, and Hairline. The fix is a single token change per color; it produces warmth without visibility.

## 3. Typography

**Body/UI Font:** Geist Sans (with `-apple-system, BlinkMacSystemFont, sans-serif` fallback)
**Monospace Font:** Geist Mono (with `ui-monospace, Menlo, monospace` fallback)

**Character:** Geist Sans is geometric but not cold — it has the structural precision of a tool font and enough humanist warmth to carry a record full of real people's names without feeling clinical. Paired with Geist Mono for IDs and tokens, the system reads as competent and direct.

### Hierarchy
- **Headline** (semibold/600, 20px, 1.3 line-height): Page titles, modal headers, section headings that anchor a view.
- **Title** (semibold/600, 16px, 1.4 line-height): Card titles, panel headers, subsection labels within a page.
- **Body** (regular/400, 14px, 1.5 line-height, max 70ch): All content — table cell data, form field values, notes, descriptions. The default text level.
- **Label** (semibold/600, 11px, 1.2 line-height, uppercase, 0.15em tracking): Stat card category identifiers, data section markers. Not for general headings.
- **Mono** (regular/400, 13px, 1.4 line-height): IDs, reference numbers, confirmation tokens, any value that should not reflow or be confused with prose.

**The Label Overhead Rule.** The 11px uppercase tracked label style is a navigational signal, not a styling option. It announces "this text categorizes the content below." Using it for general headings, card subtitles, or body-level labels collapses the hierarchy. Restrict it to stat card labels and explicit data category markers.

**The Contrast Floor Rule.** No text rendered below WCAG AA contrast ratio, regardless of size. This includes Quiet Mid on Surface Muted and Canvas — verify contrast before using muted text on any non-white background.

## 4. Elevation

The system is flat by default, subtly lifted for contained surfaces. Cards at rest carry a whisper of ambient depth that gives them presence on the page. Interactive surfaces lift slightly on hover. Floating layers (dropdowns, dialogs) are meaningfully elevated. Nothing is glassy. No background blurs.

### Shadow Vocabulary
- **card-rest** (`0 1px 3px oklch(0 0 0 / 0.07), 0 1px 2px oklch(0 0 0 / 0.05)`): Default state for all Card components. Gives the surface weight without lifting it off the page.
- **card-hover** (`0 4px 12px oklch(0 0 0 / 0.09), 0 2px 4px oklch(0 0 0 / 0.06)`): Card pointer-hover and interactive focus. A small lift to signal responsiveness.
- **dropdown** (`0 4px 16px oklch(0 0 0 / 0.10), 0 1px 4px oklch(0 0 0 / 0.06)`): Popovers, command menus, select dropdowns. Floating, but still part of the page context.
- **dialog** (`0 8px 32px oklch(0 0 0 / 0.14), 0 2px 8px oklch(0 0 0 / 0.07)`): Modals and full dialogs. The maximum shadow level in the system.

**The Flat-At-Rest Rule.** Sidebar, page background, and table rows are always flat. Cards lift slightly. Dialogs lift further. Nothing exceeds dialog-level shadow. If something seems to need more visual separation, the answer is a layout change, not a heavier shadow.

## 5. Components

### Buttons
- **Shape:** Gently curved (8px radius, `--radius-md`).
- **Primary:** Reliably Blue fill, Canvas text. `9px 16px` padding, 36px height. Hover darkens blue to `oklch(0.59 0.17 218)` with a faint blue glow.
- **Focus:** 3px ring at 40% opacity of Reliably Blue, inset 0. Keyboard-visible only.
- **Ghost:** Transparent at rest, Reliably Blue Surface on hover. Used for secondary actions and cancel paths.
- **Destructive:** Danger Red fill, Canvas text. Identical shape to Primary. Only for actions that are permanent — always preceded by a confirmation dialog.
- **Size scale:** xs (24px height), sm (32px), default (36px), lg (40px). Use sm for table row actions; default for form submission and primary CTAs.

### Cards / Containers
- **Corner style:** Gently curved (10px, `--radius-lg`).
- **Background:** Canvas white with Hairline border.
- **Shadow:** card-rest at all times; card-hover on pointer hover.
- **Internal padding:** `20px 24px` (standard), `20px` (compact stat cards).
- Never nest cards. Never use a colored left-border stripe as a card variant — use a background tint or full border instead.

### Inputs / Fields
- **Style:** Hairline stroke border, Canvas background, 8px radius, 36px height.
- **Hover:** Border color shifts toward Reliably Blue.
- **Focus:** Reliably Blue border, 3px ring at 20% opacity. Labels are always above the field — never floating or inside.
- **Error:** Danger Red border, 12px error text below the field. Paired with a color-independent signal (icon or explicit text).
- **Disabled:** Reduced opacity, cursor-not-allowed.

### Navigation
- **Items:** 14px, medium weight, 8px radius.
- **Default:** Transparent background, Deep Ink text.
- **Hover:** Reliably Blue Surface background.
- **Active:** Reliably Blue Surface background, Reliably Blue text.
- **Icon:** 16px, left of label, same color as text.
- **Sidebar width:** 16rem desktop, 18rem mobile sheet. Collapsible to 3rem icon-only on desktop.
- **Transition:** 200ms ease-linear on collapse/expand.

### Data Tables
Tables are a primary surface of this system — more time is spent in them than anywhere else.

- **Identifier column link** (name, date, or title — the primary key column in every table): `font-medium`, dashed underline, `underline-offset-2`, foreground/50 decoration color, transitions to full foreground on hover. This exact treatment is mandatory everywhere in the app, including the Event workspace. Never use `hover:underline`, plain button links, or unstyled links in this column.
- **Column headers:** 12px, medium weight, Quiet Mid. Not uppercase — that is reserved for stat card labels.
- **Row separator:** Hairline border-bottom.
- **Row hover:** Surface Muted background.
- **Selection:** Checkbox + row background shift to Reliably Blue Surface.

### Stat Cards
A signature component. Structural rules are strict because they resist the hero-metric slop pattern.

- **Label:** 11px, uppercase, tracked (0.15em), Quiet Mid. One line. Never a sentence.
- **Value:** 30px, semibold, tabular-nums, Deep Ink.
- **Delta:** 12px, medium, Still Water for positive movement. If negative deltas are needed, use Danger Red and pair with a directional icon.
- **Icon:** 16px, Quiet Mid at 40% opacity — supporting context, not the primary read.
- **Shadow:** card-rest. Same card rules apply.

## 6. Do's and Don'ts

### Do:
- **Do** use Reliably Blue exclusively for actionable and navigational elements. If it's not clickable or navigable, it doesn't get the blue.
- **Do** apply the mandatory table link style on every primary identifier column: `font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors`.
- **Do** restrict the 11px uppercase tracked label style to stat card labels and data category identifiers.
- **Do** pair all destructive actions with a confirmation dialog before executing. Hard deletes are permanent.
- **Do** apply card-rest shadow on all Card components. Apply card-hover on pointer hover.
- **Do** verify WCAG AA contrast on all text/background pairings — including muted text on muted backgrounds and text on colored surfaces.
- **Do** cap body text at 65–70ch in long-form contexts (notes, descriptions).
- **Do** use Geist Mono for IDs, reference numbers, and confirmation tokens.
- **Do** place form labels above their fields — never inside, never floating.

### Don't:
- **Don't** use gradient text (`background-clip: text` with a gradient). Prohibited in this system.
- **Don't** use glassmorphism: no blur-backed translucent surfaces anywhere.
- **Don't** build hero-metric layouts: large number, small label, gradient accent. This is AI slop UI and looks like a SaaS template.
- **Don't** use identical icon-card grids. If six domains share the same card structure, use a list or table layout instead.
- **Don't** use a colored left-border stripe (> 1px) as a card variant or alert pattern. Rewrite with a background tint or full border.
- **Don't** rely on color alone to convey meaning — status, error, or severity must always be paired with text or icon.
- **Don't** use shadows stronger than dialog-level. Escalating shadow depth is not a substitute for layout clarity.
- **Don't** skip the confirmation dialog for delete actions.
- **Don't** use `hover:underline` or `<Button asChild>` links in table identifier columns — the dashed underline convention is mandatory.
- **Don't** use the label style (11px uppercase tracked) outside stat cards and category markers. It collapses hierarchy when overused.
