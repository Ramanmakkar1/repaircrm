"use client";

import { setCustomerFieldAction } from "@/app/(app)/customers/field-actions";
import { InlineEdit } from "@/components/ui/inline-edit";

/**
 * A customer's phone, email or referrer, changed where it sits.
 *
 * All three are plain single-line strings with no display rule of their own,
 * so unlike the ticket fields this is one component rather than four — the
 * only thing that varies is which column it writes.
 *
 * The header cells used to be `tel:` and `mailto:` links. They are editors
 * now, and a link inside `InlineEdit`'s read button would be both invalid
 * markup and an ambiguous click. The Details card below still carries all
 * three numbers and the address as dialable links, which is where somebody
 * reaching for the phone is already looking.
 */
export function CustomerField({
  customerId,
  field,
  value,
  label,
  placeholder = "—",
  className,
}: {
  customerId: string;
  /**
   * The allow-list, mirrored as a type. The server re-checks it — this is the
   * convenience half, not the guard.
   */
  field: "phone" | "email" | "referredBy";
  /** "" when the column is null. */
  value: string;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <InlineEdit
      label={label}
      value={value}
      placeholder={placeholder}
      className={className}
      onSave={async (next) => {
        const result = await setCustomerFieldAction(customerId, field, next);
        // Returned, not thrown, on purpose — a thrown message does not survive
        // the Server Action boundary in a production build. See the note in
        // app/(app)/customers/field-actions.ts.
        if (!result.ok) throw new Error(result.error);
      }}
    />
  );
}
