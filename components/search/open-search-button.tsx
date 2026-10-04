"use client";

import { Search } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Any screen can open the shell's search sheet with this event (a not-found page, an empty list). */
export const OPEN_SEARCH = "repairs-helper:search-open";

export function openSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH));
}

/** A big button that opens the search sheet, for screens where finding something is the way out. */
export function OpenSearchButton({ children = "Search the shop", ...props }: Omit<ButtonProps, "onClick" | "type">) {
  return (
    <Button type="button" size="lg" onClick={openSearch} {...props}>
      <Search aria-hidden />
      {children}
    </Button>
  );
}
