import { db } from "@/lib/db";
import { authApiKey, isDenied } from "../../_lib/auth";
import { apiError, apiItem } from "../../_lib/respond";
import { customerSelect, serialiseCustomer } from "../../_lib/shapes";

/**
 * GET /api/v1/customers/{id}
 *
 * `findFirst` with the shopId in the where — never `findUnique` on the id
 * alone. An id belonging to another shop must be indistinguishable from an id
 * that does not exist: 404, not 403. A 403 would confirm the row is real and
 * turn the endpoint into an existence oracle.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authApiKey(request);
  if (isDenied(auth)) return auth.response;

  const { id } = await params;

  const customer = await db.customer.findFirst({
    where: { id, shopId: auth.shopId },
    select: customerSelect,
  });

  if (!customer) return apiError("not_found", "No customer with that id.");

  return apiItem(serialiseCustomer(customer));
}
