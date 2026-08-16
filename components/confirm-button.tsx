'use client';

import type { ReactNode } from 'react';

/**
 * A submit button that asks first. For actions a mis-click can't easily undo
 * -- deleting an event, a season, a score, or someone's admin access -- a
 * plain submit button is one careless click away from firing; this makes
 * that click cost a confirmation.
 */
export function ConfirmSubmitButton({
  children,
  confirmText,
  className,
  form,
  name,
  value,
}: {
  children: ReactNode;
  confirmText: string;
  className?: string;
  /**
   * Submit a form this button is not inside, by its id.
   *
   * The HTML `form` attribute exists precisely for this, and it is how a
   * row's "Clear" inside the score-entry grid submits its own little form
   * without nesting one, which HTML forbids.
   *
   * This replaced a `formAction` pointing at a different server action.
   * That looked right and silently lost data: React, on seeing a submitter
   * with its own `formAction`, adopts that action and then sets its
   * internal `submitter` to null -- after which it builds the payload with
   * a plain `new FormData(form)`, and a plain FormData never includes the
   * submit button's own name/value pair. So the row id never arrived and
   * the action threw on every click. Anything a server action needs has to
   * be a real field in the form it submits.
   */
  form?: string;
  name?: string;
  value?: string;
}) {
  return (
    <button
      type="submit"
      form={form}
      name={name}
      value={value}
      className={className}
      onClick={(e: { preventDefault: () => void }) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
