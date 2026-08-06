import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getEmailSettings } from "@/lib/emailSettings";
import { sendMailWithConfig } from "@/lib/mailer";

// Backs the "Send Test Email" button on app/admin/email-settings/page.js. Sends using whatever
// is currently typed into the form - NOT what's saved in the DB - so an admin can verify new
// settings actually work before persisting them (and overwriting a config that was working).
/**
 * @swagger
 * /api/v1/admin/email-settings/test:
 *   post:
 *     summary: Send a test email using the given (not necessarily saved) SMTP settings (admin token)
 *     description: If password is omitted or sent as the "********" mask, the currently-saved password is used instead (so testing an unrelated field change doesn't require re-entering the password).
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, host, username]
 *             properties:
 *               to: { type: string, format: email, description: "Recipient for the test email." }
 *               host: { type: string }
 *               port: { type: integer }
 *               username: { type: string }
 *               password: { type: string }
 *               encryption: { type: string, enum: [ssl, tls, none] }
 *               from_name: { type: string }
 *               from_address: { type: string }
 *     responses:
 *       200:
 *         description: Test email sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Test email sent successfully." }
 *       400:
 *         description: Missing required field, or no password available (nothing saved yet and none provided).
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
 *       502:
 *         description: SMTP server rejected the connection/authentication/send - message carries the raw SMTP error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 */
export async function POST(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { to, host, port, username, password, encryption, from_name, from_address } = body as Record<string, unknown>;

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
    return NextResponse.json({ success: false, message: "A valid recipient email is required." }, { status: 400 });
  }
  if (!host || !String(host).trim()) {
    return NextResponse.json({ success: false, message: "SMTP host is required." }, { status: 400 });
  }
  if (!username || !String(username).trim()) {
    return NextResponse.json({ success: false, message: "SMTP username is required." }, { status: 400 });
  }

  let resolvedPassword = String(password || "");
  if (!resolvedPassword || resolvedPassword === "********") {
    const saved = await getEmailSettings();
    resolvedPassword = saved?.password || "";
  }
  if (!resolvedPassword) {
    return NextResponse.json({ success: false, message: "Password is required to send a test email." }, { status: 400 });
  }

  const fromAddress = String(from_address || username).trim();

  try {
    await sendMailWithConfig(
      {
        host: String(host).trim(),
        port: Number(port || 465),
        user: String(username).trim(),
        pass: resolvedPassword,
        encryption: (encryption as "ssl" | "tls" | "none") || "ssl",
        fromAddress,
        fromName: String(from_name || "Garg Dental").trim(),
      },
      {
        to: String(to),
        subject: "Garg Dental SMTP test email",
        text: "This is a test email confirming your SMTP settings are working correctly.",
        html: `<div style="font-family:Arial,sans-serif;color:#111827"><h2 style="color:#0072bc">SMTP Test Successful</h2><p>This is a test email confirming your SMTP settings are working correctly.</p></div>`,
      },
    );

    return NextResponse.json({ success: true, message: "Test email sent successfully." });
  } catch (error) {
    console.error("Test email failed", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to send test email." }, { status: 502 });
  }
}
