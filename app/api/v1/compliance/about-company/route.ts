import { NextRequest, NextResponse } from "next/server";
import { fetchComplianceRowByKey, parseComplianceValue, upsertCompliance } from "@/lib/complianceHelpers";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/compliance/about-company/route.js. Admin-only, gated on POST
// (gargnew left both verbs unauthenticated).
/**
 * @swagger
 * /api/v1/compliance/about-company:
 *   get:
 *     summary: Get "About Company" compliance content
 *     tags: [Compliance]
 *     responses:
 *       200:
 *         description: About Company content fetched (empty strings/array if no row exists yet).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 content: { type: string }
 *                 certifications:
 *                   type: array
 *                   items: { type: object }
 */
export async function GET() {
  const row = await fetchComplianceRowByKey("about_company");

  if (!row) {
    return NextResponse.json({ success: true, content: "", certifications: [] });
  }

  const parsed = parseComplianceValue(row.value);
  const data =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { content?: string; certifications?: unknown[] })
      : { content: String(row.value ?? ""), certifications: [] };

  return NextResponse.json({ success: true, content: data.content || "", certifications: data.certifications || [] });
}

/**
 * @swagger
 * /api/v1/compliance/about-company:
 *   post:
 *     summary: Create or update "About Company" compliance content (admin)
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, description: "About Company HTML/text content." }
 *     responses:
 *       200:
 *         description: About Company content saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Company information saved successfully." }
 *       400:
 *         description: Missing/blank `content`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Company information is required." }
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
export async function POST(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { content } = await req.json();

    if (!content?.trim()) {
      return NextResponse.json({ success: false, message: "Company information is required." }, { status: 400 });
    }

    await upsertCompliance("about_company", content);

    return NextResponse.json({ success: true, message: "Company information saved successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
