import { createContext, useContext, useEffect } from 'react'

/**
 * The last breadcrumb is the one thing the shell can't derive from the URL
 * and the registry: "Emma Whitfield (Globex Industries)" only exists once
 * the form has loaded the record. A page states its own label here; the
 * shell shows it. Outside the shell (no provider) this is a no-op.
 */
export const PageLabelContext = createContext<(label: string | null) => void>(() => {})

export function useCurrentPageLabel(label: string | null) {
  const setLabel = useContext(PageLabelContext)
  useEffect(() => {
    setLabel(label)
    return () => setLabel(null)
  }, [label, setLabel])
}
