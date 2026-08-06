import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAuditLog } from "@/lib/auditLog";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's carrier-list page's PATCH `${CARRIERS_API}/${id}` toggle-publish call (no
// gargnew route.js exists for [id] - net new file). Uses the real `status` column, mapped from
// the `publish` field the admin UI sends (see app/api/shipping-carriers/route.ts's own comment
// on this same publish/status naming mismatch).
/**
 * @swagger
 * /api/shipping-carriers/{id}:
 *   get:
 *     summary: Get a single shipping carrier by id (admin token)
 *     tags: [ShippingCarriers]
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
 *         description: Carrier fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 carrier:
 *                   type: object
 *                   description: Shipping carrier row (id, name, address, phone, type, status, created_at, updated_at).
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Carrier not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Carrier not found." }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { id } = await params;
  const carrier = await prisma.shipping_carriers.findUnique({ where: { id: BigInt(id) } });
  if (!carrier) return NextResponse.json({ success: false, message: "Carrier not found." }, { status: 404 });
  return NextResponse.json({ success: true, carrier });
}

/**
 * @swagger
 * /api/shipping-carriers/{id}:
 *   patch:
 *     summary: Toggle a shipping carrier's published/status flag (admin token)
 *     description: Accepts either `publish` (boolean-ish, mapped to status 1/0) or `status` directly.
 *     tags: [ShippingCarriers]
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
 *             properties:
 *               publish: { type: boolean, description: "Truthy sets status=1, falsy sets status=0." }
 *               status: { type: integer, description: Used only if publish is not sent. }
 *     responses:
 *       200:
 *         description: Carrier updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Carrier updated successfully." }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Carrier not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Carrier not found." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.shipping_carriers.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Carrier not found." }, { status: 404 });

    const body = await req.json();
    const status = body.publish !== undefined ? (body.publish ? 1 : 0) : body.status !== undefined ? Number(body.status) : existing.status;

    await prisma.shipping_carriers.update({ where: { id: BigInt(id) }, data: { status, updated_at: nowForDb() } });

    await recordAuditLog({
      adminId: authUser.id,
      action: "Update",
      module: "shipping_carriers",
      modelType: "Shipping Carrier",
      modelId: id,
      newData: { status },
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "Carrier updated successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/shipping-carriers/{id}:
 *   put:
 *     summary: Update a shipping carrier's details (admin token)
 *     tags: [ShippingCarriers]
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
 *             properties:
 *               name: { type: string, description: Defaults to the existing value if omitted. }
 *               address: { type: string }
 *               phone: { type: string }
 *               type: { type: string, description: Defaults to the existing value if omitted. }
 *               publish: { type: boolean, description: "Truthy sets status=1, falsy sets status=0." }
 *               status: { type: integer, description: Used only if publish is not sent. }
 *     responses:
 *       200:
 *         description: Carrier updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Carrier updated successfully." }
 *       400:
 *         description: Carrier name or type resolved to empty.
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
 *       404:
 *         description: Carrier not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Carrier not found." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.shipping_carriers.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Carrier not found." }, { status: 404 });

    const body = await req.json();
    const name = String(body.name ?? existing.name).trim();
    const address = body.address !== undefined ? String(body.address).trim() : existing.address;
    const phone = body.phone !== undefined ? String(body.phone).trim() : existing.phone;
    const type = String(body.type ?? existing.type).trim();
    const status = body.publish !== undefined ? (body.publish ? 1 : 0) : body.status !== undefined ? Number(body.status) : existing.status;

    if (!name) return NextResponse.json({ success: false, message: "Carrier name is required." }, { status: 400 });
    if (!type) return NextResponse.json({ success: false, message: "Carrier type is required." }, { status: 400 });

    await prisma.shipping_carriers.update({
      where: { id: BigInt(id) },
      data: { name, address, phone, type, status, updated_at: nowForDb() },
    });

    return NextResponse.json({ success: true, message: "Carrier updated successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/shipping-carriers/{id}:
 *   delete:
 *     summary: Delete a shipping carrier (admin token)
 *     tags: [ShippingCarriers]
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
 *         description: Carrier deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Carrier deleted successfully." }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Carrier not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Carrier not found." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.shipping_carriers.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Carrier not found." }, { status: 404 });

    await prisma.shipping_carriers.delete({ where: { id: BigInt(id) } });

    await recordAuditLog({
      adminId: authUser.id,
      action: "Delete",
      module: "shipping_carriers",
      modelType: "Shipping Carrier",
      modelId: id,
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    });

    return NextResponse.json({ success: true, message: "Carrier deleted successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
