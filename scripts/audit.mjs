#!/usr/bin/env node
// The UI audit: every demo screen, as every demo role, light and dark, at four viewports, plus the states that
// scripts can force. Fails loudly (exit 1) when there is a P0 or P1 finding; P2 is listed.
//
//   node scripts/audit.mjs                       # everything (about 10 minutes)
//   node scripts/audit.mjs --viewports 1440 --themes light --screens "Jobs by stage"    # a slice
//   node scripts/audit.mjs --states-only         # just the forced states (403, 404, 500, offline, loading, empty)
//
// Needs both stacks up on a freshly seeded database (scripts/demo_stack.sh both). axe-core is vendored in
// scripts/vendor (no CDN). Results: docs/audit/raw/findings.json (and a table on stdout); screenshots of every
// screen go to docs/audit/shots/ (git-ignored). Tours are switched off for the run (see lib/browser.mjs).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Person, ROOT, launch } from './lib/browser.mjs'
import { runChecks } from './lib/auditChecks.js'
import { SCREENS } from './lib/screens.mjs'
import { openList, settle } from './lib/steps.mjs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : fallback
}
const VIEWPORTS = (flag('viewports', 'all') === 'all' ? ['1280x720', '1366x768', '1440x900', '1920x1080'] : flag('viewports').split(',')).map((v) => {
  const [width, height] = v.split('x').map(Number)
  return { width, height: height ?? Math.round(width * 0.625) }
})
const THEMES = flag('themes', 'light,dark').split(',')
const ONLY = flag('screens', null)
const STATES_ONLY = args.includes('--states-only')
const SKIP_STATES = args.includes('--no-states')

// ------------------------------------------------------------------------------------------ tokens
const css = readFileSync(path.join(ROOT, 'tokens.css'), 'utf8')
const px = (re) => [...css.matchAll(re)].map((m) => parseFloat(m[1]))
const options = {
  fontSizes: [...new Set([...px(/--text-[\w-]+:\s*([\d.]+)px/g), 10, 18])].sort((a, b) => a - b),
  spaces: [...new Set([0, 1, 2, 3, ...px(/--space-\d+:\s*([\d.]+)px/g), 10, 14, 28, 44, 56, 64, 80, 96, 160, 232])],
  radii: [...new Set([0, 2, 3, ...px(/--radius-(?:sm|md|lg|xs|xl):\s*([\d.]+)px/g), 5, 6, 10, 14])],
  durations: [...new Set([0, 60, 100, 120, 150, 160, 200, 240, 300, 500, 1000, 1200, 2000])],
  reducedMotion: false,
}

// ------------------------------------------------------------------------------------------ findings
const SEVERITY_ORDER = { P0: 0, P1: 1, P2: 2 }
const findings = new Map()
function record(context, finding) {
  const shape = (v) => String(v).replace(/ ".*"$/, '').replace(/\d+(\.\d+)?/g, '#')
  const key = `${finding.rule}|${shape(finding.selector)}|${shape(finding.detail)}`
  const existing = findings.get(key)
  const where = `${context.screen} / ${context.role} / ${context.theme} / ${context.viewport}`
  if (existing) {
    existing.count += 1
    if (existing.where.length < 4) existing.where.push(where)
  } else {
    findings.set(key, { ...finding, count: 1, where: [where] })
  }
}

const AXE = readFileSync(path.join(ROOT, 'scripts', 'vendor', 'axe.min.js'), 'utf8')
const CLS_SCRIPT = `
  window.__cls = 0;
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true }) } catch {}
  try { localStorage.setItem('clicker.tour.disabled', '1') } catch {}
`

async function axeFindings(page) {
  await page.evaluate(AXE)
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      resultTypes: ['violations'],
    })
    return result.violations.flatMap((v) =>
      v.nodes.slice(0, 6).map((n) => ({ id: v.id, impact: v.impact, help: v.help, target: n.target.join(' '), summary: (n.failureSummary || '').split('\n').slice(0, 3).join(' ').slice(0, 200) })),
    )
  })
}
// axe's own severity, adjusted: a contrast miss is P1 (P0 under 3:1), other serious/critical is P1/P0, the rest P2.
function axeSeverity(f) {
  if (f.id === 'color-contrast') {
    const ratio = /contrast of ([\d.]+)/.exec(f.summary)
    return ratio && Number(ratio[1]) < 3 ? 'P0' : 'P1'
  }
  if (f.impact === 'critical') return 'P0'
  if (f.impact === 'serious') return 'P1'
  return 'P2'
}

