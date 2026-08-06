import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { fetchComplianceRowByKey, formatComplianceRecord, upsertCompliance } from "@/lib/complianceHelpers";
import { prisma } from "@/lib/prisma";

// Ports gargnew's app/api/v1/compliances/[key]/route.js. Admin-only, gated on every verb.
/**
 * @swagger
 * /api/v1/compliances/{key}:
 *   get:
 *     summary: Get one compliance record by key (admin)
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Compliance key, e.g. about_company, privacy_policy, return_refund_policy, medical_certifications.
 *     responses:
 *       200:
 *         description: Compliance record fetched (`compliance` is null if no row exists for this key).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 compliance:
 *                   type: object
 *                   nullable: true
 *                   description: formatComplianceRecord shape (lib/complianceHelpers.ts).
 *                   properties:
 *                     id: { type: integer }
 *                     key: { type: string }
 *                     value: { type: string, description: "Best-effort single display value extracted from the stored JSON/string." }
 *                     raw_value: { type: string, description: "Raw stored value, before parsing." }
 *                     compliancefiles: { type: array, items: { type: object } }
 *                     data: { description: "Parsed JSON value, or the raw string if not JSON." }
 *                     created_at: { type: string, format: date-time }
 *                     updated_at: { type: string, format: date-time }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const { key } = await params;
  const row = await fetchComplianceRowByKey(key);
  return NextResponse.json({ success: true, compliance: row ? formatComplianceRecord(row) : null });
}

/**
 * @swagger
 * /api/v1/compliances/{key}:
 *   put:
 *     summary: Create or update one compliance record by key (admin)
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Compliance key to upsert.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value:
 *                 description: "Any JSON value; objects/arrays are stored JSON-encoded, strings are stored as-is."
 *     responses:
 *       200:
 *         description: Compliance updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Compliance updated successfully." }
 *       400:
 *         description: Missing `value`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Compliance value is required." }
 *       401:
 *         description: Missing/invalid admin bearer token.
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
 *                 message: { type: string, description: "Exception message, or a generic fallback." }
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { key } = await params;
    const body = await req.json();

    if (body.value === undefined || body.value === null) {
      return NextResponse.json({ success: false, message: "Compliance value is required." }, { status: 400 });
    }

    await upsertCompliance(key, body.value);

    return NextResponse.json({ success: true, message: "Compliance updated successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/compliances/{key}:
 *   delete:
 *     summary: Delete one compliance record by key (admin)
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Compliance key to delete. No error if no row exists for this key.
 *     responses:
 *       200:
 *         description: Compliance deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Compliance deleted successfully." }
 *       401:
 *         description: Missing/invalid admin bearer token.
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
 *                 message: { type: string, description: "Exception message, or a generic fallback." }
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { key } = await params;
    const row = await fetchComplianceRowByKey(key);
    if (row) {
      await prisma.compliances.delete({ where: { id: row.id } });
    }

    return NextResponse.json({ success: true, message: "Compliance deleted successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
