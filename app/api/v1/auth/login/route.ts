import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signAuthToken, comparePassword } from "@/lib/auth";
import { successResponse, validationErrorResponse } from "@/lib/apiResponse";

// Ports AuthController::login (gargdental app/Http/Controllers/API/V1/AuthController.php:57-91)
// exactly. Note there is NO account-status or email-verification check here in Laravel - only
// email+password. Do not add one (a prior Next.js attempt invented that check and it was wrong).
/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Authenticate a customer by email/password and issue a bearer token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Login successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Login successful" }
 *                 requires_address: { type: boolean, description: "True when the customer has no saved address yet" }
 *                 token: { type: string, description: "Bearer token to send as Authorization: Bearer <token> on subsequent requests" }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     email: { type: string }
 *       401:
 *         description: Invalid email or password.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid credentials" }
 *       403:
 *         description: Validation errors (missing/invalid email or missing password).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "The email field is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "The email field must be a valid email address.";
  if (!password) fieldErrors.password = "The password field is required.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  const user = await prisma.users.findUnique({ where: { email: email as string } });
  const passwordMatches = user ? await comparePassword(password as string, user.password) : false;

  if (!user || !passwordMatches) {
    return NextResponse.json({ success: false, message: "Invalid credentials" }, { status: 401 });
  }

  const token = signAuthToken(user.id);
  const addressExists = (await prisma.customer_address_book.count({ where: { customer_id: user.id } })) > 0;

  return successResponse("Login successful", {
    requires_address: !addressExists,
    token,
    user: { id: Number(user.id), name: user.full_name, email: user.email },
  });
}
