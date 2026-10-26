// Keyboard focus helpers for the "Focus after in-place actions" rule in _docs/design-system.md. A browser drops focus to
// `body` when the focused control is disabled (a pending form) or removed (a replaced section); these decide whether that
// happened and put focus back once, on a deliberate target, without taking it from a control the user moved to.

/**
 * True when the action that just settled left keyboard focus dropped: nothing is focused (`body`), the focused element was
 * removed or is disabled, or it is one of `triggers` (the control that started the action, which the caller moves on from).
 * Focus the user placed on any other enabled control is not dropped.
 */
export function focusDropped(...triggers: (Element | null | undefined)[]): boolean {
  const active = document.activeElement
  return !active || active === document.body || !active.isConnected || active.matches(':disabled') || triggers.includes(active)
}

/** Moves focus to `target` once, only if focus was dropped (see `focusDropped`) and the target exists and is enabled. */
export function focusIfDropped(target: HTMLElement | null | undefined, ...triggers: (Element | null | undefined)[]): void {
  if (target && !target.matches(':disabled') && focusDropped(...triggers)) target.focus()
}
