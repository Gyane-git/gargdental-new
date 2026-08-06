import { NextRequest, NextResponse } from "next/server";

// Ports gargnew's app/api/auth/set-token/route.js. Persists the JWT /api/v1/auth/login returns
// into an httpOnly "token" cookie - without this route, the storefront's apiRequest() (which
// authenticates purely via credentials:"include", never an Authorization header) has no way to
// send the token on any subsequent request, and every /customer/** call 401s. Same cookie
// name/JWT secret as admin auth (lib/adminAuth.ts) - customer tokens simply carry no `type` claim.
/**
 * @swagger
 * /api/auth/set-token:
 *   post:
 *     summary: Persist a JWT (from /api/v1/auth/login) into an httpOnly token cookie for the web storefront
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: "JWT returned by /api/v1/auth/login or /api/v1/register" }
 *     responses:
 *       200:
 *         description: Token cookie set successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Token set successfully" }
 *       400:
 *         description: Token missing from request body, or the request body could not be parsed as JSON.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Token missing" }
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ message: "Token missing" }, { status: 400 });
    }

    const response = NextResponse.json({ message: "Token set successfully" });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ message: "Invalid request" }, { status: 400 });
  }
}
