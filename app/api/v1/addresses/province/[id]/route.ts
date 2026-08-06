import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/addresses/province/[id]/route.js. Admin-only, gated on every verb.
/**
 * @swagger
 * /api/v1/addresses/province/{id}:
 *   get:
 *     summary: Get a single province by id (admin token)
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
 *         description: Province found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 province:
 *                   type: object
 *                   description: provinces row (id, province_name).
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Province not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Province not found" }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { id } = await params;
  const province = await prisma.provinces.findUnique({ where: { id: BigInt(id) } });
  if (!province) return NextResponse.json({ success: false, message: "Province not found" }, { status: 404 });
  return NextResponse.json({ success: true, province });
}

/**
 * @swagger
 * /api/v1/addresses/province/{id}:
 *   put:
 *     summary: Rename a province (admin token)
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
 *             required: [province]
 *             properties:
 *               province: { type: string, example: "Bagmati" }
 *     responses:
 *       200:
 *         description: Province updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Province updated successfully" }
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
 *       404:
 *         description: Province not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Province not found" }
 *       409:
 *         description: Another province with the same (trimmed, case-insensitive) name already exists.
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
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { province } = await req.json();
    if (!province || String(province).trim() === "") {
      return NextResponse.json({ success: false, message: "Province name is required" }, { status: 400 });
    }

    const existing = await prisma.provinces.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Province not found" }, { status: 404 });

    const trimmed = String(province).trim();
    const all = await prisma.provinces.findMany({ where: { NOT: { id: BigInt(id) } } });
    if (all.some((p) => p.province_name.toLowerCase() === trimmed.toLowerCase())) {
      return NextResponse.json({ success: false, message: "Province already exists" }, { status: 409 });
    }

    await prisma.provinces.update({ where: { id: BigInt(id) }, data: { province_name: trimmed } });

    return NextResponse.json({ success: true, message: "Province updated successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/addresses/province/{id}:
 *   delete:
 *     summary: Delete a province by id (admin token)
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
 *         description: Province deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Province deleted successfully" }
 *       401:
 *         description: Missing or invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Province not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Province not found" }
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
    const existing = await prisma.provinces.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, message: "Province not found" }, { status: 404 });

    await prisma.provinces.delete({ where: { id: BigInt(id) } });

    return NextResponse.json({ success: true, message: "Province deleted successfully" });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}
