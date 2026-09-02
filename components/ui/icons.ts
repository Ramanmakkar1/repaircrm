import {
  AlarmClockCheck,
  AlarmClockMinus,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowRightLeft,
  Ban,
  Banknote,
  BarChart3,
  Barcode,
  Blocks,
  Boxes,
  CalendarClock,
  CalendarDays,
  Check,
  CircleCheck,
  CircleUser,
  CircleX,
  ClipboardCopy,
  ClipboardList,
  Coins,
  CopyPlus,
  CreditCard,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Hash,
  Inbox,
  KeyRound,
  Laptop,
  LayoutDashboard,
  Link2,
  ListChecks,
  Lock,
  LockKeyhole,
  LockKeyholeOpen,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  MessageSquareText,
  Monitor,
  MonitorDown,
  Package,
  PackageCheck,
  Paperclip,
  Pause,
  Pencil,
  PenLine,
  Percent,
  Play,
  Plug,
  Plus,
  Printer,
  QrCode,
  Receipt,
  Redo2,
  RefreshCw,
  Repeat,
  ScanLine,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  StickyNote,
  Store,
  Timer,
  Trash2,
  Undo2,
  Unplug,
  Upload,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  Webhook,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * One glyph per concept, for the whole app.
 *
 * Eight teams shipped in parallel and each of them picked its own icon for a
 * vendor, a payment, a serial number. This is the single place that decision
 * gets made: import the concept, not the glyph, and a ticket is the same
 * wrench on the sidebar, on an empty state, in a button and on a chip.
 *
 * Rules that go with it:
 *   - Icons are decorative. Every one of them sits next to real text, and the
 *     glyph itself is `aria-hidden` (lucide does that for us). Icon-only is
 *     reserved for dense repeated row actions, and those carry an aria-label
 *     and a tooltip.
 *   - Sizes come from the component, not from here: `size-4` inside a button
 *     or a chip, `size-[18px]` in the sidebar, `size-5`/`size-6` in an
 *     `IconChip`. Stroke stays at lucide's default 2 except where a component
 *     deliberately thickens it (the active sidebar row, `IconChip`).
 *   - Nothing in body text, and never one per table cell.
 *
 * Adding a concept is cheap; picking a second glyph for one that is already
 * here is not — change it in this map and every screen follows.
 */
export const ICONS = {
  // ------------------------------------------------------------- sections ---
  dashboard: LayoutDashboard,
  lead: UserPlus,
  appointment: CalendarDays,
  customer: Users,
  ticket: Wrench,
  estimate: FileText,
  invoice: Receipt,
  pos: ShoppingCart,
  inventory: Boxes,
  marketing: Megaphone,
  reports: BarChart3,
  display: Monitor,
  timeClock: Timer,
  settings: Settings,

  // ------------------------------------------------------------- records ----
  product: Package,
  vendor: Store,
  purchaseOrder: ClipboardList,
  location: MapPin,
  serial: Hash,
  barcode: Barcode,
  /** A part on a ticket is a product with a job attached — same box. */
  part: Package,
  /** The customer's machine on the bench, as distinct from the parts in it. */
  device: Laptop,
  team: Users,
  profile: CircleUser,
  /** One named person on a customer record, where `customer` is the account. */
  contact: UserRound,
  note: StickyNote,

  // --------------------------------------------------------------- money ----
  payment: CreditCard,
  cash: Banknote,
  deposit: Wallet,
  refund: Undo2,
  // Not the same wallet as a deposit: a deposit is the customer's money we are
  // holding against a job, store credit is a balance they can spend. Those two
  // sit on the same customer page, so they cannot share a glyph.
  credit: Coins,
  tax: Percent,
  recurring: Repeat,
  statement: FileSpreadsheet,

  // ------------------------------------------------------ work on a ticket --
  checklist: ListChecks,
  dueDate: CalendarClock,
  warranty: ShieldCheck,
  stockMove: ArrowLeftRight,
  signature: PenLine,
  attachment: Paperclip,

  // ----------------------------------------------------------- talking to ---
  email: Mail,
  message: MessageSquareText,
  inbound: Inbox,
  review: Star,
  checkin: QrCode,

  // ---------------------------------------------------------- connections ---
  integration: Blocks,
  apiKey: KeyRound,
  webhook: Webhook,
  automation: Zap,
  audit: ScrollText,
  /** Passwords and two-factor. Deliberately not the warranty shield. */
  security: Lock,

  // ------------------------------------------------------------- actions ----
  search: Search,
  print: Printer,
  importData: Upload,
  exportData: Download,
} as const satisfies Record<string, LucideIcon>;

/**
 * One glyph per *verb*, on the same terms as `ICONS` above.
 *
 * A button inside a card reads faster with a glyph beside its label — which is
 * only true if "delete" is the same bin everywhere and "send" is the same
 * paper plane. Pick the verb, never the glyph.
 *
 * Discipline that goes with it:
 *   - Primary and secondary card actions get an icon. Tertiary text links do
 *     not — an icon on every link is noise, and noise is what this map exists
 *     to prevent.
 *   - The icon is always left of the label and always `aria-hidden`; the text
 *     carries the meaning. Never ship an icon-only button for something a new
 *     employee has to understand.
 *   - `Button` already sizes any `svg` child correctly (`size-4`, `size-5` at
 *     `lg`), so write `<Button><ACTIONS.save /> Save changes</Button>` and let
 *     the variant do the rest.
 */
export const ACTIONS = {
  add: Plus,
  edit: Pencil,
  save: Check,
  delete: Trash2,
  archive: Archive,
  /** Makes a second record. For clipboard text, use `copy`. */
  duplicate: CopyPlus,
  cancel: X,

  send: Send,
  email: Mail,
  print: Printer,
  download: Download,
  upload: Upload,
  /** Puts text on the clipboard. Distinct from `duplicate`, which makes a record. */
  copy: ClipboardCopy,
  copyLink: Link2,
  openExternal: ExternalLink,
  /** Adds the PWA to a home screen — nothing lands in the downloads folder. */
  install: MonitorDown,

  /**
   * The camera scanner. These shops have no laser guns — a phone camera is the
   * only scanner they get — so this is a first-class action wherever a code is
   * typed, not a decoration on a text field.
   */
  scan: ScanLine,

  pay: CreditCard,
  refund: Undo2,
  receive: PackageCheck,

  assign: UserCheck,
  filter: SlidersHorizontal,
  search: Search,
  view: Eye,

  refresh: RefreshCw,
  /**
   * Deliberately NOT another circular arrow: `refresh` and a clockwise rotate
   * are one arrowhead apart at 16px, and "retry this failed delivery" sits on
   * the same panel as "sync now".
   */
  retry: Redo2,
  /**
   * "Run now" bills a customer immediately. It is a consequential one-off, not
   * a transport control, so it must never wear the same triangle as `resume` —
   * the two appear two buttons apart on a paused recurring schedule.
   */
  run: Zap,
  /** The two halves of one toggle. The triangle belongs to Resume. */
  resume: Play,
  pause: Pause,
  reopen: ArchiveRestore,
  connect: Plug,
  disconnect: Unplug,

  /** Opening and closing a thing that holds money or work: a till, a shift. */
  open: LockKeyholeOpen,
  close: LockKeyhole,
  /** Turning one document into another — an estimate into an invoice. */
  convert: ArrowRightLeft,

  approve: CircleCheck,
  decline: CircleX,
  void: Ban,

  back: ArrowLeft,
  next: ArrowRight,
  more: Ellipsis,

  /**
   * Punching a shift, not a session. `signOut` is the door out of the app and
   * the user menu sits on top of the time clock screen — two identical
   * LogOut arrows there would be one misread away from a lost shift record.
   */
  clockIn: AlarmClockCheck,
  clockOut: AlarmClockMinus,
  signOut: LogOut,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export type ActionName = keyof typeof ACTIONS;
export type { LucideIcon };
