#!/usr/bin/env node
// Drives each demo journey end to end as the real roles, through the real UI, and exits non-zero on any failure.
//
//   scripts/demo_setup.sh --fresh && scripts/demo_stack.sh both && node scripts/rehearse.mjs [water|clearance|both]
//
// Needs both stacks up (scripts/demo_stack.sh both) on freshly seeded databases. Passwords are read from .env at
// run time, typed into the real sign-in form, and never printed. A failure saves a screenshot under
// docs/design/s7/failures/ and stops the run with exit code 1.
import { Person, launch } from './lib/browser.mjs'
import { check, equal, openList, openRecord, pageText, pickView, rows, settle, sidebar, step, summary, waitForText } from './lib/steps.mjs'

const which = process.argv[2] ?? 'both'
const started = Date.now()
const browser = await launch()
const people = []
const person = async (journey, username, options) => {
  const p = await new Person(browser, journey, username, options).open()
  // Anything that went wrong before sign-in (the 401 of "who am I?") is not a scene's business.
  p.consoleErrors.length = 0
  p.badResponses.length = 0
  people.push(p)
  return p
}

const textOf = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim()

async function ledger(p, label) {
  await step(`${label}: no console errors, no unexpected 4xx/5xx`, p, async () => {
    check(p.consoleErrors.length === 0, `console errors: ${p.consoleErrors.join(' | ')}`)
    check(p.badResponses.length === 0, `unexpected responses: ${p.badResponses.join(' | ')}`)
  })
}

// ------------------------------------------------------------------------------------------------ Journey A

