import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { requireAdminAuth } from "@/lib/adminAuth";
import { fetchAllComplianceRows, fetchComplianceRowByKey, formatComplianceRecord, upsertCompliance } from "@/lib/complianceHelpers";

const COMPLIANCE_KEYS = [
  "about_company",
  "privacy_policy",
  "return_refund_policy",
  "medical_certifications",
  "business_registration",
  "about_us",
  "terms_conditions",
];

// Ports ComplianceController::get_compliances (ComplianceController.php:37-51), including the
// nested compliancefiles (Compliance hasMany CompliancesDoc) and each doc/compliance's
// `file_url`/`files_full_url` accessors (Compliance.php:38-62, CompliancesDoc.php:15-26), PLUS
// gargnew's admin ?key= single-record lookup (app/api/v1/compliances/route.js GET) as an
// additive branch - mobile never sends `key`, so the branch never interferes with the shape above.
/**
 * @swagger
 * /api/v1/compliances:
 *   get:
 *     summary: List all compliance records (with their uploaded doc files), or fetch one record by key
 *     tags: [Compliance]
 *     parameters:
 *       - in: query
 *         name: key
 *         schema:
 *           type: string
 *         required: false
 *         description: When provided, returns a single compliance record for this key instead of the full list (admin lookup; mobile never sends this).
 *     responses:
 *       200:
 *         description: Compliances fetched successfully. Shape depends on whether `key` was provided.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   description: Response when `key` is provided.
 *                   properties:
 *                     success: { type: boolean, example: true }
 *                     compliance:
 *                       type: object
 *                       nullable: true
 *                       description: formatComplianceRecord shape (lib/complianceHelpers.ts).
 *                 - type: object
 *                   description: Response when `key` is omitted (full list).
 *                   properties:
 *                     success: { type: boolean, example: true }
 *                     message: { type: string, example: "Compliances fetched successfully." }
 *                     compliances:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           key: { type: string }
 *                           value: { type: string }
 *                           created_at: { type: string, format: date-time }
 *                           updated_at: { type: string, format: date-time }
 *                           files_full_url: { type: array, items: { type: string } }
 *                           compliancefiles:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id: { type: integer }
 *                                 compliance_id: { type: integer }
 *                                 title: { type: string }
 *                                 filename: { type: string }
 *                                 created_at: { type: string, format: date-time }
 *                                 updated_at: { type: string, format: date-time }
 *                                 file_url: { type: string }
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
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (key) {
    try {
      const row = await fetchComplianceRowByKey(key);
      return NextResponse.json({ success: true, compliance: row ? formatComplianceRecord(row) : null });
    } catch (error) {
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
    }
  }

  try {
    const compliances = await prisma.compliances.findMany({
      where: { key: { in: COMPLIANCE_KEYS } },
    });

    const result = await Promise.all(
      compliances.map(async (compliance) => {
        const docs = await prisma.compliances_docs.findMany({
          where: { compliance_id: Number(compliance.id) },
        });
        const compliancefiles = docs.map((doc) => ({
          id: Number(doc.id),
          compliance_id: doc.compliance_id,
          title: doc.title,
          filename: doc.filename,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          file_url: assetUrl(doc.filename, "backend/compliances"),
        }));

        return {
          id: Number(compliance.id),
          key: compliance.key,
          value: compliance.value,
          created_at: compliance.created_at,
          updated_at: compliance.updated_at,
          files_full_url: compliancefiles.map((doc) => doc.file_url),
          compliancefiles,
        };
      }),
    );

    return successResponse("Compliances fetched successfully.", { compliances: result });
  } catch (error) {
    console.error("Exception occurred while fetching compliances", error);
    return serverErrorResponse("Failed to get compliances", error);
  }
}

// Ports gargnew's admin compliances upsert-by-key (app/api/v1/compliances/route.js POST).
// requireAdminAuth added - gargnew left this unauthenticated.
/**
 * @swagger
 * /api/v1/compliances:
 *   post:
 *     summary: Create or update a compliance record by key (admin)
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key, value]
 *             properties:
 *               key: { type: string, description: "Compliance key to upsert, e.g. about_company, privacy_policy." }
 *               value:
 *                 description: "Any JSON value; objects/arrays are stored JSON-encoded, strings are stored as-is."
 *     responses:
 *       200:
 *         description: Compliance saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Compliance saved successfully." }
 *       400:
 *         description: Missing `key` or `value`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Compliance key is required." }
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
    const body = await req.json();
    const key = String(body.key || "").trim();

    if (!key) {
      return NextResponse.json({ success: false, message: "Compliance key is required." }, { status: 400 });
    }
    if (body.value === undefined || body.value === null) {
      return NextResponse.json({ success: false, message: "Compliance value is required." }, { status: 400 });
    }

    await upsertCompliance(key, body.value);

    return NextResponse.json({ success: true, message: "Compliance saved successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
