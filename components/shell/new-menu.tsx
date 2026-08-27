"use client";

import Link from "next/link";
import { Plus, Wrench, UserPlus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NEW_ITEMS = [
  { label: "New Ticket", href: "/tickets/new", icon: Wrench },
  { label: "New Customer", href: "/customers/new", icon: UserPlus },
  { label: "New Invoice", href: "/invoices/new", icon: Receipt },
];

export function NewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="size-[18px]" />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {NEW_ITEMS.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>
              <item.icon className="size-4 text-muted-foreground" />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
