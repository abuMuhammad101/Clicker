#!/usr/bin/env node
// Screenshots of what S-8 added, light and dark, into docs/design/s8/: the sign-in screen in each state, the welcome
// and "Waiting for you", each step of both tours, the Help and user menus, the shortcut sheet and the copy toast.
//   node scripts/shots-s8.mjs     (both stacks up on a fresh seed)
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { JOURNEYS, Person, ROOT, launch } from './lib/browser.mjs'
import { settle } from './lib/steps.mjs'

const OUT = path.join(ROOT, 'docs', 'design', 's8')
mkdirSync(OUT, { recursive: true })
const browser = await launch()
const shot = (page, name, theme) => page.screenshot({ path: path.join(OUT, `${name}-${theme}.jpg`), type: 'jpeg', quality: 80 })

for (const theme of ['light', 'dark']) {
  // ---- the sign-in screen, in its states (nobody signed in)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme })
  const page = await context.newPage()
  const app = JOURNEYS.clearance.app
  await page.goto(`${app}/login`)
  await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  await page.waitForTimeout(400)
  await shot(page, 'signin-1-default', theme)
  await page.getByLabel('Username').fill('hamza.farooqui')
  await page.locator('input[name="password"]').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('alert').waitFor()
  await shot(page, 'signin-2-wrong-details', theme)
  for (let i = 0; i < 6; i += 1) {
    await page.getByLabel('Username').fill('lockout.demo')
    await page.locator('input[name="password"]').fill('x')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForTimeout(500)
  }
  await page.getByText(/Too many attempts/).waitFor({ timeout: 20000 })
  await shot(page, 'signin-3-locked-out', theme)
  await page.route('**/api/auth/login/', (route) => route.abort('connectionrefused'))
  await page.getByLabel('Username').fill('hamza.farooqui')
  await page.locator('input[name="password"]').fill('x')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForTimeout(700)
  await shot(page, 'signin-4-cannot-reach', theme)
  await page.unroute('**/api/auth/login/')
  await page.goto(`${app}/login?reason=expired&next=%2Fclearance%2Fjob`)
  await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  await page.waitForTimeout(300)
  await shot(page, 'signin-5-session-expired', theme)
  await page.setViewportSize({ width: 390, height: 780 })
  await page.waitForTimeout(300)
  await shot(page, 'signin-6-narrow', theme)
  await context.close()

  // ---- signed-in screens
  const accounts = await new Person(browser, 'clearance', 'ibrahim.qazi', { theme }).open()
  await accounts.page.waitForTimeout(1500)
  await shot(accounts.page, 'welcome-and-waiting-accounts', theme)
  await accounts.page.getByRole('button', { name: 'Help' }).click()
  await accounts.page.waitForTimeout(300)
  await shot(accounts.page, 'help-menu', theme)
  await accounts.page.keyboard.press('Escape')
  await accounts.page.keyboard.press('?')
  await accounts.page.waitForTimeout(400)
  await shot(accounts.page, 'shortcut-sheet', theme)
  await accounts.page.keyboard.press('Escape')
  await accounts.page.getByRole('button', { name: 'Account menu' }).click()
  await accounts.page.waitForTimeout(300)
  await shot(accounts.page, 'user-menu', theme)
  await accounts.close()

  // ---- both tours, every step
  for (const [journey, who] of [['clearance', 'hamza.farooqui'], ['water', 'ayesha.khan']]) {
    const p = await new Person(browser, journey, who, { theme }).open()
    await p.page.getByRole('button', { name: 'Help' }).click()
    await p.page.getByRole('button', { name: /Take the tour|Pick up the tour/ }).first().click()
    let n = 0
    for (let i = 0; i < 12; i += 1) {
      const card = p.page.locator('.tour-card')
      await card.waitFor({ timeout: 25000 }).catch(() => null)
      if (!(await card.count())) break
      await p.page.waitForTimeout(450)
      await shot(p.page, `tour-${journey}-${String(++n).padStart(2, '0')}`, theme)
      const last = (await card.getByRole('button', { name: 'Done' }).count()) > 0
      await card.getByRole('button', { name: last ? 'Done' : 'Next' }).click()
      if (last) break
    }
    await p.close()
  }

  // ---- the copy toast
  const owner = await new Person(browser, 'clearance', 'hamza.farooqui', { theme }).open()
  await owner.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: JOURNEYS.clearance.app }).catch(() => undefined)
  const id = await owner.page.evaluate(async () => (await (await fetch('http://localhost:8201/api/data/clearance/job/?limit=1', { credentials: 'include' })).json()).results[0].id)
  await owner.page.goto(`${owner.base.app}/clearance/job/${id}`)
  await owner.page.locator('form.form-sheet').waitFor()
  await settle(owner.page)
  await owner.page.locator('button.form-header__id').click()
  await owner.page.waitForTimeout(500)
  await shot(owner.page, 'copied-toast', theme)
  await owner.close()
}
await browser.close()
console.log('screenshots in docs/design/s8/')