async function auditScreen(person, screen, context) {
  const { page } = person
  const clsBefore = await page.evaluate(() => window.__cls ?? 0).catch(() => 0)
  await screen.go(person)
  await page.waitForTimeout(350)
  const cls = (await page.evaluate(() => window.__cls ?? 0)) - clsBefore
  if (cls > 0.05) record(context, { rule: 'layout/shift-while-loading', severity: 'P1', selector: screen.name, detail: `CLS ${cls.toFixed(3)}` })

  for (const finding of await page.evaluate(runChecks, { ...options, reducedMotion: person.reducedMotion === 'reduce' })) record(context, finding)
  for (const f of await axeFindings(page)) record(context, { rule: `axe/${f.id}`, severity: axeSeverity(f), selector: f.target, detail: f.summary || f.help })
  return page
}

// ------------------------------------------------------------------------------------------ keyboard and focus
async function focusAudit(person, context) {
  const { page } = person
  await page.evaluate(() => document.activeElement && document.activeElement.blur())
  await page.mouse.move(0, 0)
  const seen = new Set()
  let trapped = 0
  for (let i = 0; i < 45; i += 1) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const e = document.activeElement
      if (!e || e === document.body) return null
      const style = getComputedStyle(e)
      const rect = e.getBoundingClientRect()
      const ring = (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none'
      const parentRing = e.closest('[data-focus-ring], label, [role=checkbox]') && (getComputedStyle(e.closest('[data-focus-ring], label, [role=checkbox]')).boxShadow !== 'none')
      const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1)
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1)
      const top = document.elementFromPoint(cx, cy)
      const covered = rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight && !!top && top !== e && !e.contains(top) && !top.contains(e)
      const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
      const name = (e.getAttribute('aria-label') || e.textContent || e.getAttribute('name') || '').trim().replace(/\s+/g, ' ').slice(0, 28)
      return { key: `${e.tagName}.${cls}|${name}|${Math.round(rect.left)}x${Math.round(rect.top)}`, label: `${e.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${name}"`, ring: ring || !!parentRing, covered, inView: rect.bottom > 0 && rect.top < innerHeight && rect.width > 0 }
    })
    if (!info) continue
    if (seen.has(info.key)) { trapped += 1; if (trapped > 3) break; continue }
    seen.add(info.key)
    if (info.inView && !info.ring) record(context, { rule: 'focus/no-visible-ring', severity: 'P1', selector: info.label, detail: 'outline none and no box-shadow when focused by keyboard' })
    if (info.covered) record(context, { rule: 'focus/covered-by-other-element', severity: 'P1', selector: info.label, detail: 'a sticky header or overlay covers the focused element' })
  }
  if (seen.size < 3) record(context, { rule: 'focus/few-tab-stops', severity: 'P1', selector: context.screen, detail: `only ${seen.size} tab stops reached in 45 presses (trap or unreachable controls)` })
}

async function escapeAudit(person, context) {
  const { page } = person
  // The view menu: opens, Esc closes it, focus returns to its trigger.
  const trigger = page.locator('.list-toolbar__title button').first()
  if (await trigger.count()) {
    await trigger.focus()
    await trigger.press('Enter')
    await page.waitForTimeout(250)
    if (await page.locator('.view-menu').count()) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
      if (await page.locator('.view-menu').count()) record(context, { rule: 'keyboard/esc-does-not-close-view-menu', severity: 'P1', selector: '.view-menu', detail: '' })
      const back = await page.evaluate(() => document.activeElement && document.activeElement.closest('.list-toolbar__title') !== null)
      if (!back) record(context, { rule: 'keyboard/focus-not-returned-to-trigger', severity: 'P1', selector: '.view-menu', detail: 'after Esc' })
    }
  }
  // The user menu.
  const user = page.locator('.user-menu__name').first()
  if (await user.count()) {
    await user.locator('xpath=ancestor::button').first().focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(250)
    if (await page.locator('.user-menu').count()) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
      if (await page.locator('.user-menu').count()) record(context, { rule: 'keyboard/esc-does-not-close-user-menu', severity: 'P1', selector: '.user-menu', detail: '' })
      const back = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('button') && /user-menu/.test(document.activeElement.closest('button').className || ''))
      if (!back) record(context, { rule: 'keyboard/focus-not-returned-to-trigger', severity: 'P1', selector: '.user-menu', detail: 'after Esc' })
    }
  }
  // The peek drawer: opens on a row, Esc closes it.
  const row = page.locator('.list-row').first()
  if (await row.count()) {
    await row.click()
    await page.waitForTimeout(500)
    if (await page.locator('.peek').count()) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      if (await page.locator('.peek').count()) record(context, { rule: 'keyboard/esc-does-not-close-peek', severity: 'P1', selector: '.peek', detail: '' })
    }
  }
}

