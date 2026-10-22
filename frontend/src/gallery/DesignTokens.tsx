import { useState, type CSSProperties } from 'react'
import { TextField } from '@/fields/text/TextField'
import './tokens-gallery.css'

/**
 * /dev/tokens: the design tokens, rendered. Type scale, colour in light and
 * dark side by side, the field states, elevation, radius and motion, all from
 * tokens.css (nothing is scoped or overridden here). Dev-only, like the field
 * gallery. The values live in tokens.css; this page only shows them.
 */

const SWATCHES = ['0', '25', '50', '100', '150', '200', '300', '400', '500', '600', '700', '800', '900', '950']

const noop = () => {}

function Swatches() {
  return (
    <div className="tk-swatches">
      {SWATCHES.map((step) => (
        <div key={step} className="tk-swatch">
          <div className="tk-swatch__chip" style={{ background: `var(--n-${step})` }} />
          <code>n-{step}</code>
        </div>
      ))}
    </div>
  )
}

function Money({ dollars, cents }: { dollars: string; cents: string }) {
  return (
    <span className="tk-num">
      {dollars}
      <small>.{cents}</small>
    </span>
  )
}

function Panel({ mode }: { mode: 'light' | 'dark' }) {
  return (
    <div className={`tk-panel theme-${mode}`}>
      <span className="tk-tag">{mode}</span>

      <h3>Neutral ramp</h3>
      <Swatches />

      <h3>State carries meaning, accent is used once</h3>
      <div className="tk-chips">
        <span className="tk-chip tk-chip--positive">Paid</span>
        <span className="tk-chip tk-chip--warning">Requires approval</span>
        <span className="tk-chip tk-chip--danger">Failed</span>
        <span className="tk-chip tk-chip--info">Scheduled</span>
        <span className="tk-chip tk-chip--neutral">Draft</span>
        <span className="tk-chip tk-chip--accent">Selected</span>
      </div>

      <h3>Buttons</h3>
      <div className="tk-actions">
        <button type="button" className="tk-btn tk-btn--primary">
          Save
        </button>
        <button type="button" className="tk-btn">
          Discard
        </button>
        <button type="button" className="tk-btn tk-btn--danger">
          Delete
        </button>
      </div>

      <h3>Fields: the real components</h3>
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
      <div className="tk-table" role="table">
        <div className="tk-row tk-row--head" role="row">
          <span>Name</span>
          <span>Status</span>
          <span>Date</span>
          <span className="tk-num">Amount</span>
        </div>
        <div className="tk-row">
          <span>Northwind Traders</span>
          <span>
            <span className="tk-chip tk-chip--positive">Paid</span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Oct 21</span>
          <Money dollars="$12,480" cents="50" />
        </div>
        <div className="tk-row tk-row--selected">
          <span>Globex Industries (selected)</span>
          <span>
            <span className="tk-chip tk-chip--warning">Requires approval</span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Oct 20</span>
          <Money dollars="$980" cents="00" />
        </div>
        <div className="tk-row">
          <span>Acme Corporation</span>
          <span>
            <span className="tk-chip tk-chip--danger">Failed</span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Oct 18</span>
          <span className="tk-num tk-struck">$1,250.00</span>
        </div>
        <div className="tk-row">
          <span>Priya Shah</span>
          <span>
            <span className="tk-chip tk-chip--neutral">Draft</span>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Oct 17</span>
          <Money dollars="$64" cents="25" />
        </div>
      </div>

      <h3>Save bar (with a change count) and toast</h3>
      <div className="tk-savebar">
        <span>Unsaved changes</span>
        <span className="tk-savebar__count">· 3 fields</span>
        <span className="tk-spacer" />
        <button type="button" className="tk-btn">
          Discard
        </button>
        <button type="button" className="tk-btn tk-btn--primary">
          Save
        </button>
      </div>
      <div style={{ marginTop: 'var(--space-6)' }}>
        <span className="tk-toast">
          <span aria-hidden>✓</span>
          Contact archived
          <span className="tk-toast__undo">Undo</span>
        </span>
      </div>

      <h3>Elevation and radius</h3>
      <div className="tk-elev">
        <div>Card: border only</div>
        <div className="tk-elev--popover">Popover</div>
        <div className="tk-elev--drawer">Drawer</div>
        <div className="tk-elev--toast">Toast</div>
      </div>
      <div className="tk-radii" style={{ marginTop: 'var(--space-6)' }}>
        <div style={{ borderRadius: 'var(--radius-sm)' }}>4</div>
        <div style={{ borderRadius: 'var(--radius)' }}>6 ctrl</div>
        <div style={{ borderRadius: 'var(--radius-md)' }}>8 panel</div>
        <div style={{ borderRadius: 'var(--radius-lg)' }}>12</div>
        <div style={{ borderRadius: 'var(--radius-full)' }}>pill</div>
      </div>
    </div>
  )
}

