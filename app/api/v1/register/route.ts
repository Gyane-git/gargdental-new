import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { sendVerificationCodeEmail } from "@/lib/mailer";
import { nowForDb } from "@/lib/dbTime";

// Ports RegistrationController::register (RegistrationController.php:57-105). Note full_name is
// firstname+lastname concatenated with NO space (`$firstname . $lastname`) - not a typo to "fix".
// phone has no validation at all (commented out in Laravel), so it's just passed through as-is.
/**
 * @swagger
 * /api/v1/register:
 *   post:
 *     summary: Register a new customer account and send an email verification code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [first_name, last_name, password, email]
 *             properties:
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               password: { type: string, format: password }
 *               email: { type: string, format: email }
 *               phone: { type: string, description: "Optional, not validated" }
 *     responses:
 *       200:
 *         description: Account created and verification code emailed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Verification code sent to your email." }
 *                 code: { type: integer, example: 123456, description: "6-digit email verification code" }
 *                 email: { type: string }
 *       403:
 *         description: Validation errors, including an already-registered email.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       500:
 *         description: Account was created but the verification email failed to send.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { first_name, last_name, password, phone, email } = body as {
    first_name?: string;
    last_name?: string;
    password?: string;
    phone?: string;
    email?: string;
  };

  const fieldErrors: Record<string, string> = {};
  if (!first_name) fieldErrors.first_name = "The first name field is required.";
  if (!last_name) fieldErrors.last_name = "The last name field is required.";
  if (!password) fieldErrors.password = "The password field is required.";
  if (!email) fieldErrors.email = "The email field is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "The email field must be a valid email address.";
  else if (await prisma.users.findUnique({ where: { email } })) {
    fieldErrors.email = "This email is already registered. Please use a different one.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  const customerName = `${first_name}${last_name}`;
  await prisma.users.create({
    data: {
      full_name: customerName,
      email: email as string,
      phone: phone || null,
      password: await bcrypt.hash(password as string, 10),
      login_medium: "manual",
      created_at: nowForDb(),
      updated_at: nowForDb(),
    },
  });

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
    await sendVerificationCodeEmail(email as string, code, customerName);
    return successResponse("Verification code sent to your email.", { code, email });
  } catch (error) {
    console.error("Exception occurred while sending code", error);
    return serverErrorResponse("Failed to send verification code.", error);
  }
}
