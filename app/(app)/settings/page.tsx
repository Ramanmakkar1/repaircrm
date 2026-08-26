import { Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="Shop details, users, and preferences." />
      <Card>
        <CardContent className="px-0 py-0">
          <EmptyState
            icon={Settings}
            title="Coming online shortly"
            hint="Settings are being built out."
          />
        </CardContent>
      </Card>
    </div>
  );
}
