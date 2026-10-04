/** Client-safe contact matching; phone punctuation must not require retyping. */
export type SearchCustomer = {
  id: string;
  label: string;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
};

export function matchesCustomer(customer: SearchCustomer, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return false;
  if (/^[\d\s()+.\-]+$/.test(text)) {
    const digits = text.replace(/\D/g, "");
    return digits.length >= 4 && [customer.phone, customer.mobile].some((phone) =>
      phone?.replace(/\D/g, "").includes(digits),
    );
  }
  const haystack = [customer.label, customer.email].filter(Boolean).join(" ").toLowerCase();
  return text.split(/\s+/).every((word) => haystack.includes(word));
}

export function contactFromQuery(query: string) {
  const text = query.trim();
  if (/^[\d\s()+.\-]+$/.test(text) && text.replace(/\D/g, "").length >= 4) {
    return { name: "", phone: text, email: "" };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { name: "", phone: "", email: text };
  return { name: text, phone: "", email: "" };
}

/** Why the inline "New customer" box can't be saved yet, or "" when it can: a name OR a phone number is enough. */
export function newCustomerContactMessage(name: string, phone: string): string {
  return name.trim() || phone.trim() ? "" : "Add a name or a phone number";
}
