import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from './router'

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
}

/**
 * A real <a href>, so middle-click, cmd/ctrl-click and "copy link" all
 * behave as they would on any page. Only a plain left click is taken over
 * and turned into in-app navigation (which an unsaved form can intercept).
 */
export function Link({ to, onClick, target, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (target && target !== '_self')
    ) {
      return
    }
    event.preventDefault()
    navigate(to)
  }
  return <a href={to} target={target} onClick={handleClick} {...rest} />
}
