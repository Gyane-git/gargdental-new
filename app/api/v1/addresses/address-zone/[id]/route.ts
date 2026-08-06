import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/addresses/address-zone/[id]/route.js. Admin-only, gated on every verb.
/**
 * @swagger
 * /api/v1/addresses/address-zone/{id}:
 *   get:
 *     summary: Get a single address zone by id (admin token)
 *     tags: [Addresses]
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
 *         description: Zone found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 zone:
 *                   type: object
 *                   description: address_zone row (id, city_id, zone_name, created_at, updated_at).
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Zone not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Zone not found" }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { id } = await params;
  const zone = await prisma.address_zone.findUnique({ where: { id: BigInt(id) } });
  if (!zone) return NextResponse.json({ success: false, message: "Zone not found" }, { status: 404 });
  return NextResponse.json({ success: true, zone });
}

/**
 * @swagger
 * /api/v1/addresses/address-zone/{id}:
 *   put:
 *     summary: Update an address zone's city and name (admin token)
 *     tags: [Addresses]
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
 *             required: [city_id, zone_name]
 *             properties:
 *               city_id: { type: integer, description: "set_shipping.id this zone belongs to", example: 3 }
 *               zone_name: { type: string, example: "Baneshwor" }
 *     responses:
 *       200:
 *         description: Zone updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Zone updated successfully" }
 *       400:
 *         description: city_id or zone_name missing/blank.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "City is required" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Zone not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Zone not found" }
 *       409:
 *         description: Another zone with the same (trimmed, case-insensitive) name already exists in this city.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Zone already exists in this city" }
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
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { city_id, zone_name } = body;

    if (!city_id) {
      return NextResponse.json({ success: false, message: "City is required" }, { status: 400 });
    }
    if (!zone_name || String(zone_name).trim() === "") {
      return NextResponse.json({ success: false, message: "Zone name is required" }, { status: 400 });
    }

    const existing = await prisma.address_zone.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Zone not found" }, { status: 404 });

    const trimmedName = String(zone_name).trim();
    const siblings = await prisma.address_zone.findMany({ where: { city_id: BigInt(city_id), NOT: { id: BigInt(id) } } });
    if (siblings.some((z) => z.zone_name.toLowerCase() === trimmedName.toLowerCase())) {
      return NextResponse.json({ success: false, message: "Zone already exists in this city" }, { status: 409 });
    }

    await prisma.address_zone.update({ where: { id: BigInt(id) }, data: { city_id: BigInt(city_id), zone_name: trimmedName } });

    return NextResponse.json({ success: true, message: "Zone updated successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/addresses/address-zone/{id}:
 *   delete:
 *     summary: Delete an address zone by id (admin token)
 *     tags: [Addresses]
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
 *         description: Zone deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Zone deleted successfully" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Zone not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Zone not found" }
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
    const existing = await prisma.address_zone.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Zone not found" }, { status: 404 });

    await prisma.address_zone.delete({ where: { id: BigInt(id) } });

    return NextResponse.json({ success: true, message: "Zone deleted successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
