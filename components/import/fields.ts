/**
 * What a CSV import can fill in, and how a spreadsheet's own column names get
 * matched to it.
 *
 * Pure — imported by the wizard (client) and the committer (server) alike, so
 * both agree about which columns exist and what counts as valid.
 */

export type ImportKind = "customers" | "products";

export type FieldKind = "text" | "email" | "phone" | "money" | "int" | "bool";

export type ImportField = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Header spellings seen in the wild, normalised the same way headers are. */
  aliases: string[];
  hint?: string;
};

/** "First Name" / "first_name" / "FIRSTNAME" all collapse to "firstname". */
export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Field sets
// ---------------------------------------------------------------------------

export const CUSTOMER_FIELDS: ImportField[] = [
  {
    key: "firstName",
    label: "First name",
    kind: "text",
    required: true,
    aliases: ["firstname", "first", "givenname", "forename", "fname"],
  },
  {
    key: "lastName",
    label: "Last name",
    kind: "text",
    aliases: ["lastname", "last", "surname", "familyname", "lname"],
  },
  {
    key: "businessName",
    label: "Company",
    kind: "text",
    aliases: ["businessname", "business", "company", "companyname", "organisation", "organization", "org"],
  },
  { key: "email", label: "Email", kind: "email", aliases: ["email", "emailaddress", "mail", "e"] },
  { key: "phone", label: "Phone", kind: "phone", aliases: ["phone", "phonenumber", "telephone", "tel", "homephone", "workphone"] },
  { key: "mobile", label: "Mobile", kind: "phone", aliases: ["mobile", "mobilephone", "cell", "cellphone", "cellular", "sms"] },
  { key: "address1", label: "Address", kind: "text", aliases: ["address", "address1", "addressline1", "street", "streetaddress", "addr"] },
  { key: "address2", label: "Address line 2", kind: "text", aliases: ["address2", "addressline2", "apt", "suite", "unit"] },
  { key: "city", label: "City", kind: "text", aliases: ["city", "town", "locality"] },
  { key: "state", label: "State", kind: "text", aliases: ["state", "province", "region", "county"] },
  { key: "postalCode", label: "Postal code", kind: "text", aliases: ["postalcode", "zip", "zipcode", "postcode", "postal"] },
  { key: "notes", label: "Notes", kind: "text", aliases: ["notes", "note", "comments", "comment", "description"] },
];

export const PRODUCT_FIELDS: ImportField[] = [
  {
    key: "name",
    label: "Name",
    kind: "text",
    required: true,
    aliases: ["name", "productname", "product", "item", "itemname", "title", "description"],
  },
  {
    key: "sku",
    label: "SKU",
    kind: "text",
    required: true,
    aliases: ["sku", "partnumber", "partno", "itemnumber", "itemno", "code", "productcode"],
    hint: "Used to spot rows you already have.",
  },
  { key: "upc", label: "UPC", kind: "text", aliases: ["upc", "barcode", "ean", "gtin"] },
  { key: "priceCents", label: "Price", kind: "money", aliases: ["price", "retail", "retailprice", "saleprice", "sellprice", "msrp", "unitprice"] },
  { key: "costCents", label: "Cost", kind: "money", aliases: ["cost", "unitcost", "wholesale", "wholesaleprice", "buyprice"] },
  { key: "stockQty", label: "Stock on hand", kind: "int", aliases: ["stock", "qty", "quantity", "stockqty", "onhand", "qtyonhand", "instock", "count"] },
  { key: "lowStockAt", label: "Reorder point", kind: "int", aliases: ["lowstockat", "reorderpoint", "reorderat", "minqty", "min", "threshold"] },
  { key: "category", label: "Category", kind: "text", aliases: ["category", "type", "group", "department"] },
  { key: "taxable", label: "Taxable", kind: "bool", aliases: ["taxable", "tax", "istaxable"] },
  {
    key: "vendor",
    label: "Vendor",
    kind: "text",
    aliases: ["vendor", "supplier", "manufacturer", "brand", "vendorname"],
    hint: "Matched by name; unknown vendors are created.",
  },
  { key: "vendorSku", label: "Vendor SKU", kind: "text", aliases: ["vendorsku", "suppliersku", "vendorpartnumber", "supplierpart", "mpn"] },
];

