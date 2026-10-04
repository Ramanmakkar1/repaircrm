import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CustomerCombobox } from "@/components/customers/customer-combobox";

/**
 * The inline "New customer" box inside the repair, estimate and invoice forms.
 * The server takes a name OR a phone number, so the name box must not be
 * natively `required` — useGuidedForm's checkValidity() would block a customer
 * who only gave their number. The either-or rule itself lives in
 * newCustomerContactMessage (tests/intake.test.ts) and is applied as custom
 * validity on the name box.
 */
describe("CustomerCombobox — New customer box", () => {
  const html = renderToStaticMarkup(
    React.createElement(CustomerCombobox, { customers: [], value: "new", onChange: () => {} }),
  );

  it("shows a name box and a phone box", () => {
    expect(html).toContain('name="newCustomerName"');
    expect(html).toContain('name="newCustomerPhone"');
  });

  it("does not make the name box required on its own", () => {
    const nameBox = html.match(/<input[^>]*name="newCustomerName"[^>]*>/)?.[0] ?? "";
    expect(nameBox).not.toContain("required");
  });
});
