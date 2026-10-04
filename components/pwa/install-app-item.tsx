"use client";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ACTIONS } from "@/components/ui/icons";
import { useAppInstall } from "./install-provider";

export function InstallAppItem() {
  const app = useAppInstall();
  if (!app || app.installed) return null;
  const Icon = ACTIONS.install;
  return <DropdownMenuItem onSelect={() => app.install()} className="min-h-12 text-[15px]">
    <Icon className="size-5 text-muted-foreground" aria-hidden />Install app
  </DropdownMenuItem>;
}
