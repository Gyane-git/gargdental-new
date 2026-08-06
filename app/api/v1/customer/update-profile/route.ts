import { NextRequest } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { validationErrorResponse, successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { toCustomerResource } from "@/lib/customerResource";
import { nowForDb } from "@/lib/dbTime";

// Ports CustomerController::update_profile (CustomerController.php:94-121) and the
// Helpers::update()/upload() image-replace pattern it calls for profile_photo_path (a base64
// data URI, per the OpenAPI doc) - old file deleted, new one written under storage/app/public/profile.
async function saveProfilePhoto(oldPath: string | null, base64Image: string | undefined): Promise<string | null> {
  if (!base64Image) return oldPath;

  const dir = path.join(mediaStoragePath(), "profile");
  await mkdir(dir, { recursive: true });

  if (oldPath) {
    try {
      await unlink(path.join(dir, oldPath));
    } catch {
      // matches Helpers::update()'s silent catch when the old file doesn't exist
    }
  }

  const match = /^data:image\/(\w+);base64,(.+)$/.exec(base64Image);
  const format = match ? match[1] : "png";
  const data = match ? match[2] : base64Image;
  const fileName = `${new Date().toISOString().slice(0, 10)}-${Date.now()}.${format}`;
  await writeFile(path.join(dir, fileName), Buffer.from(data, "base64"));
  return fileName;
}

/**
 * @swagger
 * /api/v1/customer/update-profile:
 *   post:
 *     summary: Update the authenticated customer's full name, phone, and profile photo
 *     tags: [Customer]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name, phone]
 *             properties:
 *               full_name: { type: string, example: "Ram Sharma" }
 *               phone: { type: string, example: "9800000000" }
 *               profile_photo_path:
 *                 type: string
 *                 description: New profile photo as a base64 data URI (e.g. "data:image/png;base64,...."). Omit to keep the existing photo; when provided, the old file is deleted and this one is written under storage/app/public/profile.
 *     responses:
 *       200:
 *         description: Profile successfully updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Profile successfully updated." }
 *                 data:
 *                   type: object
 *                   description: Customer resource (lib/customerResource.ts) - id, full_name, phone, email, login_medium, image_full_url, created_at.
 *       401:
 *         description: Missing or invalid bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       403:
 *         description: Validation errors (full_name and/or phone missing).
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
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { full_name, phone, profile_photo_path } = body as {
    full_name?: string;
    phone?: string;
    profile_photo_path?: string;
  };

  const fieldErrors: Record<string, string> = {};
  if (!full_name) fieldErrors.full_name = "The full name field is required.";
  if (!phone) fieldErrors.phone = "The phone field is required.";
  if (Object.keys(fieldErrors).length > 0) {
    return validationErrorResponse(fieldErrors);
  }

  try {
    const newPhotoPath = await saveProfilePhoto(auth.profile_photo_path, profile_photo_path);
    const customer = await prisma.users.update({
      where: { id: auth.id },
      data: {
        profile_photo_path: newPhotoPath,
        full_name: full_name as string,
        phone: phone as string,
        updated_at: nowForDb(),
      },
    });

    return successResponse("Profile successfully updated.", { data: toCustomerResource(customer) });
  } catch (error) {
    return serverErrorResponse("Failed to update profile.", error);
  }
}
