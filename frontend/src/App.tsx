import { FormRenderer } from './features/form-renderer/FormRenderer'
import { ListRenderer } from './features/list-renderer/ListRenderer'
import { SchemaViewer } from './features/schema-viewer/SchemaViewer'
import { FieldGallery } from './gallery/FieldGallery'

// Still no router dependency. List → form navigation now exists, but as
// plain page loads, which is enough to prove the loop. The cost is that
// going back to a list starts it at the top; client-side routing (and
// scroll restoration with it) is the fix when that starts to hurt.
//
//   /gallery                    field component gallery (dev-only)
//   /<app>/<model>              list, e.g. /core/contact
//   /<app>/<model>/<id>         edit a record, e.g. /core/contact/5
//   /<app>/<model>/new          create a record
//   anything else               schema viewer
const LIST_ROUTE = /^\/([a-z_]+)\/([a-z_]+)\/?$/
const RECORD_ROUTE = /^\/([a-z_]+)\/([a-z_]+)\/(\d+|new)\/?$/

function App() {
  const path = window.location.pathname
  if (path.startsWith('/gallery')) return <FieldGallery />

  const list = LIST_ROUTE.exec(path)
  if (list) return <ListRenderer appLabel={list[1]} model={list[2]} />

  const match = RECORD_ROUTE.exec(path)
  if (match) {
    const [, appLabel, model, id] = match
    return (
      <FormRenderer
        appLabel={appLabel}
        model={model}
        recordId={id === 'new' ? undefined : Number(id)}
        onSaved={(record) => {
          // A created record gets its real URL, so a reload reopens it
          // instead of starting another new one.
          if (id === 'new') {
            window.history.replaceState(null, '', `/${appLabel}/${model}/${record.id}`)
          }
        }}
      />
    )
  }

  return <SchemaViewer />
}

export default App
