import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { serializeReview } from "@/lib/reviewSerializer";
import { serializeProduct } from "@/lib/productSerializer";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports ReviewController::get_my_reviews (ReviewController.php:182-199). `product` here is the
// PLAIN Product model with its own always-computed appends, but no category/brand/variations
// (only `->with('product')`, no nested dot-relations).
/**
 * @swagger
 * /api/v1/customer/reviews/list:
 *   get:
 *     summary: List the authenticated customer's own product reviews
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reviews fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Reviews fetched successfully." }
 *                 reviews:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Serialized review (lib/reviewSerializer.ts) plus a plain `product` (lib/productSerializer.ts, no category/brand/variations) or null if the product no longer exists.
 *       401:
 *         description: Missing/invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const rows = await prisma.product_reviews.findMany({ where: { customer_id: auth.id } });
    const reviews = await Promise.all(
      rows.map(async (row) => {
        const serialized = await serializeReview(row);
        const product = await prisma.products.findFirst({ where: { product_code: row.product_code } });
        return { ...serialized, product: product ? await serializeProduct(product, {}) : null };
      }),
    );
    return successResponse("Reviews fetched successfully.", { reviews });
  } catch (error) {
    console.error("Exception occurred while fetching reviews", error);
    return serverErrorResponse("Failed to get reviews", error);
  }
}
