import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
    >
      {/* Production only; see the note in the component. */}
      <RegisterServiceWorker />
      {children}
    </AppShell>
  );
}
