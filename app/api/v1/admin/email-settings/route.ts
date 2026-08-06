import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getEmailSettingsMasked, saveEmailSettings } from "@/lib/emailSettings";

// Lets admins configure SMTP (app/admin/email-settings/page.js) instead of editing .env - see
// lib/emailSettings.ts for where this is actually stored, and lib/mailer.ts for how every email
// the app sends picks it up dynamically.
/**
 * @swagger
 * /api/v1/admin/email-settings:
 *   get:
 *     summary: Get the current SMTP configuration (admin token)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current settings, or null if none have been saved yet (the app is still running on .env's MAIL_* vars). Password is masked, never returned in the clear.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 settings:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     host: { type: string }
 *                     port: { type: integer }
 *                     username: { type: string }
 *                     password: { type: string, example: "********" }
 *                     encryption: { type: string, enum: [ssl, tls, none] }
 *                     from_name: { type: string }
 *                     from_address: { type: string }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 */
export async function GET(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const settings = await getEmailSettingsMasked();
  return NextResponse.json({ success: true, settings });
}

/**
 * @swagger
 * /api/v1/admin/email-settings:
 *   put:
 *     summary: Save SMTP configuration (admin token)
 *     description: Every field is optional - only fields present in the body are updated. Sending password as "********" (the masked value GET returns) or omitting it leaves the stored password untouched.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               host: { type: string }
 *               port: { type: integer }
 *               username: { type: string }
 *               password: { type: string }
 *               encryption: { type: string, enum: [ssl, tls, none] }
 *               from_name: { type: string }
 *               from_address: { type: string }
 *     responses:
 *       200:
 *         description: Settings saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Email settings saved successfully." }
 *                 settings: { type: object, description: Same shape as GET's settings, password masked. }
 *       400:
 *         description: host/username/from_address resolved to empty, or encryption isn't one of ssl/tls/none.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function PUT(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { host, port, username, password, encryption, from_name, from_address } = body as Record<string, unknown>;

    if (encryption !== undefined && !["ssl", "tls", "none"].includes(String(encryption))) {
      return NextResponse.json({ success: false, message: "Encryption must be one of ssl, tls, none." }, { status: 400 });
    }
    if (host !== undefined && !String(host).trim()) {
      return NextResponse.json({ success: false, message: "SMTP host is required." }, { status: 400 });
    }
    if (username !== undefined && !String(username).trim()) {
      return NextResponse.json({ success: false, message: "SMTP username is required." }, { status: 400 });
    }
    if (from_address !== undefined && from_address !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(from_address))) {
      return NextResponse.json({ success: false, message: "Sender email must be a valid email address." }, { status: 400 });
    }

    const settings = await saveEmailSettings({
      host: host as string | undefined,
      port: port !== undefined ? Number(port) : undefined,
      username: username as string | undefined,
      password: password as string | undefined,
      encryption: encryption as "ssl" | "tls" | "none" | undefined,
      from_name: from_name as string | undefined,
      from_address: from_address as string | undefined,
    });

    return NextResponse.json({ success: true, message: "Email settings saved successfully.", settings });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
