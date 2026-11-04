# S-6 references (Mobbin, 4 Nov 2026)

Searched Mobbin for shipment status timelines, grouped dense lists, selection and bulk actions, and invoice drafts.
There were no saved Mercury or Cofounder collections on the connected account (only the "Clicker" collection with one
screen), so Mercury came from search. Notes are what we take, and what we refuse.

| Reference | What we take | What we leave |
| --- | --- | --- |
| [Plane, work items grouped by state](https://mobbin.com/screens/b274b760-5c97-4900-ae57-115489320c86) | Group headers that carry a state icon, a name and a count, with "+" to add into a group, and rows that stay single-line. This is the shape of **Jobs by stage**: stage name, count and (our addition) a billable sum, in pipeline order. | Its priority/assignee pill clutter in every row; the sum is ours. |
| [Mercury, transactions with a selection](https://mobbin.com/screens/bad0bbdd-bcae-4932-82fa-d42d249dd488) | A quiet, tick-box-first table; a selection raises a small floating "1 selected" bar at the bottom rather than rearranging the page. Tabular amounts, hairline rows, strikethrough plus a muted "Failed" chip for dead rows. | Floating dark bar: ours is an in-flow bar (no shadows on cards). |
| [Mercury, transactions with a money-in/out strip](https://mobbin.com/screens/868560a8-9acb-41d7-9708-82730b1257ad) | Three plain figures over the list ("Net change, Money in, Money out") with no card chrome: the summary strip. Amount cents rendered lighter than dollars. | Their colour on money: green/red in ours belongs to status. |
| [incident.io, incidents with 2 selected](https://mobbin.com/screens/2326a675-47af-4b30-a49a-97a03dbdf061) | Severity chip with a solid red fill for the one thing that's urgent ("Critical") and outlined for the rest. This is the model for the **demurrage chip**: accruing is solid red, 0-2 days is red, 3-5 amber, otherwise quiet. | Their duration column in prose ("1d 11h"): ours is a countdown chip. |
| [Shopify, order batch with Pick → Pack → Done](https://mobbin.com/screens/eafc89b4-30e4-4691-83ee-7da7150a2ac0) | A vertical stage line with the **current step expanded** and the future steps collapsed to labels; a timeline of who did what under it. Our stepper stays horizontal (ten stages), but the idea that the current stage owns the screen is the same. | Their one-column width. |
| [ZARA order status](https://mobbin.com/screens/431e59ae-6bbe-4e37-8dac-456a55cb3b3e) | The most restrained stepper: four words on a hairline, the current one bold with its date under it. Dates under stage names tell the story without icons. | Its lack of density: we show ten stages, so labels abbreviate to the width. |
| [Stripe, invoices list with filter tabs](https://mobbin.com/screens/90ed1ed3-2dff-43c5-90fd-4df445f5a64b) | Status tabs with counts above the list (All, Draft, Open, Overdue, Paid) as the first thing you see: the saved-views row. Right-aligned amount first. | Their wide empty "Frequency" column. |
| [Stripe, review invoice before finalising](https://mobbin.com/screens/eb91bdd1-f3ea-4876-8b35-16b5a7083a19) | A confirm that shows **the thing it will create** beside the choice. Gate-out's confirm is a sentence with the amount, not a bare "Are you sure". | Their PDF preview: a sentence is enough for a draft. |
| [Shopify draft order](https://mobbin.com/screens/068a5a10-0221-4070-9a4a-e66edb66aae7) | A draft's lines, then a "Payment" box with subtotal / total, then a Timeline of comments and events. Our bill already is lines + totals + activity. | Their side column. |
| [Square, shipments empty state](https://mobbin.com/screens/5a7aad19-5af4-498b-9e50-39308fe8ae28) | An empty state that says what is true ("No shipments fulfilled yet") and what will happen ("When you do, that shipment will show up here"). Our empty stages read the same: muted, one sentence. | The illustration. |

## What this changes in the build

1. **Jobs by stage** is a grouped list: stage icon-less label, count, billable sum in lakh; empty stages stay as muted one-line headers (Plane shows them; Mercury's quiet rows set the tone).
2. **The job record leads with a stepper and one chip**: a stage stepper with dates under the stages that have them (ZARA), and a demurrage chip (incident.io) with solid red only when money is accruing.
3. **Selection** raises an in-flow bar with the count and the actions (Mercury, incident.io); built in S-6 for "Assign owner".
4. **Gate-out is a confirm that names its result** ("This creates a draft invoice for Rs 12,48,500 including 3 disbursements"), after Stripe's review step.
5. **Empty states are one true sentence plus what to do** (Square).
