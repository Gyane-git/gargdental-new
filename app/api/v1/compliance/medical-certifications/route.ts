import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { fetchComplianceRowByKey, parseComplianceValue, upsertCompliance } from "@/lib/complianceHelpers";
import { requireAdminAuth } from "@/lib/adminAuth";

interface Certification {
  id: string;
  title: string;
  fileUrl: string;
}

// Ports gargnew's app/api/v1/compliance/medical-certifications/route.js. Admin-only, gated on POST.
/**
 * @swagger
 * /api/v1/compliance/medical-certifications:
 *   get:
 *     summary: Get the medical certifications description and list of uploaded certification files
 *     tags: [Compliance]
 *     responses:
 *       200:
 *         description: Medical certifications fetched (empty content/list if no row exists yet).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 content: { type: string }
 *                 certifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       title: { type: string }
 *                       fileUrl: { type: string }
 */
export async function GET() {
  const row = await fetchComplianceRowByKey("medical_certifications");

  if (!row) {
    return NextResponse.json({ success: true, content: "", certifications: [] });
  }

  const parsed = parseComplianceValue(row.value);
  const data =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { content?: string; certifications?: Certification[] })
      : { content: String(row.value ?? ""), certifications: [] };

  return NextResponse.json({ success: true, content: data.content || "", certifications: data.certifications || [] });
}

/**
 * @swagger
 * /api/v1/compliance/medical-certifications:
 *   post:
 *     summary: Update the description and append newly uploaded certification files (admin)
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [description]
 *             properties:
 *               description: { type: string, description: "Overwrites the stored description text." }
 *             additionalProperties:
 *               description: >
 *                 Zero or more new certifications, sent as indexed field pairs
 *                 `certifications[<n>][title]` (string) and `certifications[<n>][file]` (file).
 *                 Only pairs where both a title and a non-empty file are present are appended;
 *                 existing certifications are preserved and never overwritten.
 *     responses:
 *       200:
 *         description: Medical certifications saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Medical certifications saved successfully." }
 *                 certifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       title: { type: string }
 *                       fileUrl: { type: string }
 *       400:
 *         description: Missing/blank `description`.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Description is required." }
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
    const formData = await req.formData();
    const description = formData.get("description") as string | null;

    if (!description?.trim()) {
      return NextResponse.json({ success: false, message: "Description is required." }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public/uploads/certifications");
    await fs.mkdir(uploadDir, { recursive: true });

    const existingRow = await fetchComplianceRowByKey("medical_certifications");
    const parsedExisting = existingRow ? parseComplianceValue(existingRow.value) : null;

    const existing: { content: string; certifications: Certification[] } =
      parsedExisting && typeof parsedExisting === "object" && !Array.isArray(parsedExisting)
        ? (parsedExisting as { content: string; certifications: Certification[] })
        : { content: description, certifications: [] };

    existing.content = description;
    existing.certifications = existing.certifications || [];

    for (const [key, value] of formData.entries()) {
      if (!key.includes("[file]")) continue;
      const index = key.match(/\d+/)?.[0];
      const title = formData.get(`certifications[${index}][title]`);

      if (!title || !(value instanceof File) || value.size === 0) continue;

      const extension = path.extname(value.name);
      const fileName = `${randomUUID()}${extension}`;
      await fs.writeFile(path.join(uploadDir, fileName), Buffer.from(await value.arrayBuffer()));

      existing.certifications.push({ id: randomUUID(), title: String(title), fileUrl: `/uploads/certifications/${fileName}` });
    }

    await upsertCompliance("medical_certifications", existing);

    return NextResponse.json({ success: true, message: "Medical certifications saved successfully.", certifications: existing.certifications });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
