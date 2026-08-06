import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";
import { serializeProduct } from "@/lib/productSerializer";
import { getWishlistProductCodes, computeStartingPrice, isWishlisted } from "@/lib/productListHelpers";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports ProductController::get_all_products (ProductController.php:95-143). limit/offset are
// optional (no validation, applied only when present) - not to be confused with the *required*
// limit/offset on category-wise/brand-wise/flash-sale below.
/**
 * @swagger
 * /api/v1/products/all:
 *   get:
 *     summary: List all active top-level products (no variations returned as separate rows), optionally paginated
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
 *         description: Max rows to return. Omit for no limit.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         required: false
 *         description: Rows to skip. Omit for no offset.
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

    const rows = await prisma.products.findMany({
      where: { status: 1, parent_id: null },
      ...(searchParams.has("offset") ? { skip: Number(searchParams.get("offset")) } : {}),
      ...(searchParams.has("limit") ? { take: Number(searchParams.get("limit")) } : {}),
    });

    const products = await Promise.all(
      rows.map(async (row) => ({
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
