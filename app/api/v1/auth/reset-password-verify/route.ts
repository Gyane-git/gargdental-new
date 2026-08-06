import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { validationErrorResponse, successResponse } from "@/lib/apiResponse";
import { sendPasswordResetSuccessEmail } from "@/lib/mailer";
import { nowForDb } from "@/lib/dbTime";

// Ports AuthController::reset_password_verify (AuthController.php:204-255).
/**
 * @swagger
 * /api/v1/auth/reset-password-verify:
 *   post:
 *     summary: Verify a password reset code and set the new password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, reset_code, new_password, confirm_new_password]
 *             properties:
 *               email: { type: string, format: email }
 *               reset_code: { type: string, description: "6-digit code sent by /api/v1/auth/forgot-password-code" }
 *               new_password: { type: string, format: password, description: "Minimum 6 characters" }
 *               confirm_new_password: { type: string, format: password, description: "Must match new_password" }
 *     responses:
 *       200:
 *         description: Password reset successfully. If the confirmation email failed to send, an additional `email_error` field is included but the reset itself still succeeded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Password reset successful." }
 *                 email_error: { type: string, description: "Present only if the confirmation email failed to send" }
 *       400:
 *         description: The reset_code does not match any record for this email, or has expired.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid or expired reset code." }
 *       403:
 *         description: Validation errors, including when email does not match an existing user (treated as a validation error here, not a 404).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, reset_code, new_password, confirm_new_password } = body as {
    email?: string;
    reset_code?: string;
    new_password?: string;
    confirm_new_password?: string;
  };

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "The email field is required.";
  if (!reset_code) fieldErrors.reset_code = "The reset code field is required.";
  if (!new_password) fieldErrors.new_password = "The new password field is required.";
  else if (new_password.length < 6) fieldErrors.new_password = "The new password field must be at least 6 characters.";
  if (!confirm_new_password) fieldErrors.confirm_new_password = "The confirm new password field is required.";
  else if (confirm_new_password !== new_password) fieldErrors.confirm_new_password = "The confirm new password field must match new password.";

  // Laravel's `email => required|exists:users,email` bakes the existence check into
  // validation itself - an unknown email is a 403 validation error here, NOT a 404
  // (unlike forgot-password-code, which checks existence separately after validation passes).
  const user = email ? await prisma.users.findUnique({ where: { email } }) : null;
  if (email && !user) {
    fieldErrors.email = "The selected email is invalid.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  const tokenData = await prisma.password_reset_tokens.findFirst({
    where: { email: email as string, token: reset_code as string },
  });

  if (!tokenData) {
    return NextResponse.json({ success: false, message: "Invalid or expired reset code." }, { status: 400 });
  }

  const hashed = await bcrypt.hash(new_password as string, 10);
  await prisma.users.update({ where: { email: email as string }, data: { password: hashed, updated_at: nowForDb() } });
  await prisma.password_reset_tokens.deleteMany({ where: { email: email as string, token: reset_code as string } });

  try {
    await sendPasswordResetSuccessEmail(email as string);
    return successResponse("Password reset successful.");
  } catch (error) {
    console.error("Password reset mail failed", error);
    return successResponse("Password reset successful, but failed to send confirmation email.", {
      email_error: error instanceof Error ? error.message : String(error),
    });
  }
}
