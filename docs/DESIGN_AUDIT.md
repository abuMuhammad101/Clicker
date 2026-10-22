# Design audit: before the polish pass

Run 2026-10-22. This is the "before". Screenshots are in `docs/design/before/`.

## How this was captured, and what it can't tell you

- The real app (`main.tsx`, every real component) was booted in the Browser pane at 1440×900 and 1024×768, against a **stubbed API** serving fixtures read from the database through the ORM. I have no sign-in on this machine and did not create one. So what you see is the real UI with real record shapes, but not a real session.
- Plex was loading (checked: `document.fonts` reports Plex Sans 400/500/600 and Mono 400). An earlier capture ran without the font links and fell back to a system face; those shots were discarded.
- Screenshots arrive at 800px wide, so fine type detail (1px borders, hinting) is judged from computed styles, not pixels. Where a claim is a measurement, the number is given.
- Not captured: the login at 1024 (it is a fixed-width card, nothing responsive happens), empty/error/offline/session-expired states (they exist in code; I did not force them yet), the Countries and Products pages at 1024 (same renderer as Contacts).
- Not judged: motion. Transitions don't advance reliably in this pane, so everything below about motion is from reading the CSS.

## What is already good (keep it)

- The renderer composition is right: one list, one form, derived from schema. Nothing below needs a per-model fix.
- Row hairlines, no zebra, no card shadows, tabular figures already on: the "quiet surfaces" brief is half-met by existing decisions.
- The accent is used once (primary button, active nav, dirty state). Status colours are kept separate from it. This is the single best decision in the system.
- Focus on fields is clear (violet border plus a thin halo) and the 8 field states are all present and legibly different (`1440-gallery-text-states.jpg`).
- Readonly vs disabled genuinely look different. Loading is a skeleton in the shape of the input.

## Findings, worst first

### Systemic

