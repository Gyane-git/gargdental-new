import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/addresses/address-zone/route.js. Admin-only, gated on every verb
// (gargnew left this unauthenticated). city_id references set_shipping.id (joined for city_name).
/**
 * @swagger
 * /api/v1/addresses/address-zone:
 *   get:
 *     summary: List all address zones with their city name (admin token)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Zones fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 zones:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: id, city_id, city_name (joined from set_shipping), zone_name, created_at, updated_at.
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
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
export async function GET(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const zones = await prisma.address_zone.findMany({ orderBy: { id: "desc" } });
    const cityIds = [...new Set(zones.map((z) => z.city_id))];
    const cities = await prisma.set_shipping.findMany({ where: { id: { in: cityIds } } });
    const cityById = new Map(cities.map((c) => [c.id.toString(), c.city]));

    const result = zones.map((z) => ({
      id: z.id,
      city_id: z.city_id,
      city_name: cityById.get(z.city_id.toString()) ?? null,
      zone_name: z.zone_name,
      created_at: z.created_at,
      updated_at: z.updated_at,
    }));

    return NextResponse.json({ success: true, zones: result });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/addresses/address-zone:
 *   post:
 *     summary: Create an address zone for a city (admin token)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
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
 *       201:
 *         description: Zone created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Zone created successfully" }
 *                 zoneId: { type: integer, example: 15 }
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
 *       409:
 *         description: A zone with the same (trimmed, case-insensitive) name already exists in this city.
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
export async function POST(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { city_id, zone_name } = body;

    if (!city_id) {
      return NextResponse.json({ success: false, message: "City is required" }, { status: 400 });
    }
    if (!zone_name || String(zone_name).trim() === "") {
      return NextResponse.json({ success: false, message: "Zone name is required" }, { status: 400 });
    }

    const trimmedName = String(zone_name).trim();
    const existing = await prisma.address_zone.findMany({ where: { city_id: BigInt(city_id) } });
    if (existing.some((z) => z.zone_name.toLowerCase() === trimmedName.toLowerCase())) {
      return NextResponse.json({ success: false, message: "Zone already exists in this city" }, { status: 409 });
    }

    const created = await prisma.address_zone.create({ data: { city_id: BigInt(city_id), zone_name: trimmedName } });

    return NextResponse.json({ success: true, message: "Zone created successfully", zoneId: created.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
