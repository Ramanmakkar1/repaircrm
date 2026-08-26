"use client";

import { LogOut, Settings, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, getInitials } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface CurrentUser {
  name: string;
  email: string;
  role: string;
}

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md p-1 outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/40">
        <Avatar>
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
          <span className="truncate text-[13px] font-medium text-foreground">
            {user.name}
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
          <span className="mt-1 inline-flex w-fit items-center rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {user.role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-3.5 text-muted-foreground" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <UserIcon className="size-3.5 text-muted-foreground" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-destructive focus:text-destructive">
          <form action="/logout" method="post" className="contents">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="size-3.5" />
              Log out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
