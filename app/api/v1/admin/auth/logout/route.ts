import { NextResponse } from "next/server";

// Ports gargnew's app/api/v1/admin/auth/logout/route.js exactly.
/**
 * @swagger
 * /api/v1/admin/auth/logout:
 *   post:
 *     summary: Log out the admin session by clearing the httpOnly token cookie
 *     tags: [AdminAuth]
 *     responses:
 *       200:
 *         description: Logged out successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Logged out successfully" }
 */
export async function POST() {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" });

  response.cookies.set("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });

  return response;
}
