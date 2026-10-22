# Design system proposal (checkpoint 1)

**Status: proposed, not applied.** Look at it rendered, in the real components, at `/dev/proposal` (`frontend/src/gallery/DesignProposal.tsx`, tokens in `frontend/src/gallery/proposal.css`). Screenshots: `docs/design/proposal/`. On approval the values move into `tokens.css` as a value change (token names are kept wherever one exists) and the proposal files are deleted.

## Decisions that are yours

These are the ones I can't judge for you. Everything else below is my call and you can overrule it.

1. **Typeface: A (keep Plex), B (Inter) or C (Geist).** My recommendation is **B, Inter**. See 1a.
2. **Row height.** The brief says "generous"; CLAUDE.md says density is the thesis and 34px. My recommendation: **keep 34px as default** and win the "calm" feeling from type, contrast and quieter dividers, and expose 42px as the existing "comfortable" mode. A Mercury-like 44–48px default would show about a quarter fewer rows.
3. **Is ⌘K in this pass?** The brief lists "⌘K search" under keyboard, but also says no new features, and your 2b brief explicitly put command palette and global search out of scope. My recommendation: **out**. I'll show shortcut hints where actions already exist (peek's `Ctrl+↵`, Esc, Enter) and not add a palette.
4. **Dark mode: tokens only, or also a switch?** Both palettes are proposed. A switch is a user-menu item and a stored preference; I'd ship tokens plus "follow the system" and leave the manual switch for later.
5. **Accent.** Unchanged (`#4a3fcf` light, `#8991ff` dark). Say so if you want it moved.

## 1. Type

### 1a. Typeface

Three options, same content, rendered at `/dev/proposal` §1. All three are SIL OFL (licence-clean).

| | Reading | Tabular nums | Mono pairing | Verdict |
| --- | --- | --- | --- | --- |
| **A. IBM Plex Sans** (today) | Wide, slightly mechanical, lower x-height | Yes | Plex Mono, by design | Coherent, but it is the face that says "enterprise software" |
| **B. Inter** | Tall x-height, tight, built for 12–14px UI | Yes (`tnum`) | Keep Plex Mono or Geist Mono | The neutral default of dense fintech UI; calms a table without announcing itself |
| **C. Geist** | Crisper and a little more geometric | Yes | Geist Mono | Slightly more character than Inter; younger, newer to long all-day use |

**Recommendation: B**, on reputation and on Inter's design brief (a UI face tuned for 12–14px), **not** on what I could see: the screenshots I can take are too small to tell Inter from Geist from Plex at 12px, so I did not judge the specimens by eye and neither should you take my word. This is a taste call. Judge on the table figures first. Keeping Plex is also a legitimate answer, and then the change that matters is the header treatment, not the face.

Whichever wins, **self-host it** (variable font via `@fontsource-variable/*`, a font package, not a UI library): removes the runtime dependency on Google (audit finding 4). CLAUDE.md names Plex, so a change of face is a CLAUDE.md edit, which I'll make on your word.

**Display voice (home greeting only):** a serif, once. Candidates rendered in §2: **Instrument Serif** (my pick; elegant, single weight, display-only), Newsreader, Source Serif 4.

### 1b. Scale

Body stays 13px. The changes: a larger page title, a real display size, and headers lose their capitals.

| Token | Today | Proposed | Use |
| --- | --- | --- | --- |
| `--text-micro` | 11 | 11 | helper text, chip labels |
| `--text-sm` | 12 | 12 | list cells, **column headers (sentence case, 500, muted)** |
| `--text-base` | 13 | 13 | body, inputs |
| `--text-md` | 14 | 14 | emphasised body |
| `--text-lg` | 16 | 16 | section headings |
| `--text-xl` | 19 | **20** | page titles |
| `--text-2xl` | 24 | **28** | empty states |
| `--text-display` | none | **34** | home greeting, serif, once |

Uppercase tracking is dropped. Numbers: `font-variant-numeric: tabular-nums` on every numeric cell (already true); **cents/decimals one step quieter** (`--text-muted`) in `decimal` and `currency` cells, a single rule in the list cell, not per module.

## 2. Colour

Method: OKLCH, hue 275, chroma 0.004–0.016. The neutral ramp gets a faint violet cast so the ink-violet accent sits inside the greys instead of on top of them. Every text pairing was checked for contrast.

### Light

| Role | Token | Value | Note |
| --- | --- | --- | --- |
| Canvas | `--ground` (new) | `#f9fafd` | tinted ground behind panels |
| Panel | `--surface` | `#ffffff` | |
| Sunken / hover | `--surface-sunken`, `--surface-hover` | `#f4f5fa` | |
| Selected | `--surface-selected` | `#ecefff` | |
| Hairline | `--border-subtle` / `--border` | `#edeef3` / `#dcdee4` | decorative, stays quiet |
| Control edge | `--border-control` (new) | `#8a8c94` | **3.35:1**, fixes audit finding 2 |
| Text | `--text` / `-secondary` / `-muted` | `#1b1c24` / `#454751` / `#60636d` | 16.96 / 9.24 / **5.99** on white |
| Accent | `--accent` | `#4a3fcf` | 7.23:1 on white, unchanged |

Full ramp `--n-0 … --n-950` is in `proposal.css`.

State colours (text on their own subtle fill): positive `#007145` on `#e3faed` **5.56**, warning `#874e00` on `#fff1de` **6.05**, danger `#963e37` on `#ffece9` **6.06**, info `#00649a` on `#e2f7ff` **5.77**. All clear AA with margin; today's sit within 0.1 of the line.

### Dark