const SCALE: [string, string, string][] = [
  ['--text-display', '34 / serif', 'Good afternoon, Hassan'],
  ['--text-2xl', '28', 'Empty states and onboarding'],
  ['--text-xl', '20', 'Page titles'],
  ['--text-lg', '16', 'Section headings'],
  ['--text-md', '14', 'Emphasised body'],
  ['--text-base', '13', 'Body and form inputs: the density thesis'],
  ['--text-sm', '12', 'List cells, column headers, secondary text'],
  ['--text-micro', '11', 'Helper text and chip labels'],
]

function TypeScale() {
  return (
    <div className="tk-panel theme-light">
      <div className="tk-scale">
        {SCALE.map(([token, size, sample]) => (
          <div key={token} className="tk-scale__row">
            <code>{token}</code>
            <span className="tk-scale__size">{size}</span>
            <span
              className="tk-scale__sample"
              style={{
                fontSize: `var(${token})`,
                fontFamily: token === '--text-display' ? 'var(--font-display)' : undefined,
                fontWeight: token === '--text-display' ? 400 : token === '--text-xl' || token === '--text-lg' ? 600 : 400,
              }}
            >
              {sample}
            </span>
          </div>
        ))}
        <div className="tk-scale__row">
          <code>--font-mono</code>
          <span className="tk-scale__size">12</span>
          <span className="tk-scale__sample" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
            US-84-1234567 · HW-BOLT-M8-40 (record identifiers and codes only)
          </span>
        </div>
        <div className="tk-scale__row">
          <code>tabular-nums</code>
          <span className="tk-scale__size">12</span>
          <span className="tk-scale__sample tk-num" style={{ fontSize: 'var(--text-sm)', textAlign: 'left' }}>
            $12,480<small>.50</small> · $1,111<small>.11</small> · $8,097<small>.08</small>
          </span>
        </div>
      </div>
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
    <div className="tk-panel theme-light">
      <div className="tk-actions" style={{ marginBottom: 'var(--space-6)' }}>
        <button type="button" className="tk-btn tk-btn--primary" onClick={() => setOn((v) => !v)}>
          Play
        </button>
        <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>
          Only moves when you press it. With reduced motion on, the travel collapses to a 100ms fade.
        </span>
      </div>
      <div className="tk-motion">
        {MOTION.map((m) => (
          <div key={m.label} className="tk-motion__row">
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{m.label}</span>
            <div className="tk-motion__track">
              <span
                className="tk-motion__dot"
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

export function DesignTokens() {
  return (
    <div className="tk-page">
      <h1>Design tokens</h1>
      <p className="tk-lede">
        What <code>tokens.css</code> defines, rendered with the real field components. Light and
        dark are shown side by side; the app follows the system setting.
      </p>

      <section className="tk-section">
        <h2>Type</h2>
        <p>Inter for the interface, Plex Mono for identifiers only, Instrument Serif for the greeting.</p>
        <TypeScale />
      </section>

      <section className="tk-section">
        <h2>Colour, fields, list, save bar, toast, elevation, radius</h2>
        <p>
          Cool-violet neutrals, one ink-violet accent, state colours that only ever mean state.
          Dark lifts surfaces instead of shadowing them.
        </p>
        <div className="tk-grid tk-grid--2">
          <Panel mode="light" />
          <Panel mode="dark" />
        </div>
      </section>

      <section className="tk-section">
        <h2>Motion</h2>
        <p>
          Three durations, three easings. Nothing animates on its own; everything below waits for a
          press.
        </p>
        <MotionDemo />
      </section>
    </div>
  )
}
