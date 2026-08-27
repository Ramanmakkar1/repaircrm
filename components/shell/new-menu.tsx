"use client";

import Link from "next/link";
import {
  Plus,
  Wrench,
  UserPlus,
  Receipt,
  FileText,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NewItem {
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}

/** The four documents a shop creates from scratch, in workflow order. */
const NEW_ITEMS: NewItem[] = [
  { label: "New ticket", hint: "Check a device in", href: "/tickets/new", icon: Wrench },
  { label: "New customer", hint: "Add someone to the book", href: "/customers/new", icon: UserPlus },
  { label: "New estimate", hint: "Quote a job first", href: "/estimates/new", icon: FileText },
  { label: "New invoice", hint: "Bill for work done", href: "/invoices/new", icon: Receipt },
];

/** Not a "new" record but the other thing counter staff reach for constantly. */
const POS_ITEM: NewItem = {
  label: "Take payment",
  hint: "Open the register",
  href: "/pos",
  icon: CreditCard,
};

export function NewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="size-[18px]" />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
          Create
        </DropdownMenuLabel>
        {NEW_ITEMS.map((item) => (
          <Row key={item.href} item={item} />
        ))}
        <DropdownMenuSeparator />
        <Row item={POS_ITEM} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Two lines per row. The label alone made "Estimate" vs "Invoice" a guess for
 * anyone new to the counter; the hint says what the document is actually for.
 */
function Row({ item }: { item: NewItem }) {
  return (
    <DropdownMenuItem asChild className="items-start py-2">
      <Link href={item.href}>
        <item.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-foreground">
            {item.label}
          </span>
          <span className="truncate text-[12px] font-normal text-muted-foreground">
            {item.hint}
          </span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}