Raised surfaces get **lighter, not shadowed**. Canvas `#0e0f13`, panel `#15161b`, raised/overlay `#1c1e23`, text `#f6f7f9` (17.9:1), muted `#a2a4ac` (7.7:1), control edge `#6f7179` (3.71:1), accent `#8991ff` (6.89:1; text on it is `#0e0f13`). States: positive `#68d7a1` on `#0e3020` **8.09**, warning `#eeb154` on `#372508` **7.73**, danger `#ff9b93` on `#3e1e1c` **7.36**, info `#66c8ff` on `#0e2c3f` **7.77**.

Activation: a `data-theme` attribute plus `prefers-color-scheme`, and the shadcn `dark:` variant pointed at it so the existing `dark:` utilities in `components/ui` finally have something to react to.

## 3. Space, radius, elevation, focus

- **Spacing:** the 4px-based scale stays. Add `--page-gutter: 24px` and a `--content-max` so layouts stop deciding widths locally (audit 11, 20).
- **Radius:** today 3/5/6/10 → **4 / 6 / 8 / 12 / pill**. Controls 6, panels 8, toasts and chips pill. Slightly softer, still small; nothing larger than 12 except pills.
- **Elevation:** cards stay border-only. Three floating levels only: `--shadow-popover`, `--shadow-drawer` (new; a long soft left edge), `--shadow-toast` (new). Dark mode replaces shadows with a lighter surface plus a 1px border.
- **Focus:** one ring everywhere, on `:focus-visible` only: 2px `--focus-ring` with 2px offset on buttons and links; the existing border-plus-halo on text-like fields (keeps what already works).
- **Scrim:** `--scrim`, one token; the three hardcoded `bg-black/10` in the shadcn dialogs move onto it.

## 4. Motion

| Token | Value | Use |
| --- | --- | --- |
| `--duration-instant` | 100ms | hover, press, focus: must feel immediate, no layout shift |
| `--duration-base` | 160ms | fades, state changes, value cross-fades |
| `--duration-slow` | 240ms | things that travel: drawer, save bar, toast |
| `--ease` | `cubic-bezier(.2,0,.2,1)` | standard |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | arriving: fast start, soft landing |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | leaving: quick exit |
| `--travel-sm` / `--travel-drawer` | 8px / 24px | slide distance: drawer fades and slides 24px, not its whole width |

`--duration-fast`/`--duration` stay as aliases so nothing breaks. **Reduced motion:** all travel goes to 0 and `--duration-slow` drops to 100ms, so a state change is a short fade rather than movement; nothing disappears. Everything animates only in response to an action (a demo at §4 of the page shows the four curves; it waits for a press).

## 5. Per-component decisions

References are in `DESIGN_REFERENCES.md`; **(brief)** means from your description, since I couldn't open Mobbin.

| Component | Decision | Reference |
| --- | --- | --- |
| **Sidebar** | Brand mark plus wordmark; section headers sentence-case 11px muted; active = selected surface + accent text + 500 (unchanged); rail gets an instant styled tooltip, not native `title` | Mercury sidebar (brief) |
| **Top bar / breadcrumbs** | Drop the app crumb when it equals the model; the page title is the last crumb and the H1 stops repeating it; avatar initial beside the name; prev/next record in the page crumb | Linear (brief) |
| **Recents / home** | Serif time-aware greeting; table full-width of a readable column (max 1120) and centred at ≥1280; sentence-case headers; empty state = ghosted rows plus one action | Cofounder home, Mercury empty state (brief) |
| **List** | Columns flex to fill (`min` and `flex`, not fixed), never overflow into a clipped column; sentence-case headers; type icon in header from the field type; muted decimals; one tab stop with arrow-key row navigation; hover-reveal row actions (open in peek, open as page) | Mercury transactions, Cofounder table (brief) |
| **Form** | Sheet centred at ≥1280 (or sheet + gutter, decided on approval); empty fields show a quiet "Set mobile…" prompt; currency prefix from the field; section headers sentence-case 12px/500 | Attio (brief) |
| **Peek** | ~480px (content-sized, token-derived), shadow-drawer, scrim stops under the top bar; header kept (kind, Edit, Open as page with shortcut); sparse forms drop the label column to a stacked layout via the existing `--form-label-width` container token | Mercury peek (brief) |
| **Save bar** | Slides 8px + fades in on first dirty field; shows "3 fields changed"; Save is the only accent-filled item; three-way leave guard (Save / Discard / Cancel) listing what changed; peek bar and page bar never both claim the same corner | Salesforce, Jira (brief) |
| **Toasts** | Inverted pill, bottom centre, icon plus one sentence, 4s, Undo for anything destructive, max three stacked | Mercury, Cofounder (brief) |
| **Fields (8 states)** | Control edge to `--border-control`; empty prompt; error: border plus 12px message plus icon (not colour alone); disabled keeps a legible label; picker: selected check, footer key hints | Attio (brief) |
| **Sign-in** | Wordmark above the card, card 360px, centred optically (40% from top), stacked labels, show-password, plain-language errors | none; my own judgement, to be checked against real examples |
| **States** | Loading: skeleton of the real layout, no spinner over content past 300ms; error/offline/session-expired each with one action | Mercury empty state (brief) |

## 6. Where the law and the surface contract are at risk, and how each item stays safe

- Every item above lands in **tokens, field components, list cells, renderers or shell**. None names a model.
- List column flexing, form centring and the peek width are **renderer layout rules driven by existing tokens**, not by container: the page and the peek each set the tokens they want (as they already do for `--form-sheet-max-width`).
- Inline edit, toasts and arrow-key navigation need **new renderer capabilities** (props and events), the same way 2b's save bar added `onStateChange`. They will each be logged as such.
