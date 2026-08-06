import { NextRequest, NextResponse } from "next/server";

// Ports gargnew's app/api/google-auth/route.js: proxies the storefront's Google login button
// (components/GoogleLogin.js) to the already-built, mobile-compatible
// /api/v1/auth/social/google-register endpoint.
/**
 * @swagger
 * /api/google-auth:
 *   post:
 *     summary: Proxy for the storefront's Google login button - forwards the request body verbatim to /api/v1/auth/social/google-register
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, unique_id, access_token]
 *             properties:
 *               token: { type: string, description: "Google id_token, or access_token when access_token is \"1\"" }
 *               unique_id: { type: string, description: "Google account unique id" }
 *               access_token: { type: string, description: "Pass \"1\" to treat `token` as a Google OAuth access token instead of an id_token" }
 *               phone: { type: string, description: "Optional phone number for a newly created account" }
 *     responses:
 *       200:
 *         description: Whatever status/body /api/v1/auth/social/google-register returned is relayed as-is (typically 200 on success, 403 on validation/invalid Google token errors).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Relayed response body from /api/v1/auth/social/google-register.
 *       500:
 *         description: The proxy request to /api/v1/auth/social/google-register itself failed (network error, etc).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       message: { type: string, example: "Failed to authenticate." }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const backendRes = await fetch(new URL("/api/v1/auth/social/google-register", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch {
    return NextResponse.json({ success: false, errors: [{ message: "Failed to authenticate." }] }, { status: 500 });
  }
}