// ------------------------------------------------------------------------------------------ forced states
async function states(browser) {
  console.log('Forced states (1440x900, light)')
  const viewport = { width: 1440, height: 900 }
  const owner = await new Person(browser, 'clearance', 'hamza.farooqui', { viewport, initScript: CLS_SCRIPT }).open()
  const p = owner.page
  const where = (name) => ({ screen: name, role: 'Owner', theme: 'light', viewport: '1440x900' })
  const note = (ok, message) => console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`)
  const text = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ')

  // Empty list vs filtered-empty.
  await openList(owner, 'clearance/job', '?q=zzzzzzzzqq')
  let t = await text()
  const emptyOk = /No jobs match|No results|nothing/i.test(t) && !/undefined|\[object/.test(t)
  note(emptyOk, 'search with no results says so'); if (!emptyOk) record(where('empty list'), { rule: 'state/empty-search', severity: 'P1', selector: 'list', detail: t.slice(0, 120) })

  // 404 record.
  owner.expect404('/api/data/clearance/job/999999/')
  await p.goto(`${owner.base.app}/clearance/job/999999`)
  await p.getByText(/isn.t available/).waitFor({ timeout: 15000 }).then(() => note(true, '404 record is a designed screen'), () => { note(false, '404 record'); record(where('404'), { rule: 'state/404', severity: 'P0', selector: 'record', detail: 'no designed not-available screen' }) })

  // Loading: a slow list shows skeletons, not a blank.
  await p.route('**/api/data/clearance/job/?**', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue().catch(() => undefined) })
  await p.goto(`${owner.base.app}/clearance/job`)
  await p.waitForTimeout(500)
  const skeleton = await p.locator('[aria-busy="true"], [data-slot=skeleton], .skeleton').count()
  note(skeleton > 0, 'a slow list shows a skeleton'); if (!skeleton) record(where('loading'), { rule: 'state/no-skeleton', severity: 'P1', selector: 'list', detail: 'blank while loading' })
  await p.waitForTimeout(1600)
  await p.unroute('**/api/data/clearance/job/?**')

  // 500 and 403: designed, with a way back; no raw JSON.
  for (const [status, body, name] of [[500, '{"detail":"boom"}', '500'], [403, '{"detail":"You don\u2019t have permission to do this."}', '403']]) {
    await p.route('**/api/schema/clearance/job/**', (route) => route.fulfill({ status, contentType: 'application/json', body }))
    await p.goto(`${owner.base.app}/clearance/job`)
    await p.waitForTimeout(1500)
    t = await text()
    const raw = /"detail"|boom|Traceback|<html/i.test(t)
    const retry = await p.getByRole('button', { name: /retry|try again|reload/i }).count()
    note(!raw && (status === 403 || retry > 0), `${name} is a designed screen${status === 500 ? ' with Retry' : ''}`)
    if (raw) record(where(name), { rule: `state/${name}-shows-raw-error`, severity: 'P0', selector: 'list', detail: t.slice(0, 100) })
    if (status === 500 && !retry) record(where(name), { rule: 'state/500-without-retry', severity: 'P1', selector: 'list', detail: '' })
    await p.unroute('**/api/schema/clearance/job/**')
  }

  // Offline: the app says so rather than going blank.
  await openList(owner, 'clearance/job')
  await owner.context.setOffline(true)
  await p.getByRole('button', { name: /refresh|reload/i }).first().click().catch(() => {})
  await p.waitForTimeout(1500)
  t = await text()
  const blank = t.length < 40
  note(!blank, 'offline does not blank the page'); if (blank) record(where('offline'), { rule: 'state/offline-blank', severity: 'P1', selector: 'page', detail: '' })
  await owner.context.setOffline(false)

  // Hover must not shift layout.
  await openList(owner, 'clearance/job')
  const before = await p.evaluate(() => [...document.querySelectorAll('.list-row')].slice(0, 6).map((e) => e.getBoundingClientRect().top))
  await p.locator('.list-row').nth(2).hover()
  await p.waitForTimeout(250)
  const after = await p.evaluate(() => [...document.querySelectorAll('.list-row')].slice(0, 6).map((e) => e.getBoundingClientRect().top))
  const shifted = before.some((v, i) => Math.abs(v - after[i]) > 0.5)
  note(!shifted, 'hovering a row shifts nothing'); if (shifted) record(where('hover'), { rule: 'state/hover-shifts-layout', severity: 'P1', selector: '.list-row', detail: '' })

  // Required-and-empty and error: a new record, saved empty.
  await p.goto(`${owner.base.app}/clearance/job/new`)
  await p.locator('form.form-sheet').waitFor()
  await settle(p)
  const textNew = await text()
  note(!/Rs\s?0\.00|0 days/.test(textNew), 'an empty new form shows prompts, not zeros')
  // The save bar appears once something is typed; a required field is still empty.
  await p.getByLabel(/^Goods/).fill('Cotton yarn')
  await p.getByRole('button', { name: 'Save' }).click().catch(() => {})
  await p.waitForTimeout(1200)
  t = await text()
  const hasError = /required|can.t be blank|choose|fill/i.test(t)
  note(hasError, 'saving an empty form says what to do'); if (!hasError) record(where('validation'), { rule: 'state/validation-message-missing', severity: 'P1', selector: 'form', detail: t.slice(0, 120) })

  // Reduced motion: re-run the motion checks with the media feature on.
  const calm = await new Person(browser, 'clearance', 'hamza.farooqui', { viewport, reducedMotion: 'reduce', initScript: CLS_SCRIPT }).open()
  await calm.page.route('**/api/data/clearance/job/?**', async (route) => { await new Promise((r) => setTimeout(r, 1200)); await route.continue().catch(() => undefined) })
  await calm.page.goto(`${calm.base.app}/clearance/job`)
  await calm.page.waitForTimeout(500)
  for (const f of await calm.page.evaluate(runChecks, { ...options, reducedMotion: true })) if (f.rule.startsWith('motion/')) record(where('reduced motion'), f)
  note(true, 'reduced-motion checks ran')
  await calm.close()
  await owner.close()
}

// ------------------------------------------------------------------------------------------ main
const started = Date.now()
const browser = await launch()
mkdirSync(path.join(ROOT, 'docs', 'audit', 'raw'), { recursive: true })
mkdirSync(path.join(ROOT, 'docs', 'audit', 'shots'), { recursive: true })

if (!STATES_ONLY) {
  const screens = SCREENS.filter((s) => !ONLY || s.name.toLowerCase().includes(ONLY.toLowerCase()))
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const tag = `${viewport.width}x${viewport.height} ${theme}`
      const people = new Map()
      let n = 0
      for (const screen of screens) {
        const key = `${screen.journey}:${screen.who}`
        if (!people.has(key)) {
          const person = await new Person(browser, screen.journey, screen.who, { theme, viewport, initScript: CLS_SCRIPT }).open()
          person.consoleErrors.length = 0
          person.badResponses.length = 0
          people.set(key, person)
        }
        const person = people.get(key)
        const context = { screen: screen.name, role: screen.who, theme, viewport: `${viewport.width}x${viewport.height}` }
        try {
          const page = await auditScreen(person, screen, context)
          if (viewport.width === 1440 && theme === 'light') { await focusAudit(person, context); await escapeAudit(person, context) }
          if ((viewport.width === 1440 || viewport.width === 1280) ) {
            const file = path.join(ROOT, 'docs', 'audit', 'shots', `${screen.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${screen.who}-${viewport.width}-${theme}.jpg`)
            await page.screenshot({ path: file, type: 'jpeg', quality: 70 })
          }
        } catch (error) {
          record(context, { rule: 'audit/screen-failed-to-load', severity: 'P0', selector: screen.name, detail: error.message.split('\n')[0] })
        }
        n += 1
      }
      for (const person of people.values()) {
        for (const e of person.consoleErrors) record({ screen: 'console', role: person.username, theme, viewport: tag }, { rule: 'console/error', severity: 'P1', selector: 'console', detail: e.slice(0, 160) })
        for (const r of person.badResponses) record({ screen: 'network', role: person.username, theme, viewport: tag }, { rule: 'network/unexpected-response', severity: 'P1', selector: 'network', detail: r })
        await person.close()
      }
      console.log(`  ${tag}: ${n} screens, ${findings.size} distinct findings so far`)
    }
  }
}
const writeFindings = () => writeFileSync(path.join(ROOT, 'docs', 'audit', 'raw', 'findings.json'), JSON.stringify([...findings.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule.localeCompare(b.rule)), null, 2))
writeFindings()
if (!SKIP_STATES) await states(browser)
await browser.close()

const list = [...findings.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule.localeCompare(b.rule))
writeFileSync(path.join(ROOT, 'docs', 'audit', 'raw', 'findings.json'), JSON.stringify(list, null, 2))
const counts = { P0: 0, P1: 0, P2: 0 }
for (const f of list) counts[f.severity] += 1
console.log(`\n${list.length} distinct findings: P0 ${counts.P0}, P1 ${counts.P1}, P2 ${counts.P2}  (${((Date.now() - started) / 1000).toFixed(0)} s)`)
const byRule = new Map()
for (const f of list) {
  const k = `${f.severity} ${f.rule}`
  const g = byRule.get(k) ?? { n: 0, example: f }
  g.n += 1
  byRule.set(k, g)
}
for (const [k, g] of byRule) console.log(`  ${k} \u00d7${g.n} \u2014 e.g. ${g.example.selector.slice(0, 80)} \u2014 ${String(g.example.detail).slice(0, 80)}  [${g.example.where[0]}]`)
process.exit(counts.P0 + counts.P1 > 0 ? 1 : 0)
