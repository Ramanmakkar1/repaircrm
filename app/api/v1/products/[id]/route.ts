import { z } from "zod";

import { db } from "@/lib/db";
import { withApiKey } from "../../_lib/handler";
import { isUniqueViolation } from "../../_lib/prisma-errors";
import { cents } from "../../_lib/schema";
import {
  apiError,
  apiItem,
  noFieldsError,
  readJson,
  zodError,
} from "../../_lib/respond";
import { productSelect, serialiseProduct } from "../../_lib/shapes";

/**
 * /api/v1/products/{id}
 *
 *   GET    read
 *   PATCH  update price, stock, category, availability…
 *
 * There is no DELETE. A product that has ever been sold is referenced by
 * invoice lines, and removing it would leave a receipt describing a thing that
 * does not exist. `active: false` is the delete — it is what the UI does, it
 * hides the product from every picker, and it keeps the history readable.
 */
export { preflight as OPTIONS } from "../../_lib/handler";

type Params = { params: Promise<{ id: string }> };

export const GET = withApiKey<Params>(async (_request, auth, { params }) => {
  const { id } = await params;

  const product = await db.product.findFirst({
    where: { id, shopId: auth.shopId },
    select: productSelect,
  });

  if (!product) return apiError("not_found", "No product with that id.");

  return apiItem(serialiseProduct(product));
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  sku: z.string().trim().max(60).nullable().optional(),
  upc: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priceCents: cents.optional(),
  costCents: cents.nullable().optional(),
  taxable: z.boolean().optional(),
  stockQty: z.number().int().optional(),
  lowStockAt: z.number().int().min(0).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  active: z.boolean().optional(),
  warrantyDays: z.number().int().min(0).nullable().optional(),
});

export const PATCH = withApiKey<Params>(async (request, auth, { params }) => {
  const { id } = await params;

  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);

  if (Object.keys(parsed.data).length === 0) {
    return noFieldsError(Object.keys(patchSchema.shape));
  }

  try {
    const result = await db.product.updateMany({
      where: { id, shopId: auth.shopId },
      data: parsed.data,
    });
    if (result.count === 0) return apiError("not_found", "No product with that id.");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return apiError("invalid_request", "A product with that SKU already exists.");
    }
    throw error;
  }

  const product = await db.product.findFirst({
    where: { id, shopId: auth.shopId },
    select: productSelect,
  });
  if (!product) return apiError("not_found", "No product with that id.");

  return apiItem(serialiseProduct(product));
});
