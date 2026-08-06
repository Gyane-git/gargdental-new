import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationErrorResponse, successResponse } from "@/lib/apiResponse";
import { sendRegistrationSuccessEmail } from "@/lib/mailer";
import { nowForDb } from "@/lib/dbTime";

// Ports RegistrationController::VerifyAccount (RegistrationController.php:137-196).
/**
 * @swagger
 * /api/v1/verify-account:
 *   post:
 *     summary: Verify a customer's email using the code sent at registration
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, user_verification_code]
 *             properties:
 *               email: { type: string, format: email }
 *               user_verification_code: { type: string, description: "6-digit code sent by /api/v1/register or /api/v1/resend-code" }
 *     responses:
 *       200:
 *         description: Email verified successfully (or was already verified).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Thank you for verifying your email." }
 *       400:
 *         description: The verification code does not match any record for this email, or has expired.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid or expired verification code. Please try resending the code." }
 *       403:
 *         description: Validation errors (missing/invalid email or missing verification code).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       404:
 *         description: No user found with the given email.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Email not found." }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, user_verification_code } = body as { email?: string; user_verification_code?: string };

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "The email field is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "The email field must be a valid email address.";
  if (!user_verification_code) fieldErrors.user_verification_code = "The user verification code field is required.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  const user = await prisma.users.findUnique({ where: { email: email as string } });
  if (!user) {
    return NextResponse.json({ success: false, message: "Email not found." }, { status: 404 });
  }
  if (user.is_email_verified) {
    return successResponse("Email already verified.");
  }

  const verification = await prisma.email_verifications.findFirst({
    where: { email: email as string, token: user_verification_code as string },
  });
  if (!verification) {
    return NextResponse.json(
      { success: false, message: "Invalid or expired verification code. Please try resending the code." },
      { status: 400 },
    );
  }

  await prisma.email_verifications.delete({ where: { id: verification.id } });
  await prisma.users.update({
    where: { id: user.id },
    data: { is_email_verified: true, email_verified_at: nowForDb(), updated_at: nowForDb() },
  });

  try {
    await sendRegistrationSuccessEmail(email as string);
  } catch (error) {
    console.error("Verification succeeded but email failed", error);
  }

  return successResponse("Thank you for verifying your email.");
}
