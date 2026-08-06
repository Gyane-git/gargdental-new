import { NextRequest, NextResponse } from "next/server";
import { fetchComplianceRowByKey, parseComplianceValue, upsertCompliance } from "@/lib/complianceHelpers";
import { requireAdminAuth } from "@/lib/adminAuth";

// Net-new admin CMS route, following the same pattern as the sibling compliance/* routes
// (about-company, privacy-policy) - gargnew's own page.js for this key had no fetch calls wired
// up yet (orphaned in the reference project), so this mirrors its siblings' real, working shape.
/**
 * @swagger
 * /api/v1/compliance/return-refund-policy:
 *   get:
 *     summary: Get the Return & Refund Policy content
 *     tags: [Compliance]
 *     responses:
 *       200:
 *         description: Return & Refund Policy fetched (empty string if no row exists yet).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 content: { type: string }
 */
export async function GET() {
  const row = await fetchComplianceRowByKey("return_refund_policy");

  if (!row) {
    return NextResponse.json({ success: true, content: "" });
  }

  const parsed = parseComplianceValue(row.value);
  const content =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { content?: string }).content || ""
      : String(row.value ?? "");

  return NextResponse.json({ success: true, content });
}

/**
 * @swagger
 * /api/v1/compliance/return-refund-policy:
 *   post:
 *     summary: Create or update the Return & Refund Policy content (admin)
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
 *               content: { type: string, description: "Return & Refund Policy HTML/text content." }
 *     responses:
 *       200:
 *         description: Return & Refund Policy saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Return & Refund Policy saved successfully." }
 *       400:
 *         description: Missing/blank `content`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Return & Refund Policy is required." }
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
      return NextResponse.json({ success: false, message: "Return & Refund Policy is required." }, { status: 400 });
    }

    await upsertCompliance("return_refund_policy", content);

    return NextResponse.json({ success: true, message: "Return & Refund Policy saved successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