1. **There is no dark mode, and the shadcn components can't reach one.** `tokens.css` defines light only. The shadcn files in `components/ui` carry `dark:` utilities that nothing ever activates. The brief asks for light and dark.
2. **Input borders fail WCAG non-text contrast.** `--border` (grey-20) is **1.31:1** on white; 1.4.11 asks 3:1 for the edge that identifies a control. Row hairlines are decorative and can stay that quiet; control edges can't.
3. **Hardcoded values live in the shadcn files.** `bg-black/10` scrims and `duration-100` in dialog and alert-dialog, `duration-100` in popover and select, `rounded-xl` on dialogs (a 12px radius that isn't in the token set), `shadow-md` and `ring-foreground/10` on popovers. These bypass `tokens.css` and will not follow it into dark mode.
4. **Fonts come from Google's CDN at runtime.** Render-blocking third party, a flash of fallback face on first load, no offline, and a privacy cost for an app that will hold customer data. Self-hosting is the fix whichever face wins.
5. **Motion is one duration and one easing.** `--duration` 140ms for everything; the peek drawer, the sidebar and field hovers all share it. There is no distinction between "feedback must feel instant" (hover, press) and "something travels" (drawer, bar, toast). The save bar swap has no transition at all.
6. **No toast system, no undo, no keyboard row navigation, no row hover actions.** Absent rather than wrong (they are in the brief's micro-interaction list), but worth stating: system response today is a banner in the form header and nothing else.

### Shell

7. **Duplicated wayfinding.** The top bar says `Contacts › Contacts › Acme Corporation` (the app and the model share a name) *and* the page repeats the record title as its H1. On the list: breadcrumb `Contacts › Contacts`, then H1 `Contacts 12`. On Recents: top bar `Recent`, H1 `Recent`. The same word three times on one screen is noise, not orientation.
8. **The brand is the word "Clicker" in 13px semibold.** No mark, no weight. The first thing on every screen is the least designed thing on it.
9. **The rail (collapsed, and the default below 1100px) is icons with native `title` tooltips.** Native tooltips take about a second to appear and cannot be styled. With three modules this works; the first time two models share an icon it won't.
10. **The top bar is a thin strip with a name and a chevron.** No avatar, no initial; the centre is empty by decision (correct) but nothing else on the bar earns its 44px.

### Recents (home)

11. **The table is capped at 960px and left-aligned, so at 1440 the right 40% of the screen is empty** (`1440-recents.jpg`). It reads as a leftover, not a layout.
12. **No voice.** The home screen is the one place the product can speak to a person, and it says "Recent" in the same 19px as every other title. No greeting, no sense of time or state.
13. **Column headers are 11px uppercase with tracking** (`RECORD  TYPE  MODULE  VIEWED`). Shouting caps on a four-column list is the clearest "enterprise software" tell on the screen.
14. **The empty state is a sentence.** No ghosted rows, no single next step.

### List

15. **Columns have fixed widths that don't respond.** At 1440 they leave ~170px of dead space after the last column; at 1024 with the rail they **overflow: the Country column is clipped and a horizontal scrollbar appears** (`1024-list-contacts.jpg`). The same renderer is wrong at both ends.
16. **The only header affordance is a sort arrow.** No type icons in headers (Cofounder's table), no resize hint. (Correction: I first wrote that list headers were uppercase. They are sentence case already; the capitals are on Recents' headers and the form's section labels only.)
17. **Numbers are not yet the hero.** Sales price right-aligns, but there is no muted-decimal treatment (the gallery shows `1,234.50` and `-42.50` in one weight and one grey). In the stub every price is empty, so the column is a column of em dashes; I couldn't judge real money. Flagging that this is unverified, not fine.
18. **Every row is a tab stop.** `tabIndex={0}` on each virtual row means a 300-row list is 300 Tab presses. Arrow-key row navigation (one tab stop, arrows inside) is the right model and is absent.
19. **Row affordance is only a hover tint.** Nothing says a row opens a record or that there is anything else to do with it.

### Form

20. **The sheet is left-aligned at ~500px, so at 1440 about 60% of the canvas is empty** (`1440-form-contact.jpg`). The earlier decision (061c5fe) to left-align was deliberate; the cost is a lopsided page.
21. **Empty fields and filled fields look alike.** An empty Mobile is an empty outlined box; there is no "Set mobile…" prompt, so a half-filled record reads as a broken one. Attio's placeholder pattern is the model.
22. **Hierarchy is flat.** Title 19px, section labels 11px caps with a hairline, labels 13px muted. The only tools doing the work of hierarchy are size steps of 1–2px and a few close greys.
23. **Monetary fields carry no currency context** (Sales price, Cost): a bare box.

### Peek

24. **The drawer is 652px wide** (label 168 + gap 16 + field 420 + padding 48, all from tokens), which is **45% of a 1440 screen and 64% of 1024**. That is a split view, not a peek. The scrim dims the *whole* app, top bar included.
25. **A form in a void.** The drawer reuses the form's 168px label column, so a two-field Country sits on the right with a wide empty left gutter (`1440-peek-view.jpg`).
26. **The page's Save and Discard become unreachable while a peek is open.** With both dirty (`1440-peek-dirty-page-dirty.jpg`) the page's actions sit exactly where the drawer and scrim are. Both bars say "Unsaved changes" and only one can be pressed.
27. The header is good: kind label, Edit, "Open as page" with its shortcut shown, close. The shortcut hint is the right pattern and should be copied elsewhere.

### Save bar

28. It is a full-bleed tint swap with the same words. It doesn't say *how much* is unsaved, doesn't arrive (it appears), and "Unsaved changes" in accent violet competes with the primary Save beside it.

### Sign-in

29. **A ~210px card floating at 15% from the top of an empty page** (`1440-login.jpg`). No mark, a left-aligned label column on a two-field form, no show-password, no sign of what the product is.

### Fields (the 8 states)

30. **Default, filled and required-and-empty differ only by text and an asterisk.** That is correct by the spec (required-and-empty is not an error) but at 1.31:1 borders they are hard to tell apart at a glance (see finding 2).
31. **Disabled is flat grey with 2.38:1 text.** Disabled is exempt from WCAG contrast, but it is also the state people most need to *read* ("why can't I edit this?").
32. **The picker menu has no selected-row check, no keyboard hint footer and no recent items.** It works and looks like a stock combobox.

## Contrast, measured (WCAG 2.x, current tokens)

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `--text-muted` (grey-60) on white | 5.02 | AA |
| `--text-muted` on `--surface-sunken` | 4.72 | AA |
| `--text-muted` on `--surface-hover` | 4.55 | AA, barely |
| accent on white / on accent-subtle | 7.23 / 6.25 | AA and AAA |
| white on accent (button) | 7.23 | AAA |
| positive / warning / danger / info on their subtle fills | 4.58 / 4.58 / 5.19 / 4.74 | AA, all within 0.1 of the line |
| `--text-disabled` on white | 2.38 | exempt (disabled) |
| `--border` on white | **1.31** | **fails 1.4.11 for control edges** |
| `--border-strong` on white | 1.70 | fails 1.4.11 |

## Type in use

13px body, 12px cells, 11px headers/helpers, 19px titles, Plex Sans 400/500/600. The scale is coherent. The issue is voice, not size: 11px uppercase is doing too much work as the only way to demote a label.

## Verdict

The structure is sound and the bones of the system (token discipline, one accent, quiet surfaces) are right. What reads as unfinished is: **composition at wide widths (three screens leave half the canvas empty), wayfinding repeated three times, headers in capitals, no dark mode, control edges too faint, and a peek that is a split view.** None of it needs a new feature; most of it is tokens and two renderer layout rules.
