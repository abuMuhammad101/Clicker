#!/usr/bin/env node
// Screenshots of the redesigned sign-in screen into docs/design/s8/ (signin-v2-*), both themes, plus a layout check
// at five widths: nothing clips or scrolls sideways, and the longest error still fits.
//   node scripts/shots-signin.mjs     (both stacks up)
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { JOURNEYS, ROOT, launch } from './lib/browser.mjs'

const OUT = path.join(ROOT, 'docs', 'design', 's8')
mkdirSync(OUT, { recursive: true })
const browser = await launch()
const problems = []
const shot = (page, name, theme) => page.screenshot({ path: path.join(OUT, `signin-v2-${name}-${theme}.jpg`), type: 'jpeg', quality: 80 })

/** Nothing sideways, nothing cut: every visible text node sits inside its own box and the viewport. */
async function fits(page, label) {
  const bad = await page.evaluate(() => {
    const out = []
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth) out.push(`page scrolls sideways (${doc.scrollWidth} > ${doc.clientWidth})`)
    for (const el of document.querySelectorAll('main *')) {
      if (el.closest('[aria-hidden="true"]') && !el.closest('.proof-strip')) continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push(`${el.className || el.tagName} clips its text`)
      if (r.right > doc.clientWidth + 1 || r.left < -1) out.push(`${el.className || el.tagName} leaves the viewport`)
    }
    return out
  })
  for (const b of bad) problems.push(`${label}: ${b}`)
}

for (const theme of ['light', 'dark']) {
  for (const [width, height] of [[390, 780], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme })
    const page = await context.newPage()
    await page.goto(`${JOURNEYS.clearance.app}/login`)
    await page.getByRole('heading', { name: 'Sign in' }).waitFor()
    await page.waitForTimeout(500)
    await fits(page, `${width}px ${theme}`)
    if (width === 390 || width === 1440) await shot(page, width === 390 ? 'narrow' : '1-default', theme)
    if (width === 1280 || width === 1920) await shot(page, `width-${width}`, theme)
    if (width === 1440) {
      await page.getByText('Need help signing in?').click()
      await shot(page, 'help-open', theme)
      await page.getByText('Need help signing in?').click()
      await page.getByLabel('Username').fill('hamza.farooqui')
      await page.locator('input[name="password"]').fill('not-the-password')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByRole('alert').waitFor()
      await fits(page, `error ${theme}`)
      await shot(page, '2-wrong-details', theme)
      await page.locator('input[name="password"]').focus()
      await page.keyboard.press('Tab')
      await shot(page, '2b-focus-ring', theme)
      for (let i = 0; i < 6; i += 1) {
        await page.getByLabel('Username').fill('lockout.demo')
        await page.locator('input[name="password"]').fill('x')
        await page.getByRole('button', { name: 'Sign in' }).click()
        await page.waitForTimeout(500)
      }
      await page.getByText(/Too many attempts/).waitFor({ timeout: 20000 })
      await fits(page, `locked ${theme}`)
      await shot(page, '3-locked-out', theme)
      await page.route('**/api/auth/login/', (route) => route.abort('connectionrefused'))
      await page.getByLabel('Username').fill('hamza.farooqui')
      await page.locator('input[name="password"]').fill('x')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForTimeout(700)
      await shot(page, '4-cannot-reach', theme)
      await page.unroute('**/api/auth/login/')
      await page.goto(`${JOURNEYS.clearance.app}/login?reason=expired&next=%2Fclearance%2Fjob`)
      await page.getByRole('heading', { name: 'Sign in' }).waitFor()
      await page.waitForTimeout(400)
      await shot(page, '5-session-expired', theme)
      // The slow-motion check: slow the sign-in down so the "Signing in…" state can be held, then catch the check.
      await page.goto(`${JOURNEYS.clearance.app}/login`)
      await page.getByRole('heading', { name: 'Sign in' }).waitFor()
      await page.route('**/api/auth/login/', async (route) => {
        await new Promise((r) => setTimeout(r, 1500))
        await route.continue()
      })
      const pw = (await import('node:fs')).readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^DEMO_PASSWORD_HAMZA_FAROOQUI=(.*)$/m)?.[1]
      await page.addStyleTag({ content: ':root, :root[data-theme] { --duration-slow: 4000ms }' })
      await page.getByLabel('Username').fill('hamza.farooqui')
      await page.locator('input[name="password"]').fill(pw ?? '')
      const before = await page.getByRole('button', { name: 'Sign in' }).boundingBox()
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByRole('button', { name: 'Signing in…' }).waitFor()
      const during = await page.getByRole('button', { name: 'Signing in…' }).boundingBox()
      if (Math.abs(before.width - during.width) > 0.5) problems.push(`button changes width while signing in (${before.width} → ${during.width})`)
      await shot(page, '6-signing-in', theme)
      // The check lasts one slow token (240 ms); for the picture only, stretch that token so it can be caught.
      await page.locator('button[data-state="signed-in"]').waitFor({ timeout: 8000 })
      await shot(page, '7-signed-in-check', theme)
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
    }
    // Water board's own three cards.
    if (width === 1440) {
      const water = await context.newPage()
      await water.goto(`${JOURNEYS.water.app}/login`)
      await water.getByRole('heading', { name: 'Sign in' }).waitFor()
      await water.waitForTimeout(500)
      await fits(water, `water ${theme}`)
      await shot(water, 'water', theme)
    }
    await context.close()
  }
}
await browser.close()
if (problems.length) {
  console.error(`Sign-in layout problems:\n  ${[...new Set(problems)].join('\n  ')}`)
  process.exit(1)
}
console.log('Sign-in layout checks passed at 390, 1280, 1366, 1440 and 1920, light and dark.')
