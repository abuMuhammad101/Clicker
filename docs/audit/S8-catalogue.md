# S-8 catalogue: what a senior enterprise designer would add, ranked

Score = (impact on the demo, 1 to 5) x (impact on perceived enterprise quality, 1 to 5) / (cost, 1 to 5). Cost is hours of a person who knows the code: 1 is under an hour, 5 is a day. Everything built is generic (a schema or manifest declaration plus one renderer feature), tokenised, light and dark, tested, and covered by `scripts/audit.mjs`.

## Built in S-8

| Item | Score | Where |
| --- | --- | --- |
| Guided tour: manifest as data, permission-filtered endpoint, one engine, pause and resume, skip for good | 5x5/5 = 5.0 | `tours/*.json`, `foundation/tours.py`, `features/tour/` |
| Welcome (who and where, once) and "Waiting for you" (counts derived from workflows and grants) | 5x5/3 = 8.3 | `foundation/waiting.py`, `shell/Welcome.tsx` |
| User menu: role under the name, Light / Dark / System | 3x4/1 = 12.0 | `shell/TopBar.tsx`, `lib/theme.ts`, `index.html` |
| Keyboard shortcut sheet (`?`) listing only shortcuts that work | 2x4/1 = 8.0 | `shell/HelpMenu.tsx` |
| Help menu: take, pick up and restart the tour; shortcuts | 4x4/2 = 8.0 | `shell/HelpMenu.tsx` |
| Sign-in words: never says which half was wrong; lockout says how many minutes; "Can't reach Clicker"; "You've been signed out."; caps-lock warning; return path checked on the server | 4x5/2 = 10.0 | `accounts/views.py`, `features/auth/` |
| Session-expired dialog in the new words | 2x3/1 = 6.0 | `SessionExpiredDialog.tsx` |
| Group rows that screen readers can open and close, a live region that is always there, named info marks | 1x4/1 = 4.0 | `ListRenderer.tsx`, `Toaster.tsx`, `FieldShell.tsx` |
| Click targets of at least 24 px (links in cells, filter chips, breadcrumbs, sidebar groups) | 1x4/1 = 4.0 | CSS |
| No layout jump when a list first paints | 2x4/1 = 8.0 | `ListRenderer.tsx` |
| A person is named, never linked, where they cannot open the record (no dead link, no 404 behind a name) | 2x4/1 = 8.0 | `schema/engine.py` |

Already in the product before S-8 (checked by the audit, not rebuilt): toast system with undo, offline banner, designed 404 and error screens with Retry, info tips on calculated (Sigma) fields, "Restricted" for a value you may not see, filtered-empty versus truly-empty lists, saved views, density toggle, unsaved-changes dialog, the session-expired dialog.

## Not built, and why (the cut line)

The Part 4 box ended with the tour, the welcome and the audit fixes ahead of these, so these are cut whole, none half-built. In order of score:

| Item | Score | Why not now |
| --- | --- | --- |
| Copy an identifier on click, with a toast ("Copied JOB-2026-0007") | 3x3/1 = 9.0 | Cheap; first in line for the next session |
| Command palette (Cmd/Ctrl+K: jump to a list, a record, a saved view) driven by the registry | 5x5/4 = 6.3 | The registry and a `command` component already exist; a day of work to do it properly (records search, saved views, permitted actions) |
| Session-timeout warning two minutes before expiry (extend or sign out) | 2x4/3 = 2.7 | Needs the server to say when a session ends; the demo sets 36 hours |
| 409 conflict wording ("Someone else changed this. Review their change or keep yours.") | 2x4/3 = 2.7 | Optimistic locking is on the S-3 cut list, so there is no conflict to word yet |
| Printable bill | 3x3/3 = 3.0 | Cut earlier, still cut |
| 500 screen with a request id | 1x3/2 = 1.5 | The Retry is there; the id needs a middleware |
| Document title per record, favicon while saving | 1x2/2 = 1.0 | Containers own the page chrome; a small, careful change |
| Presenter shortcuts (one-click sign-in as a demo role) | 3x2/4 = 1.5 | Cut on the brief's own terms: an endpoint that signs in without a password is exactly what the security rules forbid unless it is perfectly fenced, and a fence that is not perfect is worse than typing a password |
| Urdu-ready text expansion (+40 percent labels) | 1x3/2 = 1.5 | Not checked; the audit script does not yet widen labels |
| "Username or email" on the sign-in screen | 2x2/3 = 1.3 | The account is found by username; email sign-in needs a backend authenticator and a uniqueness rule on email |
