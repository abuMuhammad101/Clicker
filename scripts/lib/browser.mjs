// Shared by rehearse.mjs and failsafe.mjs: sign in through the real sign-in form, with the password read from
// .env at run time (never written anywhere, never printed), and watch what the browser does.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
export const { chromium } = require('playwright')
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const JOURNEYS = {
  water: { app: 'http://localhost:5273', api: 'http://localhost:8200' },
  clearance: { app: 'http://localhost:5274', api: 'http://localhost:8201' },
}

export function passwordFor(username) {
  const key = `DEMO_PASSWORD_${username.toUpperCase().replace('.', '_')}`
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim()
  }
  throw new Error(`No ${key} in .env: seed the database first (scripts/demo_setup.sh).`)
}

/** One signed-in person: their own browser context, and a log of everything the page did. */
export class Person {
  constructor(browser, journey, username, { theme = 'light', viewport = { width: 1440, height: 900 }, label, reducedMotion = 'no-preference', initScript = null } = {}) {
    this.reducedMotion = reducedMotion
    this.initScript = initScript
    this.journey = journey
    this.username = username
    this.label = label ?? username
    this.base = JOURNEYS[journey]
    this.theme = theme
    this.viewport = viewport
    this.browser = browser
    this.hosts = new Set()
    this.consoleErrors = []
    this.badResponses = []
    this.allowedStatuses = [] // [{ status, urlPart }] the scene expects (the deliberate 404)
    this.requests = 0
  }

  async open() {
    this.context = await this.browser.newContext({ viewport: this.viewport, colorScheme: this.theme, deviceScaleFactor: 1, reducedMotion: this.reducedMotion })
    if (this.initScript) await this.context.addInitScript(this.initScript)
    this.page = await this.context.newPage()
    const { page } = this
    page.on('request', (request) => {
      this.requests += 1
      try { this.hosts.add(new URL(request.url()).host) } catch { /* data: URLs */ }
    })
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      // The browser logs every failed request as a console error without its URL; the response listener below
      // counts those precisely (and lets a scene's deliberate 404 through), so they are not counted twice.
      if (/^Failed to load resource: the server responded with a status of \d+/.test(message.text())) return
      this.consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => this.consoleErrors.push(`pageerror: ${error.message}`))
    page.on('response', (response) => {
      const status = response.status()
      if (status < 400) return
      const url = response.url()
      if (this.allowedStatuses.some((a) => a.status === status && url.includes(a.urlPart))) return
      this.badResponses.push(`${status} ${response.request().method()} ${url}`)
    })
    await page.goto(this.base.app + '/')
    await this.signIn()
    return this
  }

  async signIn() {
    const { page } = this
    await page.getByLabel('Username').fill(this.username)
    await page.locator('input[name="password"]').fill(passwordFor(this.username))
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('navigation').first().waitFor({ timeout: 30000 })
  }

  /** The 404s a scene deliberately provokes ("This record isn't available"): expected, and the only ones. */
  expect404(urlPart) { this.allowedStatuses.push({ status: 404, urlPart }) }

  /** A refusal a scene deliberately provokes and asserts on (a write while viewing as another role). */
  expectRefusal(status, urlPart) { this.allowedStatuses.push({ status, urlPart }) }

  async close() { await this.context.close() }
}

export async function launch() {
  return chromium.launch({ args: ['--no-sandbox'] })
}
