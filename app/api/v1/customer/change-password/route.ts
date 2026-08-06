import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports CustomerController::change_password (CustomerController.php:155-180).
/**
 * @swagger
 * /api/v1/customer/change-password:
 *   post:
 *     summary: Change the authenticated customer's password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [new_password, new_password_confirmation]
 *             properties:
 *               new_password: { type: string, format: password, description: "Minimum 8 characters" }
 *               new_password_confirmation: { type: string, format: password, description: "Must match new_password" }
 *     responses:
 *       200:
 *         description: Password successfully updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Password successfully updated." }
 *       401:
 *         description: Missing/invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: Validation errors (missing/short new_password, mismatched confirmation, or missing confirmation).
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
  const { new_password, new_password_confirmation } = body as {
    new_password?: string;
    new_password_confirmation?: string;
  };

  const fieldErrors: Record<string, string> = {};
  if (!new_password) fieldErrors.new_password = "The new password field is required.";
  else if (new_password.length < 8) fieldErrors.new_password = "The new password field must be at least 8 characters.";
  else if (new_password !== new_password_confirmation) {
    fieldErrors.new_password = "The new password field confirmation does not match.";
  }
  if (!new_password_confirmation) fieldErrors.new_password_confirmation = "The new password confirmation field is required.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    await prisma.users.update({
      where: { id: auth.id },
      data: { password: await bcrypt.hash(new_password as string, 10), updated_at: nowForDb() },
    });
    return successResponse("Password successfully updated.");
  } catch (error) {
    return serverErrorResponse("Failed to change password.", error);
  }
}
