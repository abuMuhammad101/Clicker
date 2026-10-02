import { Button } from '@/components/ui/button'
import type { FormState } from '@/features/form-renderer/FormRenderer'
import './SaveBar.css'

/**
 * "Unsaved changes | Discard | Save". Rendered by a SURFACE in its own header
 * while the form inside it is dirty: the page's top bar and a peek drawer's
 * bar each draw one for their own form, and a future tab or split pane would
 * too. It knows nothing about which container it is in, and nothing about
 * dirty tracking: it only draws the state the form reports and sends the
 * form's own save/discard commands back.
 */
export function SaveBar({ state }: { state: FormState }) {
  return (
    <div className="save-bar" role="group" aria-label="Unsaved changes">
      <span className="save-bar__label">
        <span className="save-bar__dot" aria-hidden />
        Unsaved changes
      </span>
      <div className="save-bar__actions">
        <Button
          type="button"
          variant="outline"
          disabled={state.saving}
          onClick={state.discard}
          className="h-[var(--control-height-sm)] px-[var(--control-padding-x)] text-[length:var(--text-sm)]"
        >
          Discard
        </Button>
        <Button
          type="button"
          disabled={state.saving}
          onClick={state.save}
          className="h-[var(--control-height-sm)] px-[var(--control-padding-x)] text-[length:var(--text-sm)]"
        >
          {state.saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
