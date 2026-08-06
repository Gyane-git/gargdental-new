import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports CustomerController::GrievanceForm (CustomerController.php:291-373): saves base64
// `document` entries (one or many) to storage/app/public/grievances/{customerId}/{uniqid}.{ext}.
/**
 * @swagger
 * /api/v1/customer/grievance:
 *   post:
 *     summary: Submit a customer grievance
 *     tags: [Grievances]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, phone, city, remarks]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               city: { type: string }
 *               remarks: { type: string }
 *               document:
 *                 type: array
 *                 items: { type: string }
 *                 description: Optional array of base64 data URIs (data:<type>/<ext>;base64,<data>), saved under storage/grievances/{customerId}.
 *     responses:
 *       200:
 *         description: Grievance submitted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Thank you for submitting grievance. We will respond to you shortly." }
 *       401:
 *         description: Missing/invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: Validation errors.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { name, email, phone, city, remarks, document } = body as {
    name?: string;
    email?: string;
    phone?: string;
    city?: string;
    remarks?: string;
    document?: string | string[];
  };

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "The name field is required.";
  if (!email) fieldErrors.email = "The email field is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "The email field must be a valid email address.";
  if (!phone) fieldErrors.phone = "The phone field is required.";
  if (!city) fieldErrors.city = "The city field is required.";
  if (!remarks) fieldErrors.remarks = "The remarks field is required.";
  if (document !== undefined && !Array.isArray(document)) fieldErrors.document = "The document field must be an array.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    let savedDocument: string | null = null;

    if (document && (Array.isArray(document) ? document.length > 0 : document)) {
      const customerId = Number(auth.id);
      const folder = `grievances/${customerId}`;
      const dir = path.join(mediaStoragePath(), folder);
      await mkdir(dir, { recursive: true });

      const documents = Array.isArray(document) ? document : [document];
      const savedDocuments: string[] = [];

      for (const docData of documents) {
        const match = /^data:(\w+)\/(\w+);base64,(.+)$/.exec(docData);
        const extension = match ? match[2].toLowerCase() : "png";
        const data = match ? match[3] : docData;
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
        await writeFile(path.join(dir, fileName), Buffer.from(data, "base64"));
        savedDocuments.push(`${folder}/${fileName}`);
      }

      savedDocument = JSON.stringify(savedDocuments);
    }

    await prisma.grievances.create({
      data: {
        customer_id: Number(auth.id),
        full_name: name as string,
        email: email as string,
        phone: phone as string,
        city: city as string,
        remarks: remarks as string,
        document: savedDocument,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    return successResponse("Thank you for submitting grievance. We will respond to you shortly.");
  } catch (error) {
    console.error("Exception occurred while submitting grievance", error);
    return serverErrorResponse("Failed to submit grievance.", error);
  }
}
