import { db } from "@/lib/db";
import { authApiKey, isDenied } from "../../_lib/auth";
import { apiError, apiItem } from "../../_lib/respond";
import { serialiseTicketDetail, ticketDetailSelect } from "../../_lib/shapes";

/**
 * GET /api/v1/tickets/{id}
 *
 * Includes the customer, the device (without its unlock password), the ticket's
 * charges, and PUBLIC COMMENTS ONLY — the `isPublic: true` filter lives in the
 * select in _lib/shapes.ts, so an internal note is never even loaded here.
 *
 * A ticket id from another shop answers 404, not 403.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authApiKey(request);
  if (isDenied(auth)) return auth.response;

  const { id } = await params;

  const ticket = await db.ticket.findFirst({
    where: { id, shopId: auth.shopId },
    select: ticketDetailSelect,
  });

  if (!ticket) return apiError("not_found", "No ticket with that id.");

  return apiItem(serialiseTicketDetail(ticket));
}
