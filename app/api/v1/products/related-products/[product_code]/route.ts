import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";
import { serializeProduct } from "@/lib/productSerializer";
import { getWishlistProductCodes, isWishlisted } from "@/lib/productListHelpers";
import { serverErrorResponse } from "@/lib/apiResponse";

// Ports ProductController::get_related_products (ProductController.php:818-850). Two real bugs
// replicated exactly:
//  - not-found branch nests success/message inside an `errors` key (ProductController.php:840).
//  - success branch has a stray trailing `200` array element in the PHP literal, which PHP/json_encode
//    serializes as a literal `"0":200` key alongside success/message/related_products - confirmed
//    against the live Laravel response, not just inferred from the source.
/**
 * @swagger
 * /api/v1/products/related-products/{product_code}:
 *   get:
 *     summary: List up to 10 other active top-level products in the same category as the seed product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: path
 *         name: product_code
 *         required: true
 *         schema:
 *           type: string
 *         description: products.product_code of the seed product.
 *     responses:
 *       200:
 *         description: >
 *           Related products fetched successfully. `is_wishlisted` is personalized when a valid
 *           bearer token is sent. Replicates a real quirk of the legacy Laravel response: a
 *           literal `"0": 200` key is present alongside success/message/related_products.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Related products fetched successfully" }
 *                 related_products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Serialized product (lib/productSerializer.ts) plus is_wishlisted.
 *                 "0": { type: integer, example: 200, description: "Legacy artifact, always 200." }
 *       404:
 *         description: >
 *           No product with this product_code (seed not found). Replicates a real Laravel bug:
 *           the error is nested inside an `errors` key instead of at the top level.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: object
 *                   properties:
 *                     success: { type: boolean, example: false }
 *                     message: { type: string, example: "Not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ product_code: string }> }) {
  try {
    const { product_code } = await params;
    const seed = await prisma.products.findFirst({ where: { product_code } });

    if (!seed) {
      return NextResponse.json({ errors: { success: false, message: "Not found" } }, { status: 404 });
    }

    const user = await optionalAuth(req);
    const wishlistCodes = await getWishlistProductCodes(user?.id);

    const rows = await prisma.products.findMany({
      where: {
        status: 1,
        parent_id: null,
        category_id: seed.category_id,
        product_code: { not: seed.product_code },
      },
      take: 10,
    });

    const related_products = await Promise.all(
      rows.map(async (row) => ({
        ...(await serializeProduct(row, { withCategory: true, withBrand: true, withVariations: true })),
        is_wishlisted: isWishlisted(row.product_code, wishlistCodes),
      })),
    );

    return NextResponse.json({
      success: true,
      message: "Related products fetched successfully",
      related_products,
      "0": 200,
    });
  } catch (error) {
    console.error("Exception occurred while fetching related products", error);
    return serverErrorResponse("Failed to get related products", error);
  }
}
