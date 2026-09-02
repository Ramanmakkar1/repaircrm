import { z } from "zod";

import { db } from "@/lib/db";
import { withApiKey } from "../_lib/handler";
import { listResponse, planList } from "../_lib/list";
import { cents } from "../_lib/schema";
import { isUniqueViolation } from "../_lib/prisma-errors";
import { apiError, apiItem, queryParam, readJson, zodError } from "../_lib/respond";
import { productSelect, serialiseProduct } from "../_lib/shapes";

/**
 * /api/v1/products
 *
 *   GET  ?page=|?cursor=&q=&category=&active=   list, newest first
 *   POST                                        create
 *
 * The catalogue an inventory system syncs against. `q` matches name, SKU or
 * UPC — a barcode scanner's output is a UPC, and the point of this endpoint is
 * that a till or a stock app can look one up.
 *
 * `active=false` lists discontinued lines; omitted lists everything, because an
 * accounting sync reconciling last year's invoices needs the products that are
 * no longer sold.
 */
export { preflight as OPTIONS } from "../_lib/handler";

export const GET = withApiKey(async (request, auth) => {
  const url = new URL(request.url);
  const planned = planList(url);
  if (!planned.ok) return planned.response;
  const plan = planned.plan;

  const q = queryParam(url, "q");
  const category = queryParam(url, "category");
  const activeRaw = queryParam(url, "active")?.toLowerCase();

  if (activeRaw && activeRaw !== "true" && activeRaw !== "false") {
    return apiError("invalid_request", "active must be true or false.");
  }

  const where = {
    shopId: auth.shopId,
    ...plan.where,
    ...(category ? { category } : {}),
    ...(activeRaw ? { active: activeRaw === "true" } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { sku: { contains: q, mode: "insensitive" as const } },
                { upc: { contains: q } },
              ],
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: plan.orderBy,
      skip: plan.skip,
      take: plan.take,
      select: productSelect,
    }),
    db.product.count({ where }),
  ]);

  return listResponse(rows, serialiseProduct, plan, total);
});

/**
 * `stockQty` can be set here because this is a create — the opening count.
 * Moving stock afterwards goes through PATCH, and both are the shop talking
 * about their own inventory.
 */
const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  sku: z.string().trim().max(60).optional(),
  upc: z.string().trim().max(60).optional(),
  description: z.string().trim().max(2000).optional(),
  priceCents: cents.optional(),
  costCents: cents.optional(),
  taxable: z.boolean().optional(),
  stockQty: z.number().int().optional(),
  lowStockAt: z.number().int().min(0).optional(),
  category: z.string().trim().max(80).optional(),
  active: z.boolean().optional(),
  warrantyDays: z.number().int().min(0).optional(),
});

export const POST = withApiKey(async (request, auth) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  try {
    const product = await db.product.create({
      data: {
        shopId: auth.shopId,
        name: input.name,
        sku: input.sku ?? null,
        upc: input.upc ?? null,
        description: input.description ?? null,
        priceCents: input.priceCents ?? 0,
        costCents: input.costCents ?? null,
        taxable: input.taxable ?? true,
        stockQty: input.stockQty ?? 0,
        lowStockAt: input.lowStockAt ?? null,
        category: input.category ?? null,
        active: input.active ?? true,
        warrantyDays: input.warrantyDays ?? null,
      },
      select: productSelect,
    });

    return apiItem(serialiseProduct(product), 201);
  } catch (error) {
    // `@@unique([shopId, sku])` — a duplicate SKU is a caller mistake with an
    // obvious fix, so it gets its own sentence rather than a generic 500.
    if (isUniqueViolation(error)) {
      return apiError("invalid_request", "A product with that SKU already exists.");
    }
    return apiError("server_error", "Could not create that product.");
  }
});
