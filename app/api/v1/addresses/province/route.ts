import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/addresses/province/route.js. Admin-only, gated on every verb.
/**
 * @swagger
 * /api/v1/addresses/province:
 *   get:
 *     summary: List all provinces (admin token)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Provinces fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 provinces:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: provinces row (id, province_name).
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
    const provinces = await prisma.provinces.findMany({ orderBy: { id: "desc" } });
    return NextResponse.json({ success: true, provinces });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/addresses/province:
 *   post:
 *     summary: Create a province (admin token)
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [province]
 *             properties:
 *               province: { type: string, example: "Bagmati" }
 *     responses:
 *       201:
 *         description: Province created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Province created successfully" }
 *                 provinceId: { type: integer, example: 8 }
 *       400:
 *         description: province missing/blank.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Province name is required" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       409:
 *         description: A province with the same (trimmed, case-insensitive) name already exists.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Province already exists" }
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
    const { province } = await req.json();
    if (!province || String(province).trim() === "") {
      return NextResponse.json({ success: false, message: "Province name is required" }, { status: 400 });
    }

    const trimmed = String(province).trim();
    const all = await prisma.provinces.findMany();
    if (all.some((p) => p.province_name.toLowerCase() === trimmed.toLowerCase())) {
      return NextResponse.json({ success: false, message: "Province already exists" }, { status: 409 });
    }

    const created = await prisma.provinces.create({ data: { province_name: trimmed } });

    return NextResponse.json({ success: true, message: "Province created successfully", provinceId: created.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
