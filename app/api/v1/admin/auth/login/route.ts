import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword } from "@/lib/auth";
import { signAdminToken, type AdminTokenPayload } from "@/lib/adminAuth";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Ports gargnew's app/api/v1/admin/auth/login/route.js, adapted to the real admins/admin_roles
// schema (see lib/adminAuth.ts's top comment) and Prisma instead of raw mysql2. No `status`
// column exists on `admins` here, so the "inactive account" check gargnew has is dropped -
// there's nothing to check.
/**
 * @swagger
 * /api/v1/admin/auth/login:
 *   post:
 *     summary: Authenticate an admin by email/password and issue an admin bearer token
 *     tags: [AdminAuth]
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
 *         description: Login successful. Also sets an httpOnly `token` cookie for the admin panel, in addition to returning the token in the body for API/mobile use.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Login successful." }
 *                 token: { type: string, description: "Admin bearer token, distinct from a customer token - not accepted by customer-only endpoints" }
 *                 admin:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     full_name: { type: string }
 *                     email: { type: string }
 *                     phone: { type: string, nullable: true }
 *                     role: { type: string }
 *                     role_id: { type: integer }
 *                     permissions: { type: string, description: "JSON-encoded array of permission strings" }
 *       400:
 *         description: Email or password missing from request body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Email and password are required." }
 *       401:
 *         description: No admin found with the given email, or the password did not match.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid email or password." }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(String((body as { email?: string }).email || ""));
  const password = String((body as { password?: string }).password || "");

  if (!email || !password) {
    return NextResponse.json({ success: false, message: "Email and password are required." }, { status: 400 });
  }

  const admin = await prisma.admins.findFirst({ where: { email } });
  if (!admin) {
    return NextResponse.json({ success: false, message: "Invalid email or password." }, { status: 401 });
  }

  const isMatch = await comparePassword(password, admin.password);
  if (!isMatch) {
    return NextResponse.json({ success: false, message: "Invalid email or password." }, { status: 401 });
  }

  const role = await prisma.admin_roles.findUnique({ where: { id: BigInt(admin.role_id) } });
  const roleName = role?.name || admin.account_type || "Staff";

  const tokenPayload: AdminTokenPayload = {
    id: admin.id,
    full_name: admin.name,
    email: admin.email,
    phone: admin.phone,
    role: roleName,
    role_id: admin.role_id,
    permissions: role?.modules || "",
    type: "admin",
  };

  const token = signAdminToken(tokenPayload);

  const response = NextResponse.json({
    success: true,
    message: "Login successful.",
    token,
    admin: tokenPayload,
  });

  response.cookies.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
