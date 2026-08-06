import { prisma } from "@/lib/prisma";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";

// Admin listing, ported from gargnew's app/api/v1/newsletter-subscriber/route.js GET. gargnew's
// table has a `status` column that doesn't exist on this project's real `newsletter_subscribers_list`
// table (id, email, created_at, updated_at only) - dropped from the response, not faked.
/**
 * @swagger
 * /api/v1/newsletter-subscriber:
 *   get:
 *     summary: List all newsletter subscribers (admin panel)
 *     tags: [Newsletter]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscribers fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 newsletter_subscribers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: newsletter_subscribers_list row (id, email, created_at, updated_at).
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Server error" }
 */
export async function GET(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const rows = await prisma.newsletter_subscribers_list.findMany({ orderBy: { id: "desc" } });
    return NextResponse.json({ success: true, newsletter_subscribers: rows });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
}

// Ports RegistrationController::NewsletterSubscriber (RegistrationController.php:308-340).
/**
 * @swagger
 * /api/v1/newsletter-subscriber:
 *   post:
 *     summary: Subscribe an email address to the newsletter
 *     tags: [Newsletter]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, example: "jane@example.com" }
 *     responses:
 *       200:
 *         description: Subscribed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Thank you for your subscription." }
 *       403:
 *         description: Validation errors (missing/invalid email, or already subscribed).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email } = body as { email?: string };

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "Please enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Please provide a valid email address.";
  else if (await prisma.newsletter_subscribers_list.findUnique({ where: { email } })) {
    fieldErrors.email = "This email is already subscribed.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    await prisma.newsletter_subscribers_list.create({
      data: { email: email as string, created_at: nowForDb(), updated_at: nowForDb() },
    });
    return successResponse("Thank you for your subscription.");
  } catch (error) {
    console.error("Exception occurred while subscribing newsletter", error);
    return serverErrorResponse("Failed to subscribe newsletter.", error);
  }
}
