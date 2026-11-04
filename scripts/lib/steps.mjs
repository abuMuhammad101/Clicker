// A tiny step runner and the few UI moves every journey shares. Nothing here knows a module: it drives the
// generic screens (a list, a view menu, a record, a workflow button) the way a person does.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './browser.mjs'

export const results = []
export const SHOTS = path.join(ROOT, 'docs', 'design', 's7')

export class Failure extends Error {}

export function check(condition, message) {
  if (!condition) throw new Failure(message)
}

export function equal(actual, expected, what) {
  if (actual !== expected) throw new Failure(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

export async function step(name, person, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - started })
    console.log(`  ok   ${name}`)
  } catch (error) {
    mkdirSync(path.join(SHOTS, 'failures'), { recursive: true })
    const file = path.join(SHOTS, 'failures', `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
    try { await person.page.screenshot({ path: file }) } catch { /* the page may be gone */ }
    results.push({ name, ok: false, ms: Date.now() - started, error: error.message })
    console.log(`  FAIL ${name}\n       ${error.message}\n       screenshot: ${path.relative(ROOT, file)}`)
    throw error
  }
}

/** Open a model's list and wait for it to settle. */
export async function openList(person, appModel, query = '') {
  const { page } = person
  await page.goto(`${person.base.app}/${appModel}${query}`)
  await page.locator('.list-toolbar__title').waitFor()
  await settle(page)
}

export async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
}

export async function pickView(person, label) {
  const { page } = person
  await page.locator('.list-toolbar__title button').click()
  await page.locator('.view-menu__item', { hasText: label }).first().click()
  await settle(page)
}

export async function rows(person) {
  const texts = await person.page.locator('.list-row').allInnerTexts()
  return texts.map((t) => t.replace(/\s*\n\s*/g, ' | '))
}

/** Find a record in its list by search text, and open its page. Returns the record id. */
export async function openRecord(person, appModel, text, { search = true, view = null } = {}) {
  const { page } = person
  await openList(person, appModel, search ? `?q=${encodeURIComponent(text)}` : '')
  if (view) await pickView(person, view)
  const found = page.locator('.list-row', { hasText: text }).first()
  await found.waitFor({ timeout: 15000 })
  await found.click()
  await page.waitForURL(/peek=/)
  const id = new URL(page.url()).searchParams.get('peek').split('.').pop()
  await page.goto(`${person.base.app}/${appModel}/${id}`)
  await page.locator('.form-header, .form-sheet').first().waitFor()
  await settle(page)
  return Number(id)
}

export async function pageText(person) {
  return (await person.page.locator('main').innerText()).replace(/\s+/g, ' ')
}

export async function sidebar(person) {
  return (await person.page.locator('nav').first().innerText()).split('\n').map((s) => s.trim()).filter(Boolean)
}

export function summary() {
  const failed = results.filter((r) => !r.ok)
  return { total: results.length, failed: failed.length, ms: results.reduce((a, r) => a + r.ms, 0) }
}
