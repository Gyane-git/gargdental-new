import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { sendPasswordResetCodeEmail } from "@/lib/mailer";
import { nowForDb } from "@/lib/dbTime";

// Ports AuthController::forgot_password_code (AuthController.php:124-171).
/**
 * @swagger
 * /api/v1/auth/forgot-password-code:
 *   post:
 *     summary: Send a 6-digit password reset code to the given email
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
 *         description: Password reset code generated and emailed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Password reset code sent successfully." }
 *                 email: { type: string, example: "user@example.com" }
 *                 code: { type: integer, example: 123456, description: "6-digit reset code (also emailed to the user)" }
 *       403:
 *         description: Validation errors (missing/invalid email).
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
  if (!user) {
    return NextResponse.json({ success: false, message: "Email not found." }, { status: 404 });
  }

  const code = Math.floor(100000 + Math.random() * 900000);
  await prisma.password_reset_tokens.upsert({
    where: { email: user.email },
    update: { token: String(code), created_at: nowForDb() },
    create: { email: user.email, token: String(code), created_at: nowForDb() },
  });

  try {
    await sendPasswordResetCodeEmail(user.email, code, user.full_name);
    return successResponse("Password reset code sent successfully.", { email: user.email, code });
  } catch (error) {
    console.error("Exception occurred while sending code", error);
    return serverErrorResponse("Failed to send password reset code.", error);
  }
}
