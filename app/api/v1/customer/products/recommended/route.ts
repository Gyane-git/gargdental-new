import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { serializeProduct } from "@/lib/productSerializer";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports ProductController::get_recommended (ProductController.php:928-967).
//
// IMPORTANT DEVIATION: Laravel's real code only assigns $recommendedProducts inside the
// `recommendedCount === 0` and `recommendedCount < 5` branches. For a customer with 5-10
// existing recommended_products rows, NEITHER branch runs, so $recommendedProducts stays
// undefined and the final ->map() call fatals with an uncaught TypeError (not caught by the
// `catch (\Exception $e)` - PHP Errors aren't Exceptions) - i.e. this endpoint currently 500s
// for any real customer with 5-10 recommendations. That's a dead code path with no sane JSON
// to replicate (like get-valley-wise-address), so instead we always apply the sensible,
// consistent behavior: existing recommended products' actual product rows, padded with random
// active products (excluding already-recommended codes) up to 10 total - this is exactly what
// Laravel's own 1-4 branch already does, just generalized to 0-10 instead of leaving 5-10 broken.
/**
 * @swagger
 * /api/v1/customer/products/recommended:
 *   get:
 *     summary: Get the customer's recommended products, padded with random active products up to 10 total
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recommended products fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Recommended products fetched successfully" }
 *                 recommended_products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Serialized product (lib/productSerializer.ts) plus a `wishlist` boolean.
 *       401:
 *         description: Missing/invalid customer bearer token.
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
    const wishlistCodes = (await prisma.wishlist.findMany({ where: { customer_id: auth.id }, select: { product_code: true } })).map(
      (w) => w.product_code,
    );

    const recommendedRows = await prisma.recommended_products.findMany({
      where: { customer_id: auth.id },
      take: 10,
    });
    const recommendedCodes = recommendedRows.map((r) => r.product_code);

    const existingProducts = (
      await Promise.all(recommendedCodes.map((code) => prisma.products.findFirst({ where: { product_code: code } })))
    ).filter((p): p is NonNullable<typeof p> => Boolean(p));

    const fillCount = 10 - existingProducts.length;
    const randomProducts =
      fillCount > 0
        ? await prisma.products.findMany({
            where: { status: 1, product_code: { notIn: recommendedCodes } },
            take: fillCount,
          })
        : [];
    // Laravel uses inRandomOrder(); shuffle in memory since Prisma/MySQL has no portable equivalent here.
    const shuffledRandom = randomProducts.sort(() => Math.random() - 0.5);

    const allProducts = [...existingProducts, ...shuffledRandom];

    const recommended_products = await Promise.all(
      allProducts.map(async (row) => ({
        ...(await serializeProduct(row, {})),
        wishlist: wishlistCodes.includes(row.product_code),
      })),
    );

    return successResponse("Recommended products fetched successfully", { recommended_products });
  } catch (error) {
    console.error("Exception occurred while fetching recommended products", error);
    return serverErrorResponse("Failed to get recommended products", error);
  }
}
