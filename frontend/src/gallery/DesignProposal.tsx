import { useEffect, useState, type CSSProperties } from 'react'
import { TextField } from '@/fields/text/TextField'
import './proposal.css'

/**
 * /dev/proposal — the design pass's checkpoint-1 page. Everything here is a
 * PROPOSAL rendered with the real field components; nothing in the app uses
 * these tokens yet (see proposal.css). Dev-only, like the field gallery.
 */

const FONT_HREF =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Inter:wght@400;500;600',
    'family=Geist:wght@400;500;600',
    'family=Geist+Mono:wght@400;500',
    'family=IBM+Plex+Sans:wght@400;500;600',
    'family=Instrument+Serif:ital@0;1',
    'family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400',
    'family=Source+Serif+4:opsz,wght@8..60,400',
  ].join('&') +
  '&display=swap'

const SWATCHES = ['0', '25', '50', '100', '150', '200', '300', '400', '500', '600', '700', '800', '900', '950']

const noop = () => {}

function Swatches() {
  return (
    <div className="pp-swatches">
      {SWATCHES.map((step) => (
        <div key={step} className="pp-swatch">
          <div className="pp-swatch__chip" style={{ background: `var(--n-${step})` }} />
          <code>n-{step}</code>
        </div>
      ))}
    </div>
  )
}

function Money({ dollars, cents }: { dollars: string; cents: string }) {
  return (
    <span className="pp-num">
      {dollars}
      <small>.{cents}</small>
    </span>
  )
}

function Panel({ mode }: { mode: 'light' | 'dark' }) {
  return (
    <div className="proposal pp-panel" data-mode={mode}>
      <span className="pp-tag">{mode}</span>

      <h3>Neutral ramp</h3>
      <Swatches />

      <h3>State carries meaning, accent is used once</h3>
      <div className="pp-chips">
        <span className="pp-chip pp-chip--positive">Paid</span>
        <span className="pp-chip pp-chip--warning">Requires approval</span>
        <span className="pp-chip pp-chip--danger">Failed</span>
        <span className="pp-chip pp-chip--info">Scheduled</span>
        <span className="pp-chip pp-chip--neutral">Draft</span>
        <span className="pp-chip pp-chip--accent">Selected</span>
      </div>

      <h3>Buttons</h3>
      <div className="pp-actions">
        <button type="button" className="pp-btn pp-btn--primary">
          Save
        </button>
        <button type="button" className="pp-btn">
          Discard
        </button>
        <button type="button" className="pp-btn pp-btn--danger">
          Delete
        </button>
      </div>

      <h3>Fields: the real components, proposed tokens</h3>
      <TextField name={`${mode}-default`} label="Name" value={null} onChange={noop} />
      <TextField name={`${mode}-focused`} label="Name" value={null} onChange={noop} forceFocused />
      <TextField name={`${mode}-filled`} label="Name" value="Acme Corporation" onChange={noop} />
      <TextField name={`${mode}-readonly`} label="Name" value="Acme Corporation" readOnly onChange={noop} />
      <TextField name={`${mode}-disabled`} label="Name" value="Acme Corporation" disabled onChange={noop} />
      <TextField
        name={`${mode}-error`}
        label="Name"
        value="Acme Corp"
        error="A contact with this name already exists."
        onChange={noop}
      />
      <TextField name={`${mode}-required`} label="Name" value={null} required onChange={noop} />

      <h3>List: sentence-case headers, tabular figures, muted cents</h3>
      <div className="pp-table" role="table">
        <div className="pp-row pp-row--head" role="row">
          <span>Name</span>
          <span>Status</span>
          <span>Date</span>
          <span className="pp-num">Amount</span>
        </div>
        <div className="pp-row">
          <span>Northwind Traders</span>
          <span>
            <span className="pp-chip pp-chip--positive">Paid</span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Oct 21</span>
          <Money dollars="$12,480" cents="50" />
        </div>
        <div className="pp-row pp-row--selected">
          <span>Globex Industries (selected)</span>
          <span>
            <span className="pp-chip pp-chip--warning">Requires approval</span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Oct 20</span>
          <Money dollars="$980" cents="00" />
        </div>
        <div className="pp-row">
          <span>Acme Corporation</span>
          <span>
            <span className="pp-chip pp-chip--danger">Failed</span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Oct 18</span>
          <span className="pp-num pp-struck">$1,250.00</span>
        </div>
        <div className="pp-row">
          <span>Priya Shah</span>
          <span>
            <span className="pp-chip pp-chip--neutral">Draft</span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Oct 17</span>
          <Money dollars="$64" cents="25" />
        </div>
      </div>

      <h3>Save bar (with a change count) and toast</h3>
      <div className="pp-savebar">
        <span>Unsaved changes</span>
        <span className="pp-savebar__count">· 3 fields</span>
        <span className="pp-spacer" />
        <button type="button" className="pp-btn">
          Discard
        </button>
        <button type="button" className="pp-btn pp-btn--primary">
          Save
        </button>
      </div>
      <div style={{ marginTop: 'var(--space-6)' }}>
        <span className="pp-toast">
          <span aria-hidden>✓</span>
          Contact archived
          <span className="pp-toast__undo">Undo</span>
        </span>
      </div>

      <h3>Elevation and radius</h3>
      <div className="pp-elev">
        <div>Card: border only</div>
        <div className="pp-elev--popover">Popover</div>
        <div className="pp-elev--drawer">Drawer</div>
        <div className="pp-elev--toast">Toast</div>
      </div>
      <div className="pp-radii" style={{ marginTop: 'var(--space-6)' }}>
        <div style={{ borderRadius: 'var(--radius-sm)' }}>4</div>
        <div style={{ borderRadius: 'var(--radius)' }}>6 ctrl</div>
        <div style={{ borderRadius: 'var(--radius-md)' }}>8 panel</div>
        <div style={{ borderRadius: 'var(--radius-lg)' }}>12</div>
        <div style={{ borderRadius: 'var(--radius-full)' }}>pill</div>
      </div>
    </div>
  )
}