async function journeyA() {
  console.log('Journey A: the water board (clicker_demo)')

  const manager = await person('water', 'ayesha.khan')
  const mp = manager.page
  await step('A1 Manager opens the aging view', manager, async () => {
    await openList(manager, 'billing/bill')
    await pickView(manager, 'Aging')
    const text = await pageText(manager)
    for (const band of ['Not yet due', '0–30 days', '31–60 days', '61–90 days', '91–180 days', 'Over 180 days']) {
      check(text.includes(band), `the aging view has no "${band}" group`)
    }
    check(/Outstanding\s*Rs\s?[\d.,]+ crore/.test(text), 'the summary strip should show Outstanding in crore')
  })

  let customerId
  await step('A2 Manager opens Federal Steel’s statement', manager, async () => {
    customerId = await openRecord(manager, 'core/contact', 'Federal Steel')
    const text = await pageText(manager)
    check(/Federal Steel Corporation \(demo\)/.test(text), 'the statement is not Federal Steel Corporation')
    check(/Outstanding\s*Rs\s?[\d,]+\.\d\d/.test(text) && /Oldest overdue/.test(text), 'the statement strip (Outstanding, Oldest overdue) is missing')
    check(/Bills\s*\d+/.test(text) && /Payments\s*\d+/.test(text), 'the statement’s Bills and Payments lists are missing')
  })

  // The bill the next payment must reach first: the customer's oldest posted bill that still has a balance.
  const oldestOpenBill = async (p) =>
    p.page.evaluate(async ({ customer }) => {
      const base = location.origin.replace('5273', '8200')
      const response = await fetch(`${base}/api/data/billing/bill/?customer=${customer}&limit=500`, { credentials: 'include' })
      const body = await response.json()
      const open = body.results
        .filter((b) => b.values.state === 'posted' && Number(b.values.balance) > 0)
        .sort((a, b) => (a.values.due_date + a.display).localeCompare(b.values.due_date + b.display))
      return open[0]?.display ?? null
    }, { customer: customerId })

  const cashier = await person('water', 'imran.siddiqui')
  await step('A3 Cashier posts a payment and it lands on the oldest bill first', cashier, async () => {
    const oldest = await oldestOpenBill(cashier)
    check(oldest, 'the customer has no open bill to pay')
    const p = cashier.page
    await p.goto(`${cashier.base.app}/billing/payment/new`)
    await p.locator('form.form-sheet').waitFor()
    await p.getByRole('combobox', { name: /Customer/ }).click()
    await p.keyboard.type('Federal Steel')
    await p.getByRole('option', { name: /Federal Steel/ }).first().click()
    await p.getByLabel(/^Amount/).fill('1000')
    await p.getByLabel(/^Reference/).fill(`REH-${Date.now()}`)
    await p.getByRole('button', { name: 'Save' }).click()
    await p.waitForURL(/\/billing\/payment\/\d+/)
    await settle(p)
    await p.getByRole('button', { name: 'Post' }).click()
    await waitForText(cashier, /Allocated to \d+ Bill Amount Reversed BILL-/)
    const text = await pageText(cashier)
    check(/Allocated to bills\s*(\u03A3\s*)?Rs 1,000\.00/.test(text) && /Advance\s*(\u03A3\s*)?Rs 0\.00/.test(text), 'the whole Rs 1,000.00 should be applied to bills, none held as advance')
    const allocation = text.slice(text.search(/Allocated to \d+ Bill/))
    check(allocation.includes(oldest), `the payment should reach ${oldest} (the oldest open bill) first: ${allocation.slice(0, 160)}`)
    check(/Draft Posted/.test(text) || /Posted/.test(text), 'the payment should read as posted')
  })
  await ledger(cashier, 'Cashier scenes')

  const officer = await person('water', 'bilal.ahmed')
  let adjustmentUrl
  await step('A4 Billing officer requests a write-off', officer, async () => {
    const p = officer.page
    await p.goto(`${officer.base.app}/billing/adjustment/new`)
    await p.locator('form.form-sheet').waitFor()
    await p.getByRole('combobox', { name: /^Bill/ }).click()
    await p.keyboard.type('BILL-2026-00002')
    await p.getByRole('option', { name: /BILL-2026-00002/ }).first().click()
    await p.getByRole('combobox', { name: /^Kind/ }).click()
    await p.getByRole('option', { name: 'Write-off' }).click()
    await p.getByLabel(/^Amount/).fill('5000')
    await p.getByLabel(/^Reason/).fill('Rehearsal: the meter was read twice')
    await p.getByRole('button', { name: 'Save' }).click()
    await p.waitForURL(/\/billing\/adjustment\/\d+/)
    await settle(p)
    adjustmentUrl = p.url()
    await p.getByRole('button', { name: 'Request approval' }).click()
    const dialog = p.getByRole('alertdialog')
    if (await dialog.count()) await dialog.getByRole('button', { name: /Request approval/ }).click()
    await p.getByText(/Waiting for a Manager/).waitFor({ timeout: 20000 })
    check(/Requested/.test(await pageText(officer)), 'the adjustment should be Requested')
  })
  await ledger(officer, 'Billing officer scenes')

  await step('A5 Manager approves it, and the bill’s balance drops', manager, async () => {
    await mp.goto(adjustmentUrl)
    await mp.locator('form.form-sheet').waitFor()
    await settle(mp)
    const before = await textOf(mp.locator('main'))
    check(/Bill balance before\s*Rs\s?[\d,]+\.\d\d/.test(before), 'the adjustment should show the balance before and after')
    await mp.getByRole('button', { name: 'Approve' }).click()
    const dialog = mp.getByRole('alertdialog')
    if (await dialog.count()) await dialog.getByRole('button', { name: /Approve/ }).click()
    await mp.getByText('Approved', { exact: true }).first().waitFor({ timeout: 20000 })
    check(/Rs 5,000\.00/.test(await pageText(manager)), 'the approved amount should read Rs 5,000.00')
  })

  const recovery = await person('water', 'farhan.raza')
  let theirCase
  await step('A6 Manager finds a case that is someone else’s', manager, async () => {
    await openList(manager, 'water/recoverycase')
    const all = await rows(manager)
    // Which case is Nida's is test plumbing, asked of the API as the Manager; what the Recovery officer then
    // sees is driven through the UI below.
    theirCase = await mp.evaluate(async () => {
      const base = location.origin.replace('5273', '8200')
      const body = await (await fetch(`${base}/api/data/water/recoverycase/?limit=500`, { credentials: 'include' })).json()
      return body.results.find((r) => r.labels.owner === 'Nida Hussain')?.id ?? null
    })
    check(all.length > 0 && theirCase, 'a case owned by Nida Hussain should exist')
  })
  await step('A7 Recovery officer sees their own cases and gets 404 on another’s', recovery, async () => {
    await openList(recovery, 'water/recoverycase')
    const mine = await rows(recovery)
    check(mine.length > 3, `a recovery officer should have cases, got ${mine.length}`)
    check(mine.every((r) => r.includes('Farhan Raza')), 'every case should be Farhan Raza’s own')
    recovery.expect404(`/api/data/water/recoverycase/${theirCase}/`)
    await recovery.page.goto(`${recovery.base.app}/water/recoverycase/${theirCase}`)
    await recovery.page.getByText(/This record isn.t available/).waitFor({ timeout: 15000 })
  })
  await ledger(recovery, 'Recovery officer scenes')

  await step('A8 Manager assigns owners to "Needs an owner"', manager, async () => {
    await openList(manager, 'water/recoverycase')
    await pickView(manager, 'Needs an owner')
    const needing = await rows(manager)
    check(needing.length >= 3, `expected cases needing an owner, got ${needing.length}`)
    for (let i = 0; i < 3; i += 1) await mp.locator('.list-row').nth(i).getByRole('checkbox').check()
    const bar = mp.getByRole('region', { name: 'Selected rows' })
    await bar.waitFor()
    await bar.getByRole('button', { name: 'Assign owner' }).click()
    const dialog = mp.getByRole('dialog')
    await dialog.getByRole('combobox').click()
    await mp.getByRole('option').first().waitFor({ timeout: 15000 })
    await settle(mp)
    const offered = await mp.getByRole('option').allInnerTexts()
    check(offered.length === 2 && offered.every((o) => /Farhan Raza|Nida Hussain/.test(o)), `only the Recovery officers should be offered: ${offered.join(', ')}`)
    await mp.getByRole('option', { name: /Nida Hussain/ }).click()
    await dialog.getByRole('button', { name: 'Assign owner' }).click()
    await dialog.waitFor({ state: 'detached', timeout: 20000 })
    await settle(mp)
    const left = (await rows(manager)).length
    equal(left, needing.length - 3, 'cases still needing an owner after assigning three')
  })
  await ledger(manager, 'Manager scenes')
}

