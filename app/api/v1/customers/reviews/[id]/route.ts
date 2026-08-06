import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/customers/reviews/[id]/route.js. requireAdminAuth added.
/**
 * @swagger
 * /api/v1/customers/reviews/{id}:
 *   get:
 *     summary: Get a single product review by id (admin panel)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: product_reviews.id
 *     responses:
 *       200:
 *         description: Review fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 review:
 *                   type: object
 *                   description: Raw product_reviews row.
 *       400:
 *         description: The id path segment is not a valid positive integer.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid ID" }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No review with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Review not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Failed to fetch review" }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { id } = await params;
  const numId = parseInt(id);
  if (!numId || isNaN(numId)) {
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
  }

  try {
    const review = await prisma.product_reviews.findUnique({ where: { id: BigInt(numId) } });
    if (!review) return NextResponse.json({ success: false, message: "Review not found" }, { status: 404 });
    return NextResponse.json({ success: true, review });
  } catch (error) {
    console.error("[GET /api/v1/customers/reviews/[id]]", error);
    return NextResponse.json({ success: false, message: "Failed to fetch review" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/customers/reviews/{id}:
 *   delete:
 *     summary: Delete a product review by id (admin panel)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: product_reviews.id
 *     responses:
 *       200:
 *         description: Review deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Review deleted" }
 *       400:
 *         description: The id path segment is not a valid positive integer.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid ID" }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No review with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Review not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Failed to delete review" }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { id } = await params;
  const numId = parseInt(id);
  if (!numId || isNaN(numId)) {
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
  }

  try {
    const existing = await prisma.product_reviews.findUnique({ where: { id: BigInt(numId) } });
    if (!existing) return NextResponse.json({ success: false, message: "Review not found" }, { status: 404 });

    await prisma.product_reviews.delete({ where: { id: BigInt(numId) } });
    return NextResponse.json({ success: true, message: "Review deleted" });
  } catch (error) {
    console.error("[DELETE /api/v1/customers/reviews/[id]]", error);
    return NextResponse.json({ success: false, message: "Failed to delete review" }, { status: 500 });
  }
}
