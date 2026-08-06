import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/newsletter-subscriber/[id]/route.js DELETE. Admin-only, gated.
/**
 * @swagger
 * /api/v1/newsletter-subscriber/{id}:
 *   delete:
 *     summary: Delete a newsletter subscriber by id (admin panel)
 *     tags: [Newsletter]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: newsletter_subscribers_list.id
 *     responses:
 *       200:
 *         description: Subscriber deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Subscriber deleted successfully." }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No subscriber with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Subscriber not found." }
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
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.newsletter_subscribers_list.findUnique({ where: { id: BigInt(id) } });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Subscriber not found." }, { status: 404 });
    }

    await prisma.newsletter_subscribers_list.delete({ where: { id: BigInt(id) } });

    return NextResponse.json({ success: true, message: "Subscriber deleted successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
