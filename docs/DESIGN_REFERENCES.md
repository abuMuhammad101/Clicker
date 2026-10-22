# Design references

## Read this first: what I could and couldn't open

- **No Mobbin MCP was available in this session**, and every Mobbin link in the brief returned **403 Forbidden** in the Browser pane (it is bot-blocked or needs a login I don't have; I did not try to sign in).
- So **I have not seen any of the Mobbin screens.** The "what we take" column below is built from your own descriptions in the brief of each screen, which you vetted, plus what I know of those products in general. Each row is marked **(brief)** when it rests on your description, or **(general)** when it rests on my own knowledge of a public product.
- I won't invent links. Rows carry the Mobbin URL from the brief where the brief supplied one, and a product name only where I have no verified URL.
- Step 1 of the research ("go find what I haven't") is **not done** beyond naming candidates. If you can paste the Mobbin screens as images, or add the Mobbin MCP, I'll replace the (brief) and (general) tags with what I actually saw.

Nothing is cloned. Every "take" is a principle, stated in Clicker's own terms.

## Decisions, with source

| Decision | Source | What we take | Why it fits Clicker |
| --- | --- | --- | --- |
| Sentence-case, muted column headers (not uppercase micro) | Mercury transactions (brief): https://mobbin.com/screens/0ed937d6-2d8c-4339-80a7-39382499d3cb | Header text demoted by colour and weight only | Removes the loudest "enterprise" tell without losing hierarchy; frees the uppercase treatment for nothing, which is fine |
| Muted cents, tabular, right-aligned amounts; struck-through failed amount | Mercury transactions (brief): https://mobbin.com/screens/b83e3032-537b-4bad-8449-830cb416fa79 | Decimals one step quieter than whole units; state shown by a strike plus a pill | `decimal` and `currency` are registry types; one list-cell rule covers every module |
| Status as pill, amber for "needs a human" | Cofounder home (brief): https://mobbin.com/screens/477807cf-a7d0-4171-97e9-fb3648d36cc4 | Warning amber reserved for "requires approval"-class states | Matches the existing rule: status colours carry meaning, the accent never competes |
| Warm, time-aware serif greeting on home only | Cofounder home (brief) | One display serif, once, copy that depends on time of day | The only place Clicker can speak; the "Recent" H1 is replaced, not supplemented |
| Quiet canvas, hairlines, almost no shadow, one accent | Mercury home (brief): https://mobbin.com/screens/7fec2a74-4e68-4f3a-ae6e-91ed9d4279d2 | Tinted ground under white panels; borders do the separating | Already the Clicker rule ("no shadows on cards"); the ramp just gets a faint violet cast so the accent belongs |
| Right drawer with a timeline header; list stays put | Mercury record peek (brief): https://mobbin.com/screens/ed84df94-2b05-4afc-b05f-49213b391967 | A narrow drawer (~480px), content-sized, not half the screen | Our peek is 652px today; this is the single biggest peek fix |
| Placeholder prompts on empty properties ("Set description…") and inline edit | Attio record page (brief): https://mobbin.com/screens/cf4f2b49-652f-4c76-8a7c-1ea4f57c10cf | Empty field shows a quiet, action-phrased prompt | Fixes "empty looks broken"; a registry-wide rule, since every field type has an empty state |
| Properties panel and breadcrumb with prev/next record | Linear issue (brief): https://mobbin.com/screens/cef36326-d8ec-4c6f-acd4-a9f1e1060d33 | Prev/next in the page breadcrumb only; **not** a properties panel | Prev/next is cheap and uses the list order we already have; a properties layout is a new form layout, out of scope |
| Three-way leave guard (Save / Discard / Cancel) | Salesforce unsaved changes (brief): https://mobbin.com/screens/ff8c986b-e12e-4bee-8b31-53740c045b5f | Exactly three actions, Cancel is the default focus | Today the guard is two-way ("Discard & leave" / stay); adds the middle path |
| A diff of what changed in the guard | Jira (brief): https://mobbin.com/screens/29e2f1b6-8fb3-434a-9714-1a21e2440393 | Count in the save bar; names of changed fields in the guard | The form already knows the dirty set (the per-field dot); surfacing it is free |
| Toast: dark pill, check icon, bottom centre, short sentence | Mercury toast (brief): https://mobbin.com/screens/574c5d93-76a0-4cfb-834f-4d16021821f1 and Cofounder "Task archived" (brief): https://mobbin.com/screens/2687fda8-2a42-4685-bc7e-8c57fb35bc3d | Inverted colours, one icon, one human sentence, optional Undo | Inversion makes it read as the system speaking, not a page element |
| Empty state: ghosted skeleton rows plus one CTA | Mercury empty state (brief): https://mobbin.com/screens/4328a055-c9d1-4466-9c90-d6b723ec7f2c | Skeleton of the real layout, one button | Same skeleton component the loading state already uses |
| Footer key hints in overlays | Mercury command palette (brief): https://mobbin.com/screens/02863cc8-6f0c-4f12-8ee8-7225e88c5445 | A one-line row of key hints at the bottom of the picker and drawer | Our peek already shows `Ctrl+↵`; extend to the picker. **The palette itself is not in this pass** (see the checkpoint note) |
| Table inside a card with column-header icons | Cofounder table (brief): https://mobbin.com/screens/be233513-441d-4800-a255-966ccb27b3db | Small type icon per column header, derived from field type | Field type is already in the schema, so the icon is free and per-type, never per-model |
| Pill quick actions, saved views, filter chips, summary strip, chart toggle | Mercury home / transactions (brief) | **Not taken** | New features, not polish. Parked |

## Candidates to look at for the gaps, not yet opened

These are names for the list you asked me to widen; none were viewed.

| Gap | Candidate (general) |
| --- | --- |
| Date picker | Linear's date popover; Stripe Dashboard's range picker; Cal.com's calendar |
| Combobox / select | Linear's status picker; Radix/shadcn Command pattern |
| Inline-edit cells | Airtable; Attio; Notion table |
| Bulk-select bar | Linear (floating bar on selection); Gmail (header swap) |
| Skeletons / error states | Stripe Dashboard; Vercel dashboard |
| Undo toasts | Gmail "Undo"; Linear |
| Hover-reveal row actions | Linear; Notion |
| Keyboard hints | Raycast; Linear |

I would not take these from a name alone. They need to be opened, and that needs Mobbin access or screenshots.
