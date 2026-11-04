/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// tokens.css is the source of truth. Row text in dark steps down (light-on-dark blooms), but body text
// must stay at 4.5:1 on every surface a row sits on, and the identifier and amount columns must stay
// brighter than the body cells.
const css = readFileSync(new URL('../../../tokens.css', import.meta.url), 'utf8')
const dark = css.slice(css.search(/^:root\[data-theme=['"]dark['"]\]/m))

function token(name: string): string {
  const own = dark.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (own) return own[1]
  const alias = dark.match(new RegExp(`--${name}:\\s*var\\(--([\\w-]+)\\)`))
  if (alias) return token(alias[1])
  throw new Error(`no dark value for --${name}`)
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('dark row text', () => {
  const surfaces = ['surface', 'surface-hover', 'surface-selected', 'row-selected-hover', 'ground']
  it.each(surfaces)('body cells keep 4.5:1 on %s', (surface) => {
    expect(contrast(token('cell-text'), token(surface))).toBeGreaterThanOrEqual(4.5)
  })
  it('identifiers and amounts are brighter than body cells', () => {
    expect(luminance(token('cell-strong-text'))).toBeGreaterThan(luminance(token('cell-text')))
  })
})
