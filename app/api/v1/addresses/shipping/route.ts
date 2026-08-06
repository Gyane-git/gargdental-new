import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's app/api/v1/addresses/shipping/route.js. Admin-only, gated on every verb.
async function resolveProvinceId(provinceInput: unknown): Promise<number | null> {
  let provinceId = Number(provinceInput);
  if (!Number.isNaN(provinceId) && provinceId > 0) return provinceId;

  const province = await prisma.provinces.findFirst({
    where: { province_name: { equals: String(provinceInput).trim() } },
  });
  return province ? Number(province.id) : null;
}

/**
 * @swagger
 * /api/v1/addresses/shipping:
 *   get:
 *     summary: List all shipping/city rows with their province name (admin token)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Shipping rows fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 shipping:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: id, province_id, province_name (joined), city, shipping_cost, apply_shipping, remarks, created_at, updated_at.
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
    const rows = await prisma.set_shipping.findMany({ orderBy: { id: "desc" }, include: { provinces: true } });
    const shipping = rows.map((s) => ({
      id: s.id,
      province_id: s.province_id,
      province_name: s.provinces?.province_name ?? null,
      city: s.city,
      shipping_cost: s.shipping_cost,
      apply_shipping: s.apply_shipping,
      remarks: s.remarks,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));
    return NextResponse.json({ success: true, shipping });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/addresses/shipping:
 *   post:
 *     summary: Create a shipping/city row for a province (admin token)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [city, shipping_cost]
 *             properties:
 *               province_id: { type: integer, description: "provinces.id. Either this or `province` (name) is required.", example: 1 }
 *               province: { type: string, description: "Province name, resolved to an id if province_id isn't sent.", example: "Bagmati" }
 *               city: { type: string, example: "Kathmandu" }
 *               shipping_cost: { type: number, example: 100 }
 *               cost: { type: number, description: "Alias for shipping_cost.", example: 100 }
 *               apply_shipping: { type: integer, description: "Defaults to 1 when omitted.", example: 1 }
 *               remarks: { type: string, example: "" }
 *     responses:
 *       200:
 *         description: Shipping added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Shipping added successfully." }
 *       400:
 *         description: province/province_id, city, or shipping_cost missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Province, city and shipping cost are required." }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: province_id/province name did not resolve to an existing province.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Province not found." }
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
    const provinceInput = body.province_id ?? body.province;
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const shippingCost = body.shipping_cost ?? body.cost;
    const applyShipping = body.apply_shipping ?? 1;
    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : "";

    if (!provinceInput || !city || shippingCost === "" || shippingCost === null || shippingCost === undefined) {
      return NextResponse.json({ success: false, message: "Province, city and shipping cost are required." }, { status: 400 });
    }

    const provinceId = await resolveProvinceId(provinceInput);
    if (!provinceId) {
      return NextResponse.json({ success: false, message: "Province not found." }, { status: 404 });
    }

    await prisma.set_shipping.create({
      data: {
        province_id: BigInt(provinceId),
        city,
        shipping_cost: shippingCost,
        apply_shipping: Number(applyShipping ?? 1),
        remarks: remarks || "",
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    return NextResponse.json({ success: true, message: "Shipping added successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/addresses/shipping:
 *   put:
 *     summary: Update a shipping/city row (admin token)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, city, shipping_cost]
 *             properties:
 *               id: { type: integer, description: "set_shipping.id to update.", example: 5 }
 *               province_id: { type: integer, description: "provinces.id. Either this or `province` (name) is required.", example: 1 }
 *               province: { type: string, description: "Province name, resolved to an id if province_id isn't sent.", example: "Bagmati" }
 *               city: { type: string, example: "Kathmandu" }
 *               shipping_cost: { type: number, example: 120 }
 *               cost: { type: number, description: "Alias for shipping_cost.", example: 120 }
 *               apply_shipping: { type: integer, description: "Defaults to 1 when omitted.", example: 1 }
 *               remarks: { type: string, example: "" }
 *     responses:
 *       200:
 *         description: Shipping updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Shipping updated successfully." }
 *       400:
 *         description: id, or province/province_id/city/shipping_cost missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Shipping id is required." }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Province not resolved, or the shipping row itself doesn't exist.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Shipping row not found." }
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
export async function PUT(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const id = Number(body.id);
    const provinceInput = body.province_id ?? body.province;
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const shippingCost = body.shipping_cost ?? body.cost;
    const applyShipping = body.apply_shipping ?? 1;
    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : "";

    if (!id) {
      return NextResponse.json({ success: false, message: "Shipping id is required." }, { status: 400 });
    }
    if (!provinceInput || !city || shippingCost === "" || shippingCost === null || shippingCost === undefined) {
      return NextResponse.json({ success: false, message: "Province, city and shipping cost are required." }, { status: 400 });
    }

    const provinceId = await resolveProvinceId(provinceInput);
    if (!provinceId) {
      return NextResponse.json({ success: false, message: "Province not found." }, { status: 404 });
    }

    const existing = await prisma.set_shipping.findUnique({ where: { id: BigInt(id) } });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Shipping row not found." }, { status: 404 });
    }

    await prisma.set_shipping.update({
      where: { id: BigInt(id) },
      data: {
        province_id: BigInt(provinceId),
        city,
        shipping_cost: shippingCost,
        apply_shipping: Number(applyShipping ?? 1),
        remarks: remarks || "",
        updated_at: nowForDb(),
      },
    });

    return NextResponse.json({ success: true, message: "Shipping updated successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/addresses/shipping:
 *   delete:
 *     summary: Delete a shipping/city row (admin token)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: false
 *         schema:
 *           type: integer
 *         description: set_shipping.id to delete. Can be sent here or as `id` in a JSON body instead.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id: { type: integer, example: 5 }
 *     responses:
 *       200:
 *         description: Shipping deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Shipping deleted successfully." }
 *       400:
 *         description: id missing from both body and query string.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Shipping id is required." }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Shipping row not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Shipping row not found." }
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
export async function DELETE(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id || new URL(req.url).searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ success: false, message: "Shipping id is required." }, { status: 400 });
    }

    const existing = await prisma.set_shipping.findUnique({ where: { id: BigInt(id) } });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Shipping row not found." }, { status: 404 });
    }

    await prisma.set_shipping.delete({ where: { id: BigInt(id) } });

    return NextResponse.json({ success: true, message: "Shipping deleted successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
