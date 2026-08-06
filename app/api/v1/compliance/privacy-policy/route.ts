import { NextRequest, NextResponse } from "next/server";
import { upsertCompliance } from "@/lib/complianceHelpers";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/compliance/privacy-policy/route.js. Admin-only, gated.
/**
 * @swagger
 * /api/v1/compliance/privacy-policy:
 *   post:
 *     summary: Create or update the Privacy Policy content (admin)
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
 *               content: { type: string, description: "Privacy Policy HTML/text content." }
 *     responses:
 *       200:
 *         description: Privacy Policy saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Privacy Policy saved successfully." }
 *       400:
 *         description: Missing/blank `content`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Privacy Policy is required." }
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
      return NextResponse.json({ success: false, message: "Privacy Policy is required." }, { status: 400 });
    }

    await upsertCompliance("privacy_policy", content);

    return NextResponse.json({ success: true, message: "Privacy Policy saved successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
