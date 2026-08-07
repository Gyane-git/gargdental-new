import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { fetchComplianceRowByKey, parseComplianceValue, upsertCompliance } from "@/lib/complianceHelpers";
import { requireAdminAuth } from "@/lib/adminAuth";
import { resolvePublicPath } from "@/lib/projectPaths";

interface Certification {
  id: string;
  title: string;
  fileUrl: string;
}

// Ports gargnew's app/api/v1/compliance/medical-certifications/[id]/route.js DELETE. Admin-only, gated.
/**
 * @swagger
 * /api/v1/compliance/medical-certifications/{id}:
 *   delete:
 *     summary: Delete one medical certification entry (and its uploaded file) by certification ID (admin)
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Certification entry UUID (assigned when the file was uploaded), not the compliances row ID.
 *     responses:
 *       200:
 *         description: Certification deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Certification deleted successfully." }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Either no `medical_certifications` compliance row exists yet, or no certification with this ID was found in it.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Certification not found." }
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
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const row = await fetchComplianceRowByKey("medical_certifications");
    if (!row) {
      return NextResponse.json({ success: false, message: "Medical certifications not found." }, { status: 404 });
    }

    const parsed = parseComplianceValue(row.value) as { content?: string; certifications?: Certification[] } | null;
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ success: false, message: "Invalid medical certifications data." }, { status: 500 });
    }

    const certifications = parsed.certifications || [];
    const certification = certifications.find((item) => String(item.id) === String(id));
    if (!certification) {
      return NextResponse.json({ success: false, message: "Certification not found." }, { status: 404 });
    }

    try {
      await fs.unlink(path.join(resolvePublicPath(), certification.fileUrl.replace(/^\//, "")));
    } catch {
      // Ignore missing file
    }

    parsed.certifications = certifications.filter((item) => String(item.id) !== String(id));
    await upsertCompliance("medical_certifications", parsed);

    return NextResponse.json({ success: true, message: "Certification deleted successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