interface FontOption {
  key: string
  name: string
  stack: string
  note: string
}

const FONTS: FontOption[] = [
  {
    key: 'plex',
    name: 'A · IBM Plex Sans (current)',
    stack: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    note: 'OFL. Pairs with Plex Mono by design. Wider, slightly mechanical; reads as enterprise software.',
  },
  {
    key: 'inter',
    name: 'B · Inter',
    stack: 'Inter, ui-sans-serif, system-ui, sans-serif',
    note: 'OFL. Built for UI at 12–14px: tall x-height, tight, tabular figures. The neutral choice most fintech tools use.',
  },
  {
    key: 'geist',
    name: 'C · Geist',
    stack: 'Geist, ui-sans-serif, system-ui, sans-serif',
    note: 'OFL. Crisper and slightly more geometric than Inter; has its own mono. A touch more character.',
  },
]

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function Specimen({ font, display }: { font: FontOption; display: string }) {
  const style = { '--pp-font': font.stack, '--pp-display': display } as CSSProperties
  return (
    <div className="proposal pp-type" style={style}>
      <p className="pp-type__name">{font.name}</p>
      <p className="pp-type__meta">{font.note}</p>
      <p className="pp-type__greeting">{greeting()}, Hassan</p>
      <h2 className="pp-type__title">Contacts</h2>
      <p className="pp-type__body">
        Northwind Traders hasn’t been invoiced since October. 3 records need attention before the
        month closes.
      </p>
      <div className="pp-table" role="table">
        <div className="pp-row pp-row--head">
          <span>Name</span>
          <span>Status</span>
          <span className="pp-num">Amount</span>
        </div>
        <div className="pp-row">
          <span>Northwind Traders</span>
          <span>
            <span className="pp-chip pp-chip--positive">Paid</span>
          </span>
          <Money dollars="$12,480" cents="50" />
        </div>
        <div className="pp-row">
          <span>Globex Industries</span>
          <span>
            <span className="pp-chip pp-chip--warning">Pending</span>
          </span>
          <Money dollars="$1,111" cents="11" />
        </div>
        <div className="pp-row">
          <span>Acme Corporation</span>
          <span>
            <span className="pp-chip pp-chip--neutral">Draft</span>
          </span>
          <Money dollars="$8,097" cents="08" />
        </div>
      </div>
      <p className="pp-type__body" style={{ marginTop: 'var(--space-7)', marginBottom: 0 }}>
        0123456789 · il1I O0 · <code>US-84-1234567</code> · <code>HW-BOLT-M8-40</code>
      </p>
    </div>
  )
}

