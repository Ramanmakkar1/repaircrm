import Link from "next/link";
import { UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function CustomerNotFound() {
  return (
    <Card>
      <CardContent className="p-0">
        <EmptyState
          icon={UserX}
          title="Customer not found"
          hint="It may have been deleted, or it belongs to another shop."
          action={
            <Button asChild>
              <Link href="/customers">Back to customers</Link>
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
