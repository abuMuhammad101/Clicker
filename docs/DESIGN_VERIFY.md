# Design pass: verification, stated plainly

2026-10-22. Everything below was checked against the real components running in the Browser pane with a **stubbed API** (no sign-in exists on this machine and I did not create one). Screenshots are 800px wide.

## Checked, and how

| Claim | Evidence |
| --- | --- |
| Type-check, lint, build | `npx tsc -b` clean; `npm run lint` shows the same 6 warnings as before the pass (two new ones I introduced were fixed); `npm run build` succeeds |
| Light and dark render | `/dev/tokens` and the list with a peek open, both modes |
| Text contrast ≥ 4.5:1 | Computed from tokens (light muted 5.99, accent 7.23, status 4.58–6.06 on their fills; dark 7.26–17.87); measured on live elements: cell text 16.96 / 16.85, type chip 5.51 / 8.9, breadcrumb 16.25 / 17.87, placeholder 5.99 / 7.26 (light / dark) |
| Control edge ≥ 3:1 | Measured 3.35 (light) and 5.38 (dark) against the surface |
| Every button, link and input has an accessible name | DOM scan of the list page: 0 unnamed; 0 positive `tabindex` |
| List is one tab stop, arrows move rows | Exactly one row has `tabindex=0`; ArrowDown ×2, End, Home land on rows 2, 11, 0 |
| Enter opens a peek, the list stays, the row is marked; Esc closes and focus returns to the row | Observed in the DOM: `?peek=…`, list still mounted, `.list-row--open` = 1, `document.activeElement` is the row after Esc |
| Inline edit: commit, revert, rollback | Pencil, input, Enter sent one PATCH, the cell showed the new value and a check; Esc sent none; a rejected value rolled back and raised "Couldn’t save city. This value isn’t valid." |
| A peek's save shows in the list | Edited City in a peek, saved, the list cell changed from London to Manchester |
| Both save bars reachable at once | Page bar and peek bar both present and clickable with a peek open over a dirty page |
| Offline banner and toast stack | Spoofed `navigator.onLine` and the `offline` event; banner and three stacked toasts (max three) including Undo |
| Columns fit at 1440 and 1024 | `scrollWidth === clientWidth` at 1440, at 1024 expanded and at 1024 on the rail; before the pass the last column was clipped at 1024 |

## Not verified

- **A real session.** Sign-in, CSRF, session expiry and the real server saving anything. The stub returns what the real API returns in shape, not in behaviour.
- **Any motion.** The pane doesn't advance transitions or animations, so the drawer slide, save-bar arrival, toast in/out, tooltip fade and the cell "saved" warm-up were never watched. They are specified in tokens and written in CSS; I have not seen them run. A screen recording by you would settle this.
- **A real Tab key.** The keyboard checks above use dispatched key events on real elements. I did not press Tab through sign-in, Recents, list, peek, edit, save.
- **Focus rings** on every control, visually. The CSS exists for each; I did not look at each.
- **Reduced motion.** The tokens zero movement under `prefers-reduced-motion`; I could not toggle the preference.
- **F2 to edit, blur-to-commit, decimal and integer inline validation, the "Back online" toast, toast pause on hover.**
- **Screens not re-captured after:** 1024 form, 1024 peek, 1024 sign-in, Countries and Products pages, the Recents and list empty states, the session-expired dialog.
- **Other browsers.** Chromium only.
- **Backend tests were not run.** The backend was not touched in this pass, and the frontend has no test suite; `tsc -b`, lint and build are the only automated checks.

## The surface contract and the law, reviewed

Renderer diff since the pre-pass commit (`21d571f`): `FormRenderer.tsx`, `FormRenderer.css`, `ListRenderer.tsx`, `ListRenderer.css`, `useRecordWindow.ts`, plus new `InlineEditor.tsx` and `inlineEditable.ts`.

- **No model names in any renderer.** The only matches in `frontend/src` outside `gallery/` are in `features/schema-viewer/SchemaViewer.tsx` (a hardcoded list of `core.contact` and `core.country`) and a comment in `peekUrl.ts`. **SchemaViewer is a pre-existing violation of the law, dev-only and not part of this pass; I did not touch it. It should be fixed.**
- **No container names in logic.** `ListRenderer` now asks for `surface: 'peek'` on a row click. That names a *surface kind*, which the contract allows, and `openRecord` falls back to `page` if no peek is registered; but it is a decision the list now makes. If you'd rather the list ask for the default surface and let a container choose, that is a one-line change.
- **New renderer capabilities, all as props, events or the shared bus:** `FormState.changes` (count), the record-changed signal (`records/changes.ts`: forms and lists emit and listen; neither knows the other), and `useLocation()` in the list (to mark the open row).
- **Peek and page behave identically** for the save bar, fields, toasts and tokens: both come from the same components and tokens.
