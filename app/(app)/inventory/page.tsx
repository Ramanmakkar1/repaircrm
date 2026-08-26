import { Boxes } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export default function InventoryPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Inventory" description="Track parts, stock levels, and reorder points." />
      <Card>
        <CardContent className="px-0 py-0">
          <EmptyState
            icon={Boxes}
            title="Coming online shortly"
            hint="Inventory tracking is being built out."
          />
        </CardContent>
      </Card>
    </div>
  );
}
