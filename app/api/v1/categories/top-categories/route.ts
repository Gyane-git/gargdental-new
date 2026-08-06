import { prisma } from "@/lib/prisma";
import { serializeCategoryWithActiveChildren } from "@/lib/categoryTree";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports CategoryController::get_top_categories (CategoryController.php:71-90).
/**
 * @swagger
 * /api/v1/categories/top-categories:
 *   get:
 *     summary: List active top-level categories flagged as "top", each with its active children tree
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: Categories fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Categories fetched successfully." }
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Raw categories row plus image_full_url and an activeChildren array.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET() {
  try {
    const topLevel = await prisma.categories.findMany({ where: { status: 1, top: 1, parent_id: null } });
    const categories = await Promise.all(topLevel.map((c) => serializeCategoryWithActiveChildren(c.id)));
    return successResponse("Categories fetched successfully.", { categories });
  } catch (error) {
    console.error("Exception occurred while fetching categories", error);
    return serverErrorResponse("Failed to get categories", error);
  }
}
