import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";
import { serializeProduct } from "@/lib/productSerializer";
import { getWishlistProductCodes, computeStartingPrice, isWishlisted } from "@/lib/productListHelpers";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports ProductController::get_random_wise_products (ProductController.php:169-219). Base query
// is random-order limited to 200; limit/offset (optional) then further constrain/paginate that
// same query, matching Laravel's ->inRandomOrder()->limit(200) followed by conditional
// ->offset()/->limit() overrides on the same query builder.
/**
 * @swagger
 * /api/v1/products/get-random-wise-products:
 *   get:
 *     summary: List up to 200 active top-level products in random order, optionally paginated over that same random set
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         required: false
 *         description: Max rows to return from the (up to 200) random set. Defaults to 200.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         required: false
 *         description: Rows to skip within the random set. Omit for no offset.
 *     responses:
 *       200:
 *         description: Products fetched successfully. `is_wishlisted` is personalized when a valid bearer token is sent, and false/unpersonalized for anonymous requests.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Products fetched successfully" }
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Serialized product (lib/productSerializer.ts) plus starting_price and is_wishlisted.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const user = await optionalAuth(req);
    const wishlistCodes = await getWishlistProductCodes(user?.id);

    const take = searchParams.has("limit") ? Number(searchParams.get("limit")) : 200;
    const skip = searchParams.has("offset") ? Number(searchParams.get("offset")) : undefined;

    const allActive = await prisma.products.findMany({
      where: { status: 1, parent_id: null },
      select: { id: true },
    });
    const shuffled = allActive.map((r) => r.id).sort(() => Math.random() - 0.5).slice(0, 200);
    const pageIds = skip !== undefined ? shuffled.slice(skip, skip + take) : shuffled.slice(0, take);

    const rows = await prisma.products.findMany({ where: { id: { in: pageIds } } });
    const byId = new Map(rows.map((r) => [r.id.toString(), r]));
    const ordered = pageIds.map((id) => byId.get(id.toString())).filter((r): r is NonNullable<typeof r> => Boolean(r));

    const products = await Promise.all(
      ordered.map(async (row) => ({
        ...(await serializeProduct(row, { withCategory: true, withBrand: true, withVariations: true })),
        starting_price: await computeStartingPrice(row),
        is_wishlisted: isWishlisted(row.product_code, wishlistCodes),
      })),
    );

    return successResponse("Products fetched successfully", { products });
  } catch (error) {
    console.error("Exception occurred while fetching products", error);
    return serverErrorResponse("Failed to get products", error);
  }
}
