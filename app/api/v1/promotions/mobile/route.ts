import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { serializeProduct } from "@/lib/productSerializer";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports BannerController::get_mobile_promotions (BannerController.php:155-179).
/**
 * @swagger
 * /api/v1/promotions/mobile:
 *   get:
 *     summary: List active promotions that have a mobile image, each with its linked product
 *     tags: [Promotions]
 *     responses:
 *       200:
 *         description: Mobile promotions fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Mobile promotions fetched successfully." }
 *                 promotions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw promotion_images row plus image_full_url, mobile_image_full_url, and a serialized product (or null).
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET() {
  try {
    const rows = await prisma.promotion_images.findMany({
      where: { status: 1, mobile_file_path: { not: null } },
    });
    const promotions = await Promise.all(
      rows.map(async (row) => {
        const product = row.product_code
          ? await prisma.products.findFirst({ where: { product_code: row.product_code } })
          : null;
        return {
          ...row,
          image_full_url: assetUrl(row.file_path, "backend/promotion_files"),
          mobile_image_full_url: assetUrl(row.mobile_file_path, "backend/promotion_files"),
          product: product ? await serializeProduct(product) : null,
        };
      }),
    );
    return successResponse("Mobile promotions fetched successfully.", { promotions });
  } catch (error) {
    console.error("Exception occurred while fetching mobile promotions", error);
    return serverErrorResponse("Failed to get mobile promotions", error);
  }
}
