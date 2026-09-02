import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Page not found · RepairFlow" };

/**
 * The catch-all inside the signed-in app: a URL that matches no route, or a
 * `notFound()` from a screen that has no not-found of its own. Record-level
 * pages that can say something more specific (a customer, a product) keep
 * their own file next to the page — this is the floor, not a replacement.
 */
export default function AppNotFound() {
  return (
    <Card>
      <CardContent className="p-0">
        <EmptyState
          icon={SearchX}
          title="We couldn't find that page"
          hint="The link may be out of date, or the record may have been deleted. Everything else is still where you left it."
          action={
            <Button asChild>
              <Link href="/dashboard">Back to the dashboard</Link>
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}
