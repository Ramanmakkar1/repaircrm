"use client";

import * as React from "react";
import Link from "next/link";
import { Mail, MessageCircle, MessageSquareText, UserPlus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ICONS } from "@/components/ui/icons";
import type { MessageOption } from "./customer-screen";
import { QUICK_TILE_CLASS } from "./quick-tile";

const OPTION_ICON = {
  text: MessageCircle,
  email: Mail,
  history: MessageSquareText,
  add: UserPlus,
} as const;

/**
 * The Message tile: one tap opens the ways to reach this person (a text to
 * their number, an email to their address) and the log of what the shop has
 * already sent them. The options come from `messageOptions`, so a customer
 * with no number never offers a text.
 */
export function MessageMenu({ options }: { options: MessageOption[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={QUICK_TILE_CLASS}>
          <ICONS.message aria-hidden />
          <span className="text-center leading-tight">Message</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64 max-w-[calc(100vw-2rem)]">
        {options.map((option) => {
          const Icon = OPTION_ICON[option.key];
          const body = (
            <>
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span>{option.label}</span>
                {option.detail ? <span className="truncate text-sm font-normal text-muted-foreground">{option.detail}</span> : null}
              </span>
            </>
          );
          return (
            <DropdownMenuItem key={option.key} asChild className="min-h-12 text-base">
              {/* sms: and mailto: hand off to the device, so they are plain links; the rest stay in the app. */}
              {option.key === "text" || option.key === "email" ? (
                <a href={option.href}>{body}</a>
              ) : (
                <Link href={option.href}>{body}</Link>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
