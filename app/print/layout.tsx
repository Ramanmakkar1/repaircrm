import { requireUser } from "@/lib/auth";
import { PRINT_BASE_CSS } from "@/components/billing/print-styles";

/**
 * Print routes deliberately live OUTSIDE the (app) route group.
 *
 * A print view has to be a bare sheet of paper: no sidebar, no topbar, no
 * scroll container. Rendering it inside the app shell and then hiding the
 * chrome with print CSS works, but it fights the shell's `h-dvh`/`overflow`
 * layout and leaves a second, broken-looking copy of the app on screen. Its own
 * top-level segment is simply the honest structure — and it still runs
 * `requireUser()`, so it is exactly as protected as the rest of the app.
 *
 * The stylesheet itself is imported rather than inlined here, because the
 * customer portal renders the very same invoice behind a different guard (see
 * app/portal/_components/print-root.tsx). Two auth boundaries, one house style.
 */
export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="print-root">
      <style>{PRINT_BASE_CSS}</style>
      {children}
    </div>
  );
}