const MOTION = [
  { label: 'instant · 100ms · hover, press, focus', d: '100ms', e: 'cubic-bezier(0.2, 0, 0.2, 1)' },
  { label: 'base · 160ms · fades, value changes', d: '160ms', e: 'cubic-bezier(0.2, 0, 0.2, 1)' },
  { label: 'slow · 240ms · ease-out · drawer, bar, toast', d: '240ms', e: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  { label: 'slow · 240ms · linear (what NOT to do)', d: '240ms', e: 'linear' },
]

function MotionDemo() {
  const [on, setOn] = useState(false)
  return (
    <div className="proposal pp-panel">
      <div className="pp-actions" style={{ marginBottom: 'var(--space-6)' }}>
        <button type="button" className="pp-btn pp-btn--primary" onClick={() => setOn((v) => !v)}>
          Play
        </button>
        <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>
          Only moves when you press it. With reduced motion on, the travel collapses to a 100ms fade.
        </span>
      </div>
      <div className="pp-motion">
        {MOTION.map((m) => (
          <div key={m.label} className="pp-motion__row">
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{m.label}</span>
            <div className="pp-motion__track">
              <span
                className="pp-motion__dot"
                data-on={on}
                style={{ '--d': m.d, '--e': m.e } as CSSProperties}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DesignProposal() {
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    document.head.appendChild(link)
    return () => link.remove()
  }, [])

  return (
    <div className="pp-page">
      <h1>Design system proposal</h1>
      <p className="pp-lede">
        Checkpoint 1. Nothing here is applied to the app. Real field components render in the
        proposed tokens, light and dark side by side, so you can judge by eye. Fonts load from
        Google here only so you can compare; the build would self-host the one you pick.
      </p>

      <section className="pp-section">
        <h2>1. Typeface</h2>
        <p>
          Same content, three faces. Judge the table figures and the 12px row text first; that is
          where an ERP lives.
        </p>
        <div className="pp-grid pp-grid--3">
          {FONTS.map((f) => (
            <Specimen key={f.key} font={f} display='"Instrument Serif", Georgia, serif' />
          ))}
        </div>
      </section>

      <section className="pp-section">
        <h2>2. Display voice: the home greeting only</h2>
        <p>One serif, used once on one screen. Three candidates (all OFL).</p>
        <div className="pp-grid pp-grid--3">
          {[
            ['Instrument Serif', '"Instrument Serif", Georgia, serif'],
            ['Newsreader', 'Newsreader, Georgia, serif'],
            ['Source Serif 4', '"Source Serif 4", Georgia, serif'],
          ].map(([name, stack]) => (
            <div key={name} className="proposal pp-type" style={{ '--pp-display': stack } as CSSProperties}>
              <p className="pp-type__meta" style={{ margin: '0 0 var(--space-5)' }}>
                {name}
              </p>
              <p className="pp-type__greeting" style={{ marginBottom: 0 }}>
                {greeting()}, Hassan
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="pp-section">
        <h2>3. Colour, spacing, radius, elevation, focus: light and dark</h2>
        <p>
          Cool-violet neutral ramp, the same ink-violet accent, state colours that only ever mean
          state. Dark mode lifts surfaces instead of shadowing them.
        </p>
        <div className="pp-grid pp-grid--2">
          <Panel mode="light" />
          <Panel mode="dark" />
        </div>
      </section>

      <section className="pp-section">
        <h2>4. Motion</h2>
        <p>
          Three durations, two easings. Nothing animates on its own; everything below waits for a
          press.
        </p>
        <MotionDemo />
      </section>
    </div>
  )
}
