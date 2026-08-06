import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { sendVerificationCodeEmail } from "@/lib/mailer";
import { nowForDb } from "@/lib/dbTime";

// Ports RegistrationController::ResendCode (RegistrationController.php:228-278). Note: unlike
// verify-account, an unknown email does NOT 404 here - it silently falls through and still
// attempts to generate/send a code (matches Laravel's `if (isset($user))` guarding only the
// already-verified short-circuit, not existence itself).
/**
 * @swagger
 * /api/v1/resend-code:
 *   post:
 *     summary: Resend the email verification code for a given email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Either the email is already verified, or a new verification code was generated and emailed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Verification code sent successfully." }
 *                 email: { type: string, description: "Present only when a code was (re)sent" }
 *                 code: { type: integer, description: "Present only when a code was (re)sent" }
 *       403:
 *         description: Validation errors (missing/invalid email).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       500:
 *         description: Unexpected server error (e.g. failed to send email).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email } = body as { email?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return validationErrorResponse({ email: "The email field is required and must be a valid email address." });
  }

  const user = await prisma.users.findUnique({ where: { email } });
  if (user && user.is_email_verified) {
    return successResponse("Email already verified.");
  }

  const code = Math.floor(100000 + Math.random() * 900000);
  const existingVerification = await prisma.email_verifications.findFirst({ where: { email } });
  if (existingVerification) {
    await prisma.email_verifications.update({
      where: { id: existingVerification.id },
      data: { token: String(code), updated_at: nowForDb() },
    });
  } else {
    await prisma.email_verifications.create({
      data: { email, token: String(code), created_at: nowForDb(), updated_at: nowForDb() },
    });
  }

  try {
    await sendVerificationCodeEmail(email, code);
    return successResponse("Verification code sent successfully.", { email, code });
  } catch (error) {
    console.error("Exception occurred while sending code", error);
    return serverErrorResponse("Failed to send verification code.", error);
  }
}
