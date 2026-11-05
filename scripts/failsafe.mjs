#!/usr/bin/env node
// Fail-safe checks for demo day (needs both stacks up on freshly seeded databases: scripts/demo_stack.sh both).
//
//   node scripts/failsafe.mjs [network|offline|viewports|all]
//
// network   every demo screen, as the roles that show it: no request to any host but the app's own, zero console
//           errors, zero unexpected 4xx/5xx (the one deliberate 404, "This record isn't available", is allowed).
// offline   the same screens in a browser that cannot resolve any host except localhost, from the first request.
// viewports Jobs by stage, a statement and the gate-out confirmation at four sizes, light and dark: no horizontal
//           scroll, nothing overlapping in the record header and stepper; screenshots to docs/design/s7/viewports/.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { Person, chromium, launch } from './lib/browser.mjs'
import { check, openList, openRecord, pageText, pickView, rows, settle, SHOTS } from './lib/steps.mjs'

const mode = process.argv[2] ?? 'all'
const problems = []
const note = (ok, message) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`)
  if (!ok) problems.push(message)
}

// ------------------------------------------------------------------------------------------ the screens

import { SCREENS } from './lib/screens.mjs'

async function walk(browser, theme, label) {
  const hosts = new Set()
  const sessions = new Map()
  let screens = 0
  for (const screen of SCREENS) {
    const key = `${screen.journey}:${screen.who}`
    if (!sessions.has(key)) {
      const person = await new Person(browser, screen.journey, screen.who, { theme }).open()
      person.consoleErrors.length = 0
      person.badResponses.length = 0
      sessions.set(key, person)
    }
    const person = sessions.get(key)
    const errors = person.consoleErrors.length
    const bad = person.badResponses.length
    let failure = null
    try {
      await screen.go(person)
      await person.page.waitForTimeout(250)
    } catch (error) {
      failure = error.message.split('\n')[0]
    }
    screens += 1
    const fresh = [...person.consoleErrors.slice(errors), ...person.badResponses.slice(bad)]
    note(!failure && fresh.length === 0, `${label} ${theme}: ${screen.name} (${screen.who})${failure ? ` — ${failure}` : ''}${fresh.length ? ` — ${fresh.join(' | ')}` : ''}`)
  }
  for (const person of sessions.values()) for (const host of person.hosts) hosts.add(host)
  await Promise.all([...sessions.values()].map((p) => p.close()))
  return { hosts, screens }
}

const OWN = new Set(['localhost:5273', 'localhost:8200', 'localhost:5274', 'localhost:8201'])

async function network() {
  console.log('No external requests; zero console errors; zero unexpected 4xx/5xx')
  const browser = await launch()
  const seen = new Set()
  for (const theme of ['light', 'dark']) {
    const { hosts, screens } = await walk(browser, theme, 'network')
    hosts.forEach((h) => seen.add(h))
    console.log(`  (${screens} screens, ${theme})`)
  }
  await browser.close()
  const foreign = [...seen].filter((h) => !OWN.has(h))
  note(foreign.length === 0, `hosts seen: ${[...seen].sort().join(', ')}${foreign.length ? ` — EXTERNAL: ${foreign.join(', ')}` : ' (all loopback: the app and its own API)'}`)
}

async function offline() {
  console.log('Offline: a browser that cannot resolve any host but localhost')
  const browser = await chromium.launch({ args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'] })
  const { screens } = await walk(browser, 'light', 'offline')
  await browser.close()
  console.log(`  (${screens} screens)`)
  // And a running page that loses the network after it loaded keeps its own screens (it only talks to localhost).
  const normal = await launch()
  const person = await new Person(normal, 'clearance', 'hamza.farooqui').open()
  await openList(person, 'clearance/job')
  await person.context.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => route.abort('internetdisconnected'))
  await pickView(person, 'Jobs by stage')
  const text = await pageText(person)
  note(/Open jobs\s*\d+/.test(text) && (await rows(person)).length > 0, 'a loaded page keeps working after every external route is cut')
  await normal.close()
}

// ------------------------------------------------------------------------------------------ viewports

const SIZES = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]

/** Layout faults a screenshot would show: page scroll sideways, and boxes in a header that overlap. */
async function layoutFaults(page) {
  return page.evaluate(() => {
    const faults = []
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth + 1) faults.push(`page scrolls sideways (${doc.scrollWidth} > ${doc.clientWidth})`)
    const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1
    const boxes = (selector) => [...document.querySelectorAll(selector)].map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.height > 0)
    for (const group of ['.workflow-bar__steps > *', '.workflow-bar > *', '.form-header__actions > *', '.form-header > *', '.list-toolbar > *', '.summary-strip > *']) {
      const list = boxes(group)
      for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
        if (overlap(list[i].r, list[j].r)) faults.push(`${group}: "${list[i].e.textContent.trim().slice(0, 24)}" overlaps "${list[j].e.textContent.trim().slice(0, 24)}"`)
      }
      for (const { e, r } of list) if (r.right > window.innerWidth + 1) faults.push(`${group}: "${e.textContent.trim().slice(0, 24)}" runs past the right edge`)
    }
    // Things that must be read whole: a chip, a document number, the stepper (its overflow is what pushed "Closed" out of the card).
    const clipped = (selector, what) => {
      for (const e of document.querySelectorAll(selector)) {
        if (e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 1) faults.push(`${what} is cut: "${e.textContent.trim().slice(0, 30)}"`)
      }
    }
    clipped('.status-chip', 'a status chip')
    clipped('.list-cell--identifier', 'a document number')
    clipped('.workflow-steps', 'the stepper')
    clipped('.workflow-bar', 'the workflow bar')
    clipped('.list-scroll', 'a list (its columns do not fit; it scrolls sideways)')
    clipped('.summary-strip__value, .summary-strip__figure, .record-summary__value', 'a headline figure')
    const steps = boxes('.workflow-bar__steps li, .workflow-step, .stepper__step')
    if (steps.length) {
      const tops = new Set(steps.map(({ r }) => Math.round(r.top / 4)))
      if (tops.size > 2) faults.push(`the stepper wraps onto ${tops.size} rows`)
    }
    return faults
  })
}

async function viewports() {
  console.log('Viewports: Jobs by stage, a statement and the gate-out confirmation')
  mkdirSync(path.join(SHOTS, 'viewports'), { recursive: true })
  const browser = await launch()
  for (const theme of ['light', 'dark']) {
    for (const size of SIZES) {
      const tag = `${size.width}x${size.height} ${theme}`
      const owner = await new Person(browser, 'clearance', 'hamza.farooqui', { theme, viewport: size }).open()
      const water = await new Person(browser, 'water', 'ayesha.khan', { theme, viewport: size }).open()
      const shoot = async (person, name) => {
        const file = path.join(SHOTS, 'viewports', `${name}-${size.width}x${size.height}-${theme}.jpg`)
        await person.page.screenshot({ path: file, type: 'jpeg', quality: 78 })
      }
      await openList(owner, 'clearance/job')
      await pickView(owner, 'Jobs by stage')
      await owner.page.waitForTimeout(300)
      await shoot(owner, 'jobs-by-stage')
      let faults = await layoutFaults(owner.page)
      note(faults.length === 0, `${tag}: Jobs by stage${faults.length ? ` — ${faults.join('; ')}` : ''}`)

      await openRecord(water, 'core/contact', 'Federal Steel')
      await water.page.waitForTimeout(300)
      await shoot(water, 'statement')
      faults = await layoutFaults(water.page)
      note(faults.length === 0, `${tag}: Federal Steel statement${faults.length ? ` — ${faults.join('; ')}` : ''}`)

      // A job at Released: the one the story gates out, or whichever is released now.
      const released = await owner.page.evaluate(async () => {
        const base = location.origin.replace('5274', '8201')
        const body = await (await fetch(`${base}/api/data/clearance/job/?filter=state:in:released&limit=5`, { credentials: 'include' })).json()
        return body.results[0]?.id ?? null
      })
      check(released, 'no job is at Released to show the gate-out confirmation (reseed first)')
      await owner.page.goto(`${owner.base.app}/clearance/job/${released}`)
      await owner.page.locator('form.form-sheet').waitFor()
      await settle(owner.page)
      await owner.page.getByRole('button', { name: 'Gate out' }).click()
      await owner.page.getByRole('alertdialog').waitFor()
      await owner.page.waitForTimeout(400)
      await shoot(owner, 'gate-out-confirm')
      faults = await layoutFaults(owner.page)
      const dialogBox = await owner.page.getByRole('alertdialog').boundingBox()
      if (dialogBox && (dialogBox.x < 0 || dialogBox.x + dialogBox.width > size.width || dialogBox.y < 0 || dialogBox.y + dialogBox.height > size.height)) faults.push('the confirmation dialog is clipped by the window')
      note(faults.length === 0, `${tag}: gate-out confirmation${faults.length ? ` — ${faults.join('; ')}` : ''}`)
      await owner.page.getByRole('button', { name: 'Go back' }).click()
      await owner.close()
      await water.close()
    }
  }
  await browser.close()
}

if (mode === 'network' || mode === 'all') await network()
if (mode === 'offline' || mode === 'all') await offline()
if (mode === 'viewports' || mode === 'all') await viewports()
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll fail-safe checks passed.')
process.exit(problems.length ? 1 : 0)
