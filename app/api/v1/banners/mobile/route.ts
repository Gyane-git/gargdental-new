import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { serializeProduct } from "@/lib/productSerializer";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports BannerController::get_mobile_banners (BannerController.php:68-91).
/**
 * @swagger
 * /api/v1/banners/mobile:
 *   get:
 *     summary: List active banners that have a mobile image, each with its linked product
 *     tags: [Banners]
 *     responses:
 *       200:
 *         description: Mobile banners fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Mobile banners fetched successfully." }
 *                 banners:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw carousel_images row plus image_full_url, mobile_image_full_url, and a serialized product (or null).
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET() {
  try {
    const rows = await prisma.carousel_images.findMany({
      where: { status: 1, mobile_file_path: { not: null } },
    });
    const banners = await Promise.all(
      rows.map(async (row) => {
        const product = row.product_code
          ? await prisma.products.findFirst({ where: { product_code: row.product_code } })
          : null;
        return {
          ...row,
          image_full_url: assetUrl(row.file_path, "backend/carousel_files"),
          mobile_image_full_url: assetUrl(row.mobile_file_path, "backend/carousel_files"),
          product: product ? await serializeProduct(product) : null,
        };
      }),
    );
    return successResponse("Mobile banners fetched successfully.", { banners });
  } catch (error) {
    console.error("Exception occurred while fetching banners", error);
    return serverErrorResponse("Failed to get banners", error);
  }
}
