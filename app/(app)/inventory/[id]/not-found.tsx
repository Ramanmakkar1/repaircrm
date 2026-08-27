import Link from "next/link";
import { PackageX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function ProductNotFound() {
  return (
    <Card>
      <CardContent className="p-0">
        <EmptyState
          icon={PackageX}
          title="Product not found"
          hint="It may have been deleted, or it belongs to another shop."
          action={
            <Button asChild>
              <Link href="/inventory">Back to inventory</Link>
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
