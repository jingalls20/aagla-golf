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
  formAction,
  name,
  value,
}: {
  children: ReactNode;
  confirmText: string;
  className?: string;
  /** Route this specific button to a different server action than the
   *  enclosing form's own -- lets one row's "Clear" live inside a bigger
   *  form (the score-entry grid) without nesting a second <form>, which
   *  HTML doesn't allow. */
  formAction?: (formData: FormData) => void | Promise<void>;
  /** Paired with `value`, included in the submitted FormData only when this
   *  button is the one clicked -- how a per-row id reaches the action
   *  without a dedicated hidden input for every row. */
  name?: string;
  value?: string;
}) {
  return (
    <button
      type="submit"
      formAction={formAction}
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