// ------------------------------------------------------------------------------------------------ Journey B

async function journeyB() {
  console.log('Journey B: the clearing agency (clicker_port)')

  const coordinator = await person('clearance', 'mehwish.rauf')
  let kamransJob
  await step('B1 Coordinator opens Jobs by stage', coordinator, async () => {
    await openList(coordinator, 'clearance/job')
    await pickView(coordinator, 'Jobs by stage')
    const text = await pageText(coordinator)
    for (const stage of ['Assessed', 'Duty paid', 'Examined', 'Released']) check(text.includes(stage), `no ${stage} group on the pipeline`)
    check(/Open jobs\s*32/.test(text), 'the strip should say 32 open jobs')
  })
  await step('B2 Coordinator opens Demurrage at risk', coordinator, async () => {
    await openList(coordinator, 'clearance/job')
    await pickView(coordinator, 'Demurrage at risk')
    const all = await rows(coordinator)
    check(all.length >= 4, `expected the at-risk list, got ${all.length} rows`)
    check(all.some((r) => r.includes('JOB-2026-0003') && r.includes('Accruing')), 'JOB-2026-0003 should be accruing')
    const text = await pageText(coordinator)
    check(/To be invoiced\s*Rs\s?[1-9]/.test(text), 'the To be invoiced card should total the released and gate-out jobs, not Rs 0')
    kamransJob = await openRecord(coordinator, 'clearance/job', 'Kamran Lashari', { search: false })
  })
  await step('B3 Coordinator sees the Team; a job names its field agent', coordinator, async () => {
    check((await sidebar(coordinator)).includes('Team'), 'a Coordinator should have the Team item')
    await openList(coordinator, 'core/staff')
    check((await rows(coordinator)).length >= 5, 'the Team list should name the people')
  })
  await ledger(coordinator, 'Coordinator scenes')

  const agent = await person('clearance', 'rashid.baloch')
  await step('B4 Field agent sees only their own jobs, and no Team', agent, async () => {
    await openList(agent, 'clearance/job')
    const mine = await rows(agent)
    check(mine.length > 5, `a field agent should have jobs, got ${mine.length}`)
    check(mine.every((r) => r.includes('Rashid Baloch')), 'every row should be Rashid Baloch’s own')
    check(!mine.some((r) => r.includes('Kamran Lashari')), 'another agent’s job is visible')
    const text = await pageText(agent)
    check(!/To be invoiced|Paid out/.test(text), 'a field agent must see no money on the jobs list')
    const nav = await sidebar(agent)
    check(!nav.includes('Team'), 'a field agent must have no Team item')
    check(!nav.includes('Bills'), 'a field agent must have no Bills')
  })
  await step('B5 Field agent gets "not available" on another agent’s job', agent, async () => {
    agent.expect404(`/api/data/clearance/job/${kamransJob}/`)
    await agent.page.goto(`${agent.base.app}/clearance/job/${kamransJob}`)
    await agent.page.getByText(/This record isn.t available/).waitFor({ timeout: 15000 })
  })
  await ledger(agent, 'Field agent scenes')

  const accounts = await person('clearance', 'ibrahim.qazi')
  await step('B6 Accounts approves a waiting disbursement', accounts, async () => {
    await openList(accounts, 'clearance/disbursement')
    await pickView(accounts, 'Waiting for approval')
    const waiting = await rows(accounts)
    equal(waiting.length, 7, 'disbursements waiting for approval')
    // The one on JOB-2026-0007 is left alone here: the story is that gate-out leaves it out of the invoice.
    const target = 'JOB-2026-0026'
    await openRecord(accounts, 'clearance/disbursement', target, { search: false, view: 'Waiting for approval' })
    const p = accounts.page
    await p.getByRole('button', { name: 'Approve' }).click()
    const dialog = p.getByRole('alertdialog')
    if (await dialog.count()) await dialog.getByRole('button', { name: /Approve/ }).click()
    await p.getByText('Approved', { exact: true }).first().waitFor({ timeout: 15000 })
    await openList(accounts, 'clearance/disbursement')
    await pickView(accounts, 'Waiting for approval')
    equal((await rows(accounts)).length, 6, 'disbursements still waiting after one approval')
  })
  await ledger(accounts, 'Accounts scenes')

  const owner = await person('clearance', 'hamza.farooqui')
  let jobId
  await step('B7 Owner gates out JOB-2026-0007: one draft bill, Rs 17,10,500.00, the left-out disbursement named', owner, async () => {
    jobId = await openRecord(owner, 'clearance/job', 'JOB-2026-0007')
    const p = owner.page
    check(!/Invoice\s*[A-Z]{2,}-/.test(await pageText(owner)), 'the job should have no invoice before gate-out')
    await p.getByRole('button', { name: 'Gate out' }).click()
    const dialog = p.getByRole('alertdialog')
    await dialog.waitFor()
    const sentence = await textOf(dialog)
    check(sentence.includes('This creates a draft invoice for Rs 17,10,500.00 including 3 disbursements.'), `the confirmation reads: ${sentence}`)
    check(/1 disbursement not yet approved will be left out/.test(sentence), `the confirmation does not name the left-out disbursement: ${sentence}`)
    await dialog.getByRole('button', { name: /Gate out/ }).click()
    await p.getByText('Gate-out', { exact: true }).first().waitFor({ timeout: 15000 })
    await settle(p)
    await p.getByText(/Created by automation when JOB-2026-0007 went to Gate-out/).first().waitFor({ timeout: 15000 })
  })
  await step('B8 Exactly one draft bill, and it names what was left out', owner, async () => {
    // The job's invoice link, then the bills list: one draft for this client's job, no more.
    const p = owner.page
    const href = await p.locator('a[href^="/billing/bill/"]').first().getAttribute('href')
    await p.goto(owner.base.app + href)
    await p.locator('form.form-sheet').waitFor()
    await settle(p)
    const bill = await pageText(owner)
    check(/Draft/.test(bill), 'the bill should be a draft')
    check(bill.includes('17,10,500.00'), 'the bill total should be Rs 17,10,500.00')
    const notes = await p.locator('textarea').first().inputValue()
    check(/Not yet billed/.test(notes) && notes.includes('TRN-007') && notes.includes('45,000.00'), `the bill\u2019s notes should name the disbursement left out: ${notes}`)
    const count = await p.evaluate(async (jobNumber) => {
      const response = await fetch(`${location.origin.replace('5274', '8201')}/api/data/billing/bill/?limit=200`, { credentials: 'include' })
      const body = await response.json()
      return body.results.filter((b) => JSON.stringify(b.values).includes(jobNumber)).length
    }, 'JOB-2026-0007')
    equal(count, 1, 'bills that reference JOB-2026-0007')
  })
  await step('B9 Owner posts the bill', owner, async () => {
    const p = owner.page
    await p.getByRole('button', { name: 'Post' }).click()
    const dialog = p.getByRole('alertdialog')
    if (await dialog.count()) await dialog.getByRole('button', { name: /Post/ }).click()
    await p.getByText('Posted', { exact: true }).first().waitFor({ timeout: 15000 })
  })
  await step('B10 View as Field agent: banner shown, nothing can be written', owner, async () => {
    const p = owner.page
    await p.locator('.user-menu__chevron, .user-menu__name').first().click()
    await p.getByRole('button', { name: /View as role/ }).click()
    await p.locator('.view-as__role', { hasText: 'Field agent' }).click()
    await p.locator('.view-as-banner').waitFor({ timeout: 20000 })
    check(/Field agent/.test(await textOf(p.locator('.view-as-banner'))), 'the banner should name the role')
    await openList(owner, 'clearance/job')
    check((await rows(owner)).length > 5, 'the field agent view should list jobs')
    check(!(await sidebar(owner)).includes('Team'), 'View as Field agent must show no Team item')
    check((await p.getByRole('link', { name: /New job/ }).count()) === 0, 'no New job while viewing as a field agent')
    owner.expectRefusal(403, `/api/data/clearance/job/${jobId}/`)
    const refused = await p.evaluate(async (id) => {
      const base = location.origin.replace('5274', '8201')
      const csrf = await (await fetch(`${base}/api/auth/csrf/`, { credentials: 'include' })).json()
      const response = await fetch(`${base}/api/data/clearance/job/${id}/`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-View-As-Role': 'Field agent', 'X-CSRFToken': csrf.csrf_token },
        body: JSON.stringify({ goods: 'changed while viewing' }),
      })
      return { status: response.status, body: await response.text() }
    }, jobId)
    equal(refused.status, 403, `a write while viewing as another role (${refused.body.slice(0, 120)})`)
    check(/view|read-only|can.t be changed/i.test(refused.body), `the refusal should say why: ${refused.body.slice(0, 160)}`)
  })
  await step('B11 Owner opens the Team page', owner, async () => {
    // Back to being the Owner: the banner has an exit.
    const p = owner.page
    await p.locator('.view-as-banner').getByRole('button').first().click()
    await p.locator('.view-as-banner').waitFor({ state: 'detached', timeout: 20000 })
    check((await sidebar(owner)).includes('Team'), 'the Owner has the Team item again')
    await openList(owner, 'core/staff')
    const all = await rows(owner)
    check(all.some((r) => r.includes('Hamza Farooqui')) && all.some((r) => r.includes('Rashid Baloch')), 'the Team lists the people')
  })
  await ledger(owner, 'Owner scenes')
}

let failure = null
try {
  if (which === 'water' || which === 'both') await journeyA()
  if (which === 'clearance' || which === 'both') await journeyB()
} catch (error) {
  failure = error
}

const totals = summary()
const hosts = [...new Set(people.flatMap((p) => [...p.hosts]))].sort()
console.log(`\n${totals.total - totals.failed}/${totals.total} steps passed in ${((Date.now() - started) / 1000).toFixed(1)} s; hosts seen: ${hosts.join(', ')}`)
await browser.close()
process.exit(failure ? 1 : 0)
