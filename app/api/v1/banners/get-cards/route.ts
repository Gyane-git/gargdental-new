import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports BannerController::get_cards (BannerController.php:200-214). PosterCard.php:16-55's
// three always-appended accessors, no product relation here (poster_cards has no product_code column).
/**
 * @swagger
 * /api/v1/banners/get-cards:
 *   get:
 *     summary: List poster cards (home-page triple-image cards)
 *     tags: [Banners]
 *     responses:
 *       200:
 *         description: Poster cards fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Poster Cards fetched successfully." }
 *                 poster_cards:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw poster_cards row plus card1_full_url/card2_full_url/card3_full_url.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET() {
  try {
    const rows = await prisma.poster_cards.findMany();
    const poster_cards = rows.map((row) => ({
      ...row,
      card1_full_url: assetUrl(row.card_1, "backend/poster_cards"),
      card2_full_url: assetUrl(row.card_2, "backend/poster_cards"),
      card3_full_url: assetUrl(row.card_3, "backend/poster_cards"),
    }));
    return successResponse("Poster Cards fetched successfully.", { poster_cards });
  } catch (error) {
    console.error("Exception occurred while fetching poster_cards", error);
    return serverErrorResponse("Failed to get poster_cards", error);
  }
}
