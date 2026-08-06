import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/inquiries/[id]/route.js. Admin-only, gated on every verb.
/**
 * @swagger
 * /api/v1/inquiries/{id}:
 *   get:
 *     summary: Get a single contact-us inquiry by id (admin panel)
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: inquiries.id
 *     responses:
 *       200:
 *         description: Inquiry fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 inquiry:
 *                   type: object
 *                   description: Raw inquiries row (id, name, email, subject, message, created_at, updated_at).
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No inquiry with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Inquiry not found" }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { id } = await params;
  const inquiry = await prisma.inquiries.findUnique({ where: { id: BigInt(id) } });
  if (!inquiry) return NextResponse.json({ success: false, message: "Inquiry not found" }, { status: 404 });
  return NextResponse.json({ success: true, inquiry });
}

/**
 * @swagger
 * /api/v1/inquiries/{id}:
 *   delete:
 *     summary: Delete a contact-us inquiry by id (admin panel)
 *     tags: [Inquiries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: inquiries.id
 *     responses:
 *       200:
 *         description: Inquiry deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Inquiry deleted successfully" }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No inquiry with this id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Inquiry not found" }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Server error" }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.inquiries.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Inquiry not found" }, { status: 404 });

    await prisma.inquiries.delete({ where: { id: BigInt(id) } });

    return NextResponse.json({ success: true, message: "Inquiry deleted successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