export function fieldsFor(kind: ImportKind): ImportField[] {
  return kind === "customers" ? CUSTOMER_FIELDS : PRODUCT_FIELDS;
}

// ---------------------------------------------------------------------------
// Auto-mapping
// ---------------------------------------------------------------------------

/** The mapping the wizard carries: field key -> column index, or -1 for "skip". */
export type Mapping = Record<string, number>;

/**
 * Guesses which column feeds which field.
 *
 * Exact alias match first, across every field, so a file with both "name" and
 * "vendor name" doesn't let a fuzzy match on the second steal the first. Only
 * then does it fall back to substring containment, which is what catches
 * "Customer Email Address" and "Qty On Hand (units)".
 *
 * Every column is claimed at most once — two fields fed by one column is always
 * a mistake, and leaving the second unmapped makes it visible.
 */
export function autoMap(headers: readonly string[], fields: ImportField[]): Mapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Mapping = {};

  for (const field of fields) mapping[field.key] = -1;

  for (const pass of ["exact", "fuzzy"] as const) {
    for (const field of fields) {
      if (mapping[field.key] !== -1) continue;
      const index = normalized.findIndex((header, position) => {
        if (used.has(position) || header === "") return false;
        return pass === "exact"
          ? field.aliases.includes(header)
          : field.aliases.some(
              (alias) => alias.length >= 3 && header.includes(alias),
            );
      });
      if (index !== -1) {
        mapping[field.key] = index;
        used.add(index);
      }
    }
  }

  return mapping;
}

// ---------------------------------------------------------------------------
// Value readers
// ---------------------------------------------------------------------------

/** Anything a spreadsheet writes for "yes". Blank means "leave the default". */
export function readBool(value: string): boolean | null {
  const text = value.trim().toLowerCase();
  if (text === "") return null;
  return ["y", "yes", "true", "t", "1", "taxable", "on"].includes(text);
}

/** "$1,299.00" -> 129900. Returns null for blank, NaN for unparseable. */
export function readMoney(value: string): number | null {
  const text = value.trim();
  if (text === "") return null;
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed * 100);
}

/** "12 units" -> 12. Returns null for blank, NaN for unparseable. */
export function readInt(value: string): number | null {
  const text = value.trim();
  if (text === "") return null;
  const cleaned = text.replace(/[^0-9\-]/g, "");
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Deliberately loose: this is a "did somebody paste a phone number into the
 * email column" check, not RFC 5322. A real address that this rejects would be
 * a bug; a junk one it accepts merely fails to send later.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

// ---------------------------------------------------------------------------
// Sample files
// ---------------------------------------------------------------------------

/** Header + two filled rows, so "what should this look like?" has an answer. */
export const SAMPLE_CSV: Record<ImportKind, string> = {
  customers: [
    "First Name,Last Name,Company,Email,Phone,Mobile,Address,City,State,Postal Code,Notes",
    'Elena,Marsh,,elena.marsh@example.com,(555) 010-2201,(555) 010-2202,"14 Oak Street, Apt 3",Austin,TX,78701,Prefers texts',
    "Dev,Patel,Patel Dental,dev@pateldental.example,(555) 010-3310,,900 Congress Ave,Austin,TX,78701,Net 30 account",
  ].join("\r\n"),
  products: [
    "Name,SKU,UPC,Price,Cost,Qty,Reorder Point,Category,Taxable,Vendor,Vendor SKU",
    "iPhone 14 Screen Assembly,SCR-IP14,0810001100011,219.00,128.50,6,3,Parts / Displays,yes,Mobile Sentrix,MS-IP14-OLED",
    "Bench Diagnostic (1 hr),LAB-DIAG,,95.00,,0,,Labour,no,,",
  ].join("\r\n"),
};
