import { SchemaViewer } from './features/schema-viewer/SchemaViewer'
import { FieldGallery } from './gallery/FieldGallery'

// No router dependency for two static, dev-only routes — a path check is
// enough. Add react-router when there's an actual multi-screen app to
// navigate, not preemptively for this.
function App() {
  const isGallery = window.location.pathname.startsWith('/gallery')
  return isGallery ? <FieldGallery /> : <SchemaViewer />
}

export default App
