"use client";

import * as React from "react";
import Link from "next/link";
import { Monitor, Moon, Rows2, Rows3, Sun } from "lucide-react";
import { setDensityAction, setThemeAction } from "@/app/(app)/prefs-actions";
import { cn } from "@/components/ui/cn";
import type { Density, Theme } from "@/lib/prefs";
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
import { useAppInstall } from "@/components/pwa/install-provider";
import { ScreenStyleSwitch } from "@/components/counter/view-switch";

const SettingsIcon = ICONS.settings;
const ProfileIcon = ICONS.profile;

export interface CurrentUser {
  name: string;
  email: string;
  role: string;
}

/** The role in the words a shop uses, not the enum. */
export function roleWords(role: string): string {
  if (role === "OWNER") return "Owner";
  if (role === "FRONT_DESK") return "Front desk";
  if (role === "TECH") return "Technician";
  return role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, " ");
}

/**
 * The account menu: who is signed in, how this screen looks, and Log out.
 *
 * Easy mode keeps it short for a counter the customer can see: no email
 * address and no density setting (a back-office choice). Every row is a 48px
 * target, and the whole Log out row signs out.
 */
export function UserMenu({
  user,
  density,
  theme,
  simple = false,
}: {
  user: CurrentUser;
  density: Density;
  theme: Theme;
  simple?: boolean;
}) {
  const install = useAppInstall();
  const logout = React.useRef<HTMLFormElement>(null);
  const initials = getInitials(user.name);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full p-1 outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring/40">
          <Avatar className="size-10">
            <AvatarFallback className="text-[14px]">{initials}</AvatarFallback>
          </Avatar>
          {/* Read after the initials, so the button's name starts with what it shows. */}
          <span className="sr-only">, your account and screen settings ({user.name})</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[19rem] max-w-[calc(100vw-1rem)] max-h-[min(85dvh,46rem)] overflow-y-auto" onCloseAutoFocus={install?.menuClosed}>
          <DropdownMenuLabel className="flex items-center gap-3 px-2.5 py-2">
            <Avatar className="size-11">
              <AvatarFallback className="text-[15px]">{initials}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[16px] font-semibold text-foreground">{user.name}</span>
              <span className="truncate text-[13px] font-normal text-muted-foreground">
                {simple ? roleWords(user.role) : `${roleWords(user.role)} · ${user.email}`}
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <ScreenStyleSwitch simple={simple} />
          <DropdownMenuSeparator />
          <ThemeChoice current={theme} />
          {simple ? null : <DensityChoice current={density} />}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="min-h-12 text-[15px]">
            <Link href="/settings">
              <SettingsIcon className="size-5 text-muted-foreground" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-12 text-[15px]">
            <Link href="/settings?tab=profile">
              <ProfileIcon className="size-5 text-muted-foreground" />
              Your profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-12 text-[15px]"><Link href="/staff-switch"><ProfileIcon className="size-5" />Switch staff</Link></DropdownMenuItem>
          {/* Offers a native prompt when supported, otherwise installation steps. */}
          <InstallAppItem />
          <DropdownMenuSeparator />
          {/* The whole row signs out: selecting it submits the form below. */}
          <DropdownMenuItem
            onSelect={() => logout.current?.requestSubmit()}
            className="min-h-12 text-[15px] font-semibold text-destructive focus:text-destructive"
          >
            <ACTIONS.signOut aria-hidden className="size-5" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu, so it is still in the page when the menu closes on select. */}
      <form ref={logout} action="/logout" method="post" hidden aria-hidden />
    </>
  );
}

/**
 * Visual theme, on THIS device: Auto (follow the device), Light, or Dark.
 * Three 48px buttons that keep the menu open, so the change is seen in place.
 */
function ThemeChoice({ current }: { current: Theme }) {
  const [pending, start] = React.useTransition();

  const options: {
    value: Theme;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { value: "system", label: "Auto", icon: Monitor },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <div className="px-2.5 py-1.5">
      <p className="pb-1.5 text-[13px] font-semibold text-muted-foreground">Light or dark</p>
      <div role="group" aria-label="Light or dark" className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface-hover p-1">
        {options.map((option) => {
          const active = option.value === current;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              disabled={pending}
              onClick={() => {
                if (option.value === "system") {
                  delete document.documentElement.dataset.theme;
                } else {
                  document.documentElement.dataset.theme = option.value;
                }
                start(() => void setThemeAction(option.value));
              }}
              aria-pressed={active}
              className={cn(
                "inline-flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[13px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60",
                active
                  ? "bg-surface text-foreground shadow-xs ring-1 ring-border-strong"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * How tight the lists are, on THIS device. A back-office setting, so Full
 * mode only. Two positions of one setting, so a segmented pair that keeps the
 * menu open.
 */
function DensityChoice({ current }: { current: Density }) {
  const [pending, start] = React.useTransition();

  const options: { value: Density; label: string; icon: typeof Rows2 }[] = [
    { value: "comfortable", label: "Roomy", icon: Rows2 },
    { value: "compact", label: "Compact", icon: Rows3 },
  ];

  return (
    <div className="px-2.5 py-1.5">
      <p className="pb-1.5 text-[13px] font-semibold text-muted-foreground">Rows</p>
      <div role="group" aria-label="Rows" className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-hover p-1">
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
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60",
                active
                  ? "bg-surface text-foreground shadow-xs ring-1 ring-border-strong"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
