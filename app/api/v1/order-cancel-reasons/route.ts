import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/v1/order-cancel-reasons/route.js (admin CRUD over order_cancel_reasons).
// gargnew's utils/orderCancelReasons.js resolved field-name aliases and dynamic column checks
// against a possibly-different schema; the real order_cancel_reasons table here already has
// exactly reason_name/reason_type/reason_for/status, so aliases are resolved directly.
/**
 * @swagger
 * /api/v1/order-cancel-reasons:
 *   get:
 *     summary: List all order cancel/return reasons (admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reasons fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 reasons:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: order_cancel_reasons row.
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error. NOTE this is a plain `{success, message}` shape, not the standard ServerErrorResponse envelope (no separate `error` field).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Failed to fetch cancellation reasons." }
 */
export async function GET(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const reasons = await prisma.order_cancel_reasons.findMany({ orderBy: { id: "desc" } });
    return NextResponse.json({ success: true, reasons });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to fetch cancellation reasons." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/order-cancel-reasons:
 *   post:
 *     summary: Create an order cancel/return reason (admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Each field accepts a camelCase or snake_case alias.
 *             required: [reasonName, reasonType, reasonFor]
 *             properties:
 *               reasonName: { type: string, description: "Alias of reason_name / name." }
 *               reasonType: { type: string, description: "Alias of reason_type / type. Lowercased before saving." }
 *               reasonFor: { type: string, description: "Alias of reason_for / for. Lowercased before saving." }
 *     responses:
 *       201:
 *         description: Reason added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Reason added successfully." }
 *                 reasonId: { type: integer }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
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
export async function POST(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const reasonName = body.reasonName ?? body.reason_name ?? body.name;
    const reasonType = body.reasonType ?? body.reason_type ?? body.type;
    const reasonFor = body.reasonFor ?? body.reason_for ?? body.for;

    if (!reasonName || !reasonType || !reasonFor) {
      return NextResponse.json({ success: false, message: "Reason name, reason type, and reason for are required." }, { status: 422 });
    }

    const created = await prisma.order_cancel_reasons.create({
      data: {
        reason_name: String(reasonName),
        reason_type: String(reasonType).toLowerCase(),
        reason_for: String(reasonFor).toLowerCase(),
        status: 1,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    return NextResponse.json({ success: true, message: "Reason added successfully.", reasonId: created.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
