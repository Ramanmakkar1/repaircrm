"use client";

import * as React from "react";
import Link from "next/link";
import { Rows2, Rows3 } from "lucide-react";
import { setDensityAction } from "@/app/(app)/prefs-actions";
import { cn } from "@/components/ui/cn";
import type { Density } from "@/lib/prefs";
import { Avatar, AvatarFallback, getInitials } from "@/components/ui/avatar";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InstallAppItem } from "@/components/pwa/install-app-item";

const SettingsIcon = ICONS.settings;
const ProfileIcon = ICONS.profile;

export interface CurrentUser {
  name: string;
  email: string;
  role: string;
}

export function UserMenu({
  user,
  density,
}: {
  user: CurrentUser;
  density: Density;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-1 outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/40">
        <Avatar>
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
          <span className="truncate text-sm font-bold text-foreground">
            {user.name}
          </span>
          <span className="truncate text-[13px] font-normal text-muted-foreground">
            {user.email}
          </span>
          <span className="mt-1.5 inline-flex w-fit items-center rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-soft-foreground">
            {user.role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon className="size-4 text-muted-foreground" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <ProfileIcon className="size-4 text-muted-foreground" />
            Profile
          </Link>
        </DropdownMenuItem>
        {/* Renders only once the browser has told us an install is possible —
            see components/pwa/install-app-item.tsx. */}
        <InstallAppItem />
        <DropdownMenuSeparator />
        <DensityChoice current={density} />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-destructive focus:text-destructive">
          <form action="/logout" method="post" className="contents">
            <button type="submit" className="flex w-full items-center gap-2.5">
              <ACTIONS.signOut className="size-4" />
              Log out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * How tight the app is, on THIS device.
 *
 * A segmented pair rather than two menu items, because it is one setting with
 * two positions and the current one has to be visible without opening
 * anything else. `onSelect` is prevented from closing the menu so the change
 * can be seen and reversed in place — picking the wrong one and having the
 * menu vanish is a needless second trip.
 */
function DensityChoice({ current }: { current: Density }) {
  const [pending, start] = React.useTransition();

  const options: { value: Density; label: string; icon: typeof Rows2 }[] = [
    { value: "comfortable", label: "Comfortable", icon: Rows2 },
    { value: "compact", label: "Compact", icon: Rows3 },
  ];

  return (
    <div className="px-2 py-1.5">
      <p className="pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint-foreground">
        Density
      </p>
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-hover p-1">
        {options.map((option) => {
          const active = option.value === current;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              disabled={pending}
              onClick={() => start(() => void setDensityAction(option.value))}
              aria-pressed={active}
              className={cn(
                "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-sm text-[12.5px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60",
                active
                  ? "bg-surface text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-3.5" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
