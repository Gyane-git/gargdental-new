import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

// Ports gargnew's app/api/v1/clear-cache/route.js exactly.
/**
 * @swagger
 * /api/v1/clear-cache:
 *   post:
 *     summary: Revalidate the cached home, products, and hot-sales pages
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Cache cleared successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Cache cleared successfully." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Internal server error." }
 */
export async function POST() {
  try {
    revalidatePath("/");
    revalidatePath("/products");
    revalidatePath("/hot-sales");

    return NextResponse.json({ success: true, message: "Cache cleared successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
