import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/shipping-carriers/route.js. The real shipping_carriers table (from
// this project's Prisma schema) already has a `status` column - gargnew's own version
// dynamically created a `publish` column against a database that lacked one; not needed here.
/**
 * @swagger
 * /api/shipping-carriers:
 *   get:
 *     summary: List shipping carriers, newest first (admin token)
 *     tags: [ShippingCarriers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Carriers fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 carriers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Shipping carrier row (id, name, address, phone, type, status, created_at, updated_at).
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const carriers = await prisma.shipping_carriers.findMany({ orderBy: { id: "desc" } });
    return NextResponse.json({ success: true, carriers });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/shipping-carriers:
 *   post:
 *     summary: Create a shipping carrier (admin token)
 *     tags: [ShippingCarriers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               name: { type: string }
 *               address: { type: string }
 *               phone: { type: string }
 *               type: { type: string }
 *               publish: { type: boolean, description: "Truthy sets status=1, falsy sets status=0. Defaults to 1 (published) if neither publish nor status is sent." }
 *               status: { type: integer, description: Used only if publish is not sent. }
 *     responses:
 *       200:
 *         description: Carrier created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Carrier created successfully." }
 *                 carrierId: { type: integer }
 *       400:
 *         description: Missing carrier name or type.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function POST(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const address = String(body.address || "").trim();
    const phone = String(body.phone || "").trim();
    const type = String(body.type || "").trim();
    const status = body.publish === undefined && body.status === undefined ? 1 : Number(body.publish ?? body.status) ? 1 : 0;

    if (!name) return NextResponse.json({ success: false, message: "Carrier name is required." }, { status: 400 });
    if (!type) return NextResponse.json({ success: false, message: "Carrier type is required." }, { status: 400 });

    const created = await prisma.shipping_carriers.create({
      data: {
        name,
        address: address || null,
        phone: phone || null,
        type,
        status,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    await recordAuditLog({
      adminId: authUser.id,
      action: "Create",
      module: "shipping_carriers",
      modelType: "Shipping Carrier",
      modelId: String(created.id),
      newData: { name, address, phone, type, status },
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "Carrier created successfully.", carrierId: Number(created.id) });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
