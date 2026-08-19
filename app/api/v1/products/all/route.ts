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
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         required: false
 *         description: Page number (1-based). Used with per_page as an alternative to limit/offset. Ignored if limit/offset are present.
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *         required: false
 *         description: Rows per page. Used with page as an alternative to limit/offset. Ignored if limit/offset are present.
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
 *                 pagination:
 *                   type: object
 *                   description: Only present when page/per_page were used.
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     per_page: { type: integer }
 *                     total_pages: { type: integer }
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

    const where = { status: 1, parent_id: null };
    const hasLimitOffset = searchParams.has("offset") || searchParams.has("limit");
    const hasPagePerPage = !hasLimitOffset && (searchParams.has("page") || searchParams.has("per_page"));

    let skip: number | undefined;
    let take: number | undefined;
    let page = 1;
    let perPage = 0;

    if (hasLimitOffset) {
      if (searchParams.has("offset")) skip = Number(searchParams.get("offset"));
      if (searchParams.has("limit")) take = Number(searchParams.get("limit"));
    } else if (hasPagePerPage) {
      page = Math.max(1, Number(searchParams.get("page")) || 1);
      perPage = Math.max(1, Number(searchParams.get("per_page")) || 30);
      skip = (page - 1) * perPage;
      take = perPage;
    }

    const rows = await prisma.products.findMany({
      where,
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
    });

    const products = await Promise.all(
      rows.map(async (row) => ({
        ...(await serializeProduct(row, { withCategory: true, withBrand: true, withVariations: true })),
        starting_price: await computeStartingPrice(row),
        is_wishlisted: isWishlisted(row.product_code, wishlistCodes),
      })),
    );

    if (hasPagePerPage) {
      const total = await prisma.products.count({ where });
      return successResponse("Products fetched successfully", {
        products,
        pagination: {
          total,
          page,
          per_page: perPage,
          total_pages: Math.max(1, Math.ceil(total / perPage)),
        },
      });
    }

    return successResponse("Products fetched successfully", { products });
  } catch (error) {
    console.error("Exception occurred while fetching products", error);
    return serverErrorResponse("Failed to get products", error);
  }
}
