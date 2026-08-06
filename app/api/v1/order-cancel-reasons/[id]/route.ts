import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/v1/order-cancel-reasons/[id]/route.js. Admin-only, gated.
/**
 * @swagger
 * /api/v1/order-cancel-reasons/{id}:
 *   get:
 *     summary: Get a single order cancel/return reason by id (admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Reason found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 reason:
 *                   type: object
 *                   description: order_cancel_reasons row.
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No reason with that id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Reason not found." }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { id } = await params;
  const reason = await prisma.order_cancel_reasons.findUnique({ where: { id: BigInt(id) } });
  if (!reason) return NextResponse.json({ success: false, message: "Reason not found." }, { status: 404 });
  return NextResponse.json({ success: true, reason });
}

/**
 * @swagger
 * /api/v1/order-cancel-reasons/{id}:
 *   patch:
 *     summary: Update an order cancel/return reason (admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Each field accepts a camelCase or snake_case alias; unset fields fall back to the existing row's value.
 *             properties:
 *               reasonName: { type: string, description: "Alias of reason_name / name." }
 *               reasonType: { type: string, description: "Alias of reason_type / type. Lowercased before saving." }
 *               reasonFor: { type: string, description: "Alias of reason_for / for. Lowercased before saving." }
 *               status: { type: integer }
 *     responses:
 *       200:
 *         description: Reason updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Reason updated successfully." }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No reason with that id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Reason not found." }
 *       422:
 *         description: reasonName/reasonType/reasonFor (after resolving aliases) were missing. NOTE this is a plain `{success, message}` shape, not the standard ValidationErrorResponse envelope.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Reason name, reason type, and reason for are required." }
 *       500:
 *         description: Unexpected server error. NOTE this is a plain `{success, message}` shape, not the standard ServerErrorResponse envelope (no separate `error` field).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Internal server error." }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.order_cancel_reasons.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Reason not found." }, { status: 404 });

    const body = await req.json();
    const reasonName = body.reasonName ?? body.reason_name ?? body.name ?? existing.reason_name;
    const reasonType = body.reasonType ?? body.reason_type ?? body.type ?? existing.reason_type;
    const reasonFor = body.reasonFor ?? body.reason_for ?? body.for ?? existing.reason_for;
    const status = body.status !== undefined ? Number(body.status) : existing.status;

    if (!reasonName || !reasonType || !reasonFor) {
      return NextResponse.json({ success: false, message: "Reason name, reason type, and reason for are required." }, { status: 422 });
    }

    await prisma.order_cancel_reasons.update({
      where: { id: BigInt(id) },
      data: {
        reason_name: String(reasonName),
        reason_type: String(reasonType).toLowerCase(),
        reason_for: String(reasonFor).toLowerCase(),
        status,
        updated_at: nowForDb(),
      },
    });

    return NextResponse.json({ success: true, message: "Reason updated successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/order-cancel-reasons/{id}:
 *   delete:
 *     summary: Delete an order cancel/return reason (admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Reason deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Reason deleted successfully." }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No reason with that id.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Reason not found." }
 *       500:
 *         description: Unexpected server error. NOTE this is a plain `{success, message}` shape, not the standard ServerErrorResponse envelope (no separate `error` field).
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
    const existing = await prisma.order_cancel_reasons.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Reason not found." }, { status: 404 });

    await prisma.order_cancel_reasons.delete({ where: { id: BigInt(id) } });

    return NextResponse.json({ success: true, message: "Reason deleted successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
