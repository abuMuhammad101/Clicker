import { useState } from 'react'
import './SchemaViewer.css'
import { useModelSchema } from './useModelSchema'

const MODELS = [
  { appLabel: 'core', modelName: 'contact', label: 'Contact' },
  { appLabel: 'core', modelName: 'country', label: 'Country' },
]

export function SchemaViewer() {
  const [selected, setSelected] = useState(MODELS[0])
  const state = useModelSchema(selected.appLabel, selected.modelName)

  return (
    <div className="schema-viewer">
      <div className="schema-viewer__intro">
        <h1>Schema endpoint</h1>
        <p>
          Fetched live from <code>/api/schema/{selected.appLabel}/{selected.modelName}/</code> —
          nothing below is hardcoded per model.
        </p>
      </div>

      <div className="schema-viewer__tabs" role="tablist">
        {MODELS.map((model) => (
          <button
            key={model.modelName}
            type="button"
            role="tab"
            aria-pressed={model.modelName === selected.modelName}
            className="schema-viewer__tab"
            onClick={() => setSelected(model)}
          >
            {model.label}
          </button>
        ))}
      </div>

      <div className="schema-viewer__panel">
        {state.status === 'loading' && (
          <p className="schema-viewer__status">Loading schema…</p>
        )}

        {state.status === 'error' && (
          <p className="schema-viewer__status schema-viewer__status--error">
            Couldn't load schema: {state.message}
          </p>
        )}

        {state.status === 'ready' && (
          <>
            <div className="schema-viewer__panel-header">
              <h2>{state.schema.verbose_name_plural}</h2>
              <span className="meta">
                {state.schema.app_label}.{state.schema.model}
              </span>
            </div>

            <dl className="schema-viewer__meta-row">
              <div>
                <dt>Display field</dt>
                <dd>{state.schema.display_field ?? '—'}</dd>
              </div>
              <div>
                <dt>List columns</dt>
                <dd>{state.schema.list.columns.join(', ')}</dd>
              </div>
              <div>
                <dt>Search fields</dt>
                <dd>{state.schema.list.search_fields.join(', ') || '—'}</dd>
              </div>
            </dl>

            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Visible when</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(state.schema.fields).map(([name, field]) => (
                  <tr key={name}>
                    <td className="field-name">{name}</td>
                    <td>{field.label}</td>
                    <td>
                      <span className="type-chip">{field.type}</span>
                    </td>
                    <td>{field.required ? <span className="required-dot">●</span> : '—'}</td>
                    <td className="visible-when">
                      {field.visible_when
                        ? `${field.visible_when.field} = ${field.visible_when.equals}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <details className="schema-viewer__raw">
              <summary>Raw JSON</summary>
              <pre>{JSON.stringify(state.schema, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
    </div>
  )
}
