import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports ClinicController::clinic_setup_store (ClinicController.php:220-260). Note this endpoint
// uses HTTP 422 for validation errors, NOT the dominant 403 - a deliberate deviation replicated
// here exactly as gargdental does it.
/**
 * @swagger
 * /api/v1/clinic/clinic-setup/store:
 *   post:
 *     summary: Submit a public clinic-setup request
 *     tags: [Clinic]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, email, phone]
 *             properties:
 *               full_name: { type: string, description: "Max 255 characters." }
 *               email: { type: string }
 *               phone: { type: string, description: "Max 20 characters." }
 *               city: { type: string }
 *               budget: { type: string }
 *               remarks: { type: string }
 *     responses:
 *       201:
 *         description: Request submitted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Thank you for requesting clinic setup. We will contact you soon." }
 *       422:
 *         description: "Validation errors. Same shape as ValidationErrorResponse, but at HTTP 422 (a deliberate deviation from the dominant 403) - see ValidationErrorResponse for the errors array shape."
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
  const body = await req.json().catch(() => ({}));
  const { full_name, email, phone, city, budget, remarks } = body as {
    full_name?: string;
    email?: string;
    phone?: string;
    city?: string;
    budget?: string;
    remarks?: string;
  };

  const fieldErrors: Record<string, string> = {};
  if (!full_name) fieldErrors.full_name = "The full name field is required.";
  else if (full_name.length > 255) fieldErrors.full_name = "The full name field must not be greater than 255 characters.";
  if (!email) fieldErrors.email = "The email field is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "The email field must be a valid email address.";
  if (!phone) fieldErrors.phone = "The phone field is required.";
  else if (phone.length > 20) fieldErrors.phone = "The phone field must not be greater than 20 characters.";

  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors, 422);
  }

  try {
    await prisma.clinic_setup_requests.create({
      data: {
        full_name: full_name as string,
        email: email as string,
        phone: phone as string,
        city: city || null,
        budget: budget || null,
        remarks: remarks || null,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });
    return successResponse("Thank you for requesting clinic setup. We will contact you soon.", {}, 201);
  } catch (error) {
    console.error("Exception occurred while requesting clinic setup", error);
    return serverErrorResponse("Failed to request clinic setup.", error);
  }
}
