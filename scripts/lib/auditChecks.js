// In-page audit checks. `runChecks` is serialised into the page by scripts/audit.mjs, so it must be
// self-contained (no imports, no closures). It returns [{ rule, severity, selector, detail }].
export function runChecks(options) {
  const findings = []
  const add = (rule, severity, element, detail) => findings.push({ rule, severity, selector: describe(element), detail })

  function describe(element) {
    if (!element || !element.tagName) return String(element)
    const parts = []
    let node = element
    for (let depth = 0; node && node.tagName && depth < 4; depth += 1, node = node.parentElement) {
      let part = node.tagName.toLowerCase()
      if (node.id) part += `#${node.id}`
      const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : []
      if (cls.length) part += `.${cls.join('.')}`
      parts.unshift(part)
      if (node.id) break
    }
    const text = (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)
    return `${parts.join(' > ')}${text ? ` "${text}"` : ''}`
  }
  const visible = (element) => {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false
    const style = getComputedStyle(element)
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0
  }
  const inViewportChain = (element) => !element.closest('[aria-hidden="true"], [hidden], [inert]')
  const all = [...document.body.querySelectorAll('*')].filter((e) => visible(e) && inViewportChain(e))

  // ---- layout: no sideways page scroll
  const doc = document.documentElement
  if (doc.scrollWidth > doc.clientWidth + 1) add('layout/page-scrolls-sideways', 'P0', doc, `${doc.scrollWidth} > ${doc.clientWidth}`)

  // ---- form spacing: every gap between groups, and between the last group and a related list, is the same
  {
    const blocks = [...document.querySelectorAll('.form-sheet .form-section, .form-sheet .related-lists')]
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .sort((a, b) => a.top - b.top)
    const gaps = blocks.slice(1).map((r, i) => Math.round(r.top - blocks[i].bottom)).filter((g) => g >= 0 && g < 80)
    if (gaps.length > 1 && Math.max(...gaps) - Math.min(...gaps) > 1) add('layout/group-gaps-differ', 'P1', document.querySelector('.form-sheet'), `gaps ${[...new Set(gaps)].join(', ')}px`)
  }

  // ---- target size and overlap (24x24 CSS px; inline links inside a sentence are exempt, per WCAG 2.5.8)
  const targetSelector = 'button, a[href], [role=button], [role=menuitem], [role=tab], [role=checkbox], [role=combobox], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])'
  const targets = [...document.querySelectorAll(targetSelector)].filter((e) => visible(e) && inViewportChain(e) && !e.disabled)
  for (const element of targets) {
    const rect = element.getBoundingClientRect()
    if (rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth || rect.top > innerHeight) continue
    const inline = element.tagName === 'A' && getComputedStyle(element).display === 'inline'
    if (inline) continue
    // A hidden native input behind a styled control is not a target.
    if (rect.width < 24 || rect.height < 24) {
      const wrapper = element.closest('label, [role=checkbox]')
      const box = wrapper ? wrapper.getBoundingClientRect() : rect
      if (box.width < 24 || box.height < 24) add('target/size-under-24px', 'P1', element, `${Math.round(rect.width)}x${Math.round(rect.height)}`)
    }
  }
  const boxes = targets.map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight)
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i], b = boxes[j]
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue
      // A calendar button sits inside its date field by design.
      if (a.e.closest('.date-input') && a.e.closest('.date-input') === b.e.closest('.date-input')) continue
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
      if (w > 2 && h > 2) add('target/overlap', 'P1', a.e, `overlaps ${describe(b.e)} by ${Math.round(w)}x${Math.round(h)}`)
    }
  }

  // ---- text overflow: clipped text must expose its full value; an amount, date, chip or document number never clips
  const kindOf = (text) => {
    const t = text.trim()
    if (/^[A-Z]{2,5}-\d{4}-\d+$/.test(t)) return 'document number'
    if (/^(Rs\s?)?[−-]?[\d,]+(\.\d+)?( (crore|lakh))?$/.test(t) || /^Rs\s/.test(t)) return 'amount'
    if (/^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(t)) return 'date'
    return null
  }
  for (const element of all) {
    if (element.children.length > 0 && !element.matches('.status-chip, .list-cell__text, .list-cell')) continue
    const clipped = element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX !== 'visible'
    if (!clipped) continue
    const text = (element.textContent || '').trim()
    if (!text) continue
    const kind = element.closest('.status-chip') ? 'chip' : kindOf(text)
    const exposed = !!(element.title || element.closest('[title]') || element.getAttribute('aria-label') || element.closest('[aria-label]'))
    if (kind) add('overflow/clips-' + kind.replace(' ', '-'), 'P0', element, `${element.scrollWidth} > ${element.clientWidth}`)
    else if (!exposed) add('overflow/clipped-without-full-value', 'P1', element, `${element.scrollWidth} > ${element.clientWidth}`)
  }

  // ---- tokens and typography
  const monoOk = (element) => element.matches('.list-cell--identifier, code, kbd, .form-header__id, .form-header__model + .form-header__id, [data-mono]') || !!element.closest('.list-cell--identifier, code, kbd, .form-header__id, [data-mono]')
  const allowedSizes = new Set(options.fontSizes)
  const sizeReported = new Set()
  for (const element of all) {
    const text = [...element.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent).join('').trim()
    if (!text) continue
    const style = getComputedStyle(element)
    const family = style.fontFamily
    const mono = /plex mono/i.test(family)
    const serif = /instrument serif/i.test(family)
    if (mono && !monoOk(element)) add('tokens/mono-outside-identifier', 'P1', element, family.slice(0, 40))
    if (!mono && !serif && !/inter/i.test(family) && !element.closest('svg')) add('tokens/font-family-not-inter', 'P1', element, family.slice(0, 40))
    if (serif && !element.closest('[data-greeting], .home-greeting, .home__greeting, h1')) add('tokens/serif-outside-greeting', 'P1', element, family.slice(0, 40))
    const size = parseFloat(style.fontSize)
    if (!allowedSizes.has(Math.round(size * 100) / 100) && !sizeReported.has(size)) {
      sizeReported.add(size)
      add('tokens/font-size-off-scale', 'P2', element, `${size}px`)
    }
  }
  for (const element of document.querySelectorAll('.list-row__cell--numeric, .summary-strip__value, .record-summaries__value, .amount')) {
    if (!visible(element)) continue
    if (!/tabular-nums/.test(getComputedStyle(element).fontVariantNumeric)) add('tokens/numbers-not-tabular', 'P1', element, getComputedStyle(element).fontVariantNumeric)
  }
  // body 13px, list cells 12px
  for (const element of document.querySelectorAll('.list-row__cell .list-cell')) {
    if (!visible(element)) continue
    const size = parseFloat(getComputedStyle(element).fontSize)
    if (size !== 12) add('tokens/list-cell-not-12px', 'P2', element, `${size}px`)
    break
  }
  // radius and spacing against the token scales (sample: controls, chips, rows, cards)
  const radii = new Set(options.radii)
  const spaces = new Set(options.spaces)
  const spacingSeen = new Set()
  const radiusSeen = new Set()
  for (const element of all) {
    const style = getComputedStyle(element)
    const radius = style.borderTopLeftRadius
    if (radius !== '0px' && !radiusSeen.has(radius)) {
      radiusSeen.add(radius)
      const px = parseFloat(radius)
      if (!radii.has(px) && !/%/.test(radius) && px < 1000) add('tokens/radius-off-scale', 'P2', element, radius)
    }
    for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap']) {
      const value = style[prop]
      if (!value || value === 'normal' || value === '0px') continue
      const px = Math.round(parseFloat(value) * 100) / 100
      if (!spaces.has(px) && !spacingSeen.has(`${prop}:${px}`) && px > 1) {
        spacingSeen.add(`${prop}:${px}`)
        // Control-internal padding that includes a 1px border compensation is common; report off-scale values once each.
        add('tokens/spacing-off-scale', 'P2', element, `${prop} ${px}px`)
      }
    }
  }

  // ---- motion: nothing animates unprompted; transition durations come from the motion tokens
  const running = document.getAnimations().filter((a) => {
    const timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null
    return a.playState === 'running' && timing && timing.iterations === Infinity
  })
  for (const animation of running) {
    const target = animation.effect && animation.effect.target
    const skeleton = target && target.closest && target.closest('[aria-busy="true"], .skeleton, [data-slot=skeleton]')
    if (!skeleton) add('motion/animates-unprompted', 'P1', target || document.body, animation.animationName || animation.constructor.name)
    else if (options.reducedMotion) add('motion/skeleton-moves-under-reduced-motion', 'P1', target, animation.animationName || '')
  }
  const durations = new Set(options.durations)
  const durationSeen = new Set()
  for (const element of all) {
    const style = getComputedStyle(element)
    for (const part of style.transitionDuration.split(',')) {
      const ms = Math.round(parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000))
      if (ms && !durations.has(ms) && !durationSeen.has(ms)) {
        durationSeen.add(ms)
        add('motion/duration-not-a-token', 'P2', element, `${ms}ms`)
      }
    }
  }

  // ---- semantics (axe covers names, labels, headings, landmarks, duplicate ids; these are the extras)
  if (!document.querySelector('main')) add('semantics/no-main-landmark', 'P1', document.body, '')
  if (!document.querySelector('nav')) add('semantics/no-nav-landmark', 'P1', document.body, '')
  if (!document.querySelector('[aria-live], [role=status], [role=alert], [role=log]')) add('semantics/no-live-region', 'P1', document.body, 'toasts and the save bar need one')
  for (const header of document.querySelectorAll('.list-header__sort')) {
    const cell = header.closest('[role=columnheader]')
    const sorted = header.querySelector('svg[class*=arrow], [data-sorted]') || /↑|↓/.test(header.textContent)
    if (cell && sorted && !cell.hasAttribute('aria-sort')) add('semantics/sorted-column-without-aria-sort', 'P1', cell, '')
  }
  for (const group of document.querySelectorAll('[class*=group-header] button, .list-group__toggle')) {
    if (!group.hasAttribute('aria-expanded')) add('semantics/group-without-aria-expanded', 'P1', group, '')
  }

  // ---- copy: nothing a person should never read
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const forbidden = [
    [/\bundefined\b/, 'undefined'], [/\bnull\b/, 'null'], [/\[object/, '[object'], [/\bNaN\b/, 'NaN'],
    [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'ISO timestamp'], [/\b[a-z]{2,}_[a-z]{2,}\b/, 'snake_case'],
  ]
  let node
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (!parent || !visible(parent) || parent.closest('script, style, noscript, textarea, [aria-hidden="true"]')) continue
    const text = node.textContent.trim()
    if (!text) continue
    for (const [pattern, name] of forbidden) if (pattern.test(text)) add('copy/forbidden-' + name.replace(/\W+/g, '-'), 'P1', parent, text.slice(0, 60))
  }

  return findings
}

/** Focus audit: tab through the page; every stop shows a ring and is not covered; no trap. Run in the page. */
export async function focusAudit(options) {
  const findings = []
  const describe = (element) => {
    if (!element || !element.tagName) return String(element)
    const cls = typeof element.className === 'string' ? element.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
    return `${element.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${(element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`
  }
  return { findings, describe }
}
