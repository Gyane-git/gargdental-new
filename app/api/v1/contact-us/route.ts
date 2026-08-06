import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { nowForDb } from "@/lib/dbTime";
import { getSystemSettingValue } from "@/lib/orderHelpers";
import { sendContactFormAckEmail, sendContactFormNotificationEmail } from "@/lib/mailer";

// Ports RegistrationController::ContactForm (RegistrationController.php:372-404).
/**
 * @swagger
 * /api/v1/contact-us:
 *   post:
 *     summary: Submit a public contact-us message
 *     tags: [ContactUs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, message]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               message: { type: string }
 *     responses:
 *       200:
 *         description: Message submitted successfully; stored as an `inquiries` row (subject left null).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Thank you for contacting us. We will respond you shortly." }
 *       403:
 *         description: Validation errors.
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
  const { name, email, message } = body as { name?: string; email?: string; message?: string };

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "The name field is required.";
  if (!email) fieldErrors.email = "The email field is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "The email field must be a valid email address.";
  if (!message) fieldErrors.message = "The message field is required.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    await prisma.inquiries.create({
      data: {
        name: name as string,
        email: email as string,
        message: message as string,
        created_at: nowForDb(),
        updated_at: nowForDb(),
      },
    });

    sendContactFormAckEmail(email as string, name as string).catch((error) =>
      console.error("Failed to send contact form acknowledgement email", error),
    );
    getSystemSettingValue("primary_email")
      .then((adminEmail) => {
        if (adminEmail) {
          return sendContactFormNotificationEmail(adminEmail, { name: name as string, email: email as string, message: message as string });
        }
      })
      .catch((error) => console.error("Failed to send contact form admin notification email", error));

    return successResponse("Thank you for contacting us. We will respond you shortly.");
  } catch (error) {
    console.error("Exception occurred while submitting inquiry", error);
    return serverErrorResponse("Failed to submit inquiry.", error);
  }
}
