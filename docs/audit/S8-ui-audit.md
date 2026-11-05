# S-8 UI audit

`scripts/audit.mjs` (Playwright, axe-core 4.10.2 vendored in `scripts/vendor/`, no CDN) over 28 screens, as 12 demo roles across both journeys, light and dark, at 1280x720, 1366x768, 1440x900 and 1920x1080 (224 screen-states per run), plus forced states at 1440x900. Raw results: `docs/audit/raw/findings.json`. Screenshots of every screen at 1280 and 1440 are written to `docs/audit/shots/` (git-ignored: about 100 files); the evidence worth keeping is in `docs/design/s7/viewports/` and `docs/design/s8/`.

**Final run (full matrix, then the two screens it flagged re-run across all eight viewport and theme combinations): 0 P0, 0 P1, 3 P2 (deferred).**

## What the script checks

axe (WCAG 2.0, 2.1 and 2.2 AA plus best practice: contrast incl. dark, names, labels, headings, landmarks, duplicate ids, ARIA validity, target size) and, in the page: target size under 24px and overlapping targets; clipped text (a chip, an amount, a date or a document number may never clip; anything else clipped must expose its full value); fonts (Plex Mono only on identifiers, Inter elsewhere, the serif only in the greeting), font sizes against the token scale, tabular figures on numeric columns, radii and spacing against the token scales, transition durations against the motion tokens; nothing animating unprompted and skeletons still under `prefers-reduced-motion`; landmarks and a live region; visible text with `undefined`, `null`, `[object`, ISO timestamps or snake_case; horizontal page scroll; cumulative layout shift per screen (over 0.05 fails). At 1440 light, per screen: a keyboard pass of 45 Tab presses (visible focus ring, focused element not covered, no trap) and Esc on the view menu, the user menu and the peek drawer (closes, focus returns). Forced states: empty search, 404 record, slow list (skeleton), 500 and 403 screens, offline, hover without layout shift, an empty new form, a required value missing, reduced motion.

## Findings

| id | sev | what | screens, roles | fix | status |
| --- | --- | --- | --- | --- | --- |
| S8-01 | P0 | Status chips cut in a list ("Documents in", "Disconnection ordered", "Instalment plan") | Jobs, Recovery cases; Coordinator, Field agent, Recovery officer | chip columns never narrower than their longest label (page lists up to 196px; a 660px related list keeps its chips, which say their full value on hover) | fixed |
| S8-02 | P0 | A row's open-as-page and edit controls sat outside any cell | every list | wrapped in a cell | fixed |
| S8-03 | P0 | A server error showed the server's own words | any list, 500 | a fixed sentence for every 5xx ("Something went wrong on our side.") | fixed, `api.ts` |
| S8-04 | P1 | `aria-expanded` on group rows (not valid on a table row) | Bills aging, Jobs by stage, Recovery cases by stage | the state lives on a button inside the row | fixed |
| S8-05 | P1 | The calculated and write-once marks had a label but no role | statements, jobs | `role="img"` | fixed |
| S8-06 | P1 | Links in list cells were 16px tall | all lists | the link fills the cell's height | fixed |
| S8-07 | P1 | Filter chip remove and Clear, sidebar group toggles, breadcrumbs, the brand link and "View all" under 24px | lists, shell | 24px minimum | fixed |
| S8-08 | P1 | Filter chips 22px tall inside | lists | chip height counts its borders | fixed |
| S8-09 | P1 | Columns jumped sideways when a list first painted (CLS 0.106 Team, 0.057 Jobs) | Team, Jobs | width measured before paint | fixed |
| S8-10 | P1 | No live region on the home page | Home | the notifications region is always there | fixed |
| S8-11 | P1 | A person's name was a link to a page the reader cannot open (404 and a console error behind it) | Recovery cases as Recovery officer | a person is named, never linked | fixed |
| S8-12 | P1 | A selection chip cut without its full value | Disbursements | title | fixed |
| S8-13 | P1 | "This field may not be null." on a missing required client | new job | "Choose a client." / "Goods can't be empty." | fixed, with a test |
| S8-14 | P1 | Home jumped when the welcome and "Waiting for you" arrived (CLS 0.062) | Home | the page is drawn once, whole | fixed |
| S8-15 | P1 | The copy button on a record's identifier was 22px wide | records | 24px minimum | fixed |
| S8-16 | P1 | The group toggle button 17px tall | grouped lists | fills the row | fixed |
| S8-17 | P2 | Recently-viewed rows were links with `role="row"` | Home | plain links in a labelled section | fixed |
| S8-18 | P2 | Search input padding 34px is off the spacing scale | list toolbar | tied to the icon's width | deferred |
| S8-19 | P2 | The amount input's left padding 36.6px (currency symbol) | job and bill forms | the symbol's width | deferred |
| S8-20 | P2 | A third off-scale padding on a control internal | forms | | deferred |

Reported by the script and judged not defects: the date input's calendar button overlaps its own field by design (exempted); the 401 from the "who am I?" probe before sign-in (not counted).

**Counts: found P0 3, P1 13, P2 4. Fixed P0 3, P1 13, P2 1. Deferred: 3 (all P2, S8-18 to S8-20).**

## What this audit did not cover (said plainly)

- The human-style pass was done on the screens opened for these fixes: the statement, Jobs by stage, the job record and its stepper, the gate-out confirmation, the Home page, the tour cards, the sign-in screen and the Waiting for you cards, each in light and dark at 1280, 1366 or 1440. It was not done on all 28 screens. Optical alignment, baseline mismatches and doubled hairlines are therefore *not* certified across the product.
- Long content (60+ character names, long addresses) was not forced: no record with such content was created. The script's clipping rule is what protects it.
- Hover is checked for layout shift on a list row only; pressed, disabled and read-only states are not forced one by one.
- Keyboard order, Esc and focus return are exercised at 1440 light only; contrast and everything else at all eight combinations.
- Urdu text expansion (+40 percent) was not tested.
- The audit runs against the Vite dev server, as the demo does; a production build was built and its tests run, but not audited.
