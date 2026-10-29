import { describe, expect, it } from "vitest";

import { nameInitials } from "@/lib/initials";
import { initials } from "@/components/customers/format";

describe("nameInitials", () => {
  it("never splits an emoji's surrogate pair", () => {
    expect(nameInitials("ESD №7 🏫")).toBe("E№");
    expect(initials("ESD №7 🏫")).not.toMatch(/[\uD800-\uDFFF]/);
    expect(nameInitials("a🏫")).toBe("A🏫");
    expect(nameInitials("🏫")).toBe("🏫");
  });

  it("keeps the usual first-and-last letters", () => {
    expect(nameInitials("Ngozi Ọkọńkwọ-Smith")).toBe("NỌ");
    expect(nameInitials("Zoë Ølsen")).toBe("ZØ");
    expect(nameInitials("Prince")).toBe("PR");
    expect(nameInitials("   ")).toBe("?");
    expect(nameInitials(null, "—")).toBe("—");
  });
});
