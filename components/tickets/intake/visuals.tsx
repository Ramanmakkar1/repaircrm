import {
  Activity,
  AppWindow,
  Bug,
  Camera,
  Cpu,
  DatabaseBackup,
  Disc3,
  Droplets,
  Ellipsis,
  Hammer,
  Keyboard,
  MonitorOff,
  PowerOff,
  SprayCan,
  Volume2,
  type LucideIcon,
} from "lucide-react";

import type { ProblemIcon } from "./flow";

/**
 * The icons a problem box falls back to when it has no picture (see problemVisual in flow.ts).
 * Shared by the check-in and by the editor in Settings, so both draw the same box.
 */
export const PROBLEM_ICONS: Record<ProblemIcon, LucideIcon> = {
  water: Droplets,
  software: AppWindow,
  virus: Bug,
  data: DatabaseBackup,
  power: PowerOff,
  picture: MonitorOff,
  sound: Volume2,
  keyboard: Keyboard,
  disc: Disc3,
  damage: Hammer,
  intermittent: Activity,
  maintenance: SprayCan,
  hardware: Cpu,
  camera: Camera,
  other: Ellipsis,
};
