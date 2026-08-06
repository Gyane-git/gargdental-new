import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { optionalAuth } from "@/lib/auth";
import { serializeProduct } from "@/lib/productSerializer";
import { getWishlistProductCodes, isWishlisted } from "@/lib/productListHelpers";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports ProductController::get_product (ProductController.php:770-793). Note: always returns
// success:true/200 even when no matching product is found (`product` is just null) - no 404.
/**
 * @swagger
 * /api/v1/products/details/{product_code}:
 *   get:
 *     summary: Get a single active product's details by product_code
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
 *         description: products.product_code
 *     responses:
 *       200:
 *         description: Always 200/success even when no matching product exists - `product` is simply null in that case (no 404). `is_wishlisted` is personalized when a valid bearer token is sent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Product Details fetched successfully." }
 *                 product:
 *                   type: object
 *                   nullable: true
 *                   description: Serialized product (lib/productSerializer.ts) plus is_wishlisted, or null if not found.
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
    const code = product_code.replace(/<[^>]*>/g, "").trim();
    const user = await optionalAuth(req);
    const wishlistCodes = await getWishlistProductCodes(user?.id);

    const row = code ? await prisma.products.findFirst({ where: { status: 1, product_code: code } }) : null;

    const product = row
      ? {
          ...(await serializeProduct(row, { withCategory: true, withBrand: true, withVariations: true })),
          is_wishlisted: isWishlisted(row.product_code, wishlistCodes),
        }
      : null;

    return successResponse("Product Details fetched successfully.", { product });
  } catch (error) {
    console.error("Exception occurred while fetching product details", error);
    return serverErrorResponse("Failed to get product details", error);
  }
}
