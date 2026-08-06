import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signAuthToken } from "@/lib/auth";
import { validationErrorResponse, successResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";

// Ports SocialAuthController::google_register (SocialAuthController.php:55-127).
/**
 * @swagger
 * /api/v1/auth/social/google-register:
 *   post:
 *     summary: Register or log in a customer via Google Sign-In, issuing a bearer token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, unique_id, access_token]
 *             properties:
 *               token: { type: string, description: "Google id_token, or OAuth access token when access_token is \"1\"" }
 *               unique_id: { type: string, description: "Google account unique id" }
 *               access_token: { type: string, description: "Pass \"1\" to verify `token` against Google's tokeninfo/userinfo access-token endpoint instead of the id_token endpoint" }
 *               phone: { type: string, description: "Optional phone number, used only when creating a new account" }
 *     responses:
 *       200:
 *         description: Login/registration successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Login successful" }
 *                 requires_address: { type: boolean }
 *                 token: { type: string, description: "Bearer token for subsequent requests" }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     name: { type: string }
 *                     email: { type: string }
 *       403:
 *         description: Validation errors, or the Google token could not be verified (invalid/expired Google token).
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/ValidationErrorResponse'
 *                 - type: object
 *                   properties:
 *                     success: { type: boolean, example: false }
 *                     error: { type: string, example: "Invalid Google token" }
 *                     message: { type: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { token, unique_id, access_token, phone } = body as {
    token?: string;
    unique_id?: string;
    access_token?: string | number;
    phone?: string;
  };

  const fieldErrors: Record<string, string> = {};
  if (!token) fieldErrors.token = "The token field is required.";
  if (!unique_id) fieldErrors.unique_id = "The unique id field is required.";
  if (access_token === undefined || access_token === null || access_token === "") {
    fieldErrors.access_token = "The access token field is required.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  let googleData: Record<string, unknown>;
  try {
    const url =
      String(access_token) === "1"
        ? `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(String(token))}`
        : `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${encodeURIComponent(String(token))}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google responded with ${res.status}`);
    googleData = await res.json();
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid Google token",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 403 },
    );
  }

  const name = (googleData.name as string) || "Google User";
  const email = googleData.email as string;
  const socialId = (googleData.kid as string) || (googleData.sub as string);

  let user = await prisma.users.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.users.create({
      data: {
        full_name: name,
        email,
        is_email_verified: true,
        email_verified_at: nowForDb(),
        phone: phone || null,
        password: await bcrypt.hash(socialId, 10),
        login_medium: "google",
        social_id: socialId,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });
  } else {
    user = await prisma.users.update({ where: { email }, data: { social_id: socialId, updated_at: nowForDb() } });
  }

  const authToken = signAuthToken(user.id);
  const addressExists = (await prisma.customer_address_book.count({ where: { customer_id: user.id } })) > 0;

  return successResponse("Login successful", {
    requires_address: !addressExists,
    token: authToken,
    user: { id: Number(user.id), name: user.full_name, email: user.email },
  });
}
