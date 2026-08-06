import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { comparePassword } from "@/lib/auth";
import { nowForDb } from "@/lib/dbTime";

async function buildResponse(adminId: number) {
  const admin = await prisma.admins.findUnique({ where: { id: adminId } });
  if (!admin) return null;
  const role = await prisma.admin_roles.findUnique({ where: { id: BigInt(admin.role_id) } });
  const roleName = role?.name || admin.account_type || "Staff";
  return {
    id: admin.id,
    full_name: admin.name,
    name: admin.name,
    email: admin.email,
    phone: admin.phone || "",
    address: admin.address || "",
    country: admin.country || "",
    profile_photo_path: admin.profile_photo_path,
    image_full_url: admin.profile_photo_path ? `/storage/admin-profiles/${admin.profile_photo_path}` : null,
    role_id: admin.role_id,
    accountType: roleName,
    role: roleName,
    status: 1,
  };
}

// Ports gargnew's app/api/v1/admin/profile/route.js against the real admins schema (no
// `status` column exists - the inactive-account check gargnew has is dropped, same as login).
/**
 * @swagger
 * /api/v1/admin/profile:
 *   get:
 *     summary: Get the authenticated admin's own profile (admin token)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 admin:
 *                   type: object
 *                   description: Admin profile (id, full_name, name, email, phone, address, country, profile_photo_path, image_full_url, role_id, accountType, role, status).
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 */
export async function GET(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  const admin = await buildResponse(authUser.id);
  if (!admin) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }
  return NextResponse.json({ success: true, admin });
}

/**
 * @swagger
 * /api/v1/admin/profile:
 *   patch:
 *     summary: Update the authenticated admin's profile, or change their password (admin token)
 *     description: >
 *       Accepts either application/json or multipart/form-data (required when uploading a
 *       profile_photo). Set action=password to change the password instead of profile fields;
 *       any other/omitted action updates full_name/email/phone/address/country/profile_photo.
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
 *               action: { type: string, enum: [profile, password], description: "Defaults to profile." }
 *               full_name: { type: string, description: "Alias: fullName. Required for action=profile." }
 *               email: { type: string, description: Required for action=profile. }
 *               phone: { type: string, description: Required for action=profile. }
 *               address: { type: string }
 *               country: { type: string }
 *               current_password: { type: string, description: "Alias: currentPassword. Required for action=password." }
 *               new_password: { type: string, description: "Alias: newPassword. Required for action=password." }
 *               confirm_password: { type: string, description: "Aliases: renewPassword, confirmPassword. Required for action=password." }
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               action: { type: string, enum: [profile, password] }
 *               full_name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               address: { type: string }
 *               country: { type: string }
 *               profile_photo:
 *                 type: string
 *                 format: binary
 *                 description: "Alias: profilePhoto."
 *     responses:
 *       200:
 *         description: Profile updated, or password changed, successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 admin:
 *                   type: object
 *                   description: Present for profile updates (not password changes). Same shape as GET's admin object.
 *       400:
 *         description: Missing required fields, password mismatch, or wrong current password.
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
 *       409:
 *         description: Email is already in use by another admin.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Email is already in use by another admin." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function PATCH(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const current = await prisma.admins.findUnique({ where: { id: authUser.id } });
    if (!current) {
      return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    const isFormData = contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded");
    const payload: FormData | Record<string, unknown> = isFormData ? await request.formData() : await request.json();
    const getValue = (key: string) =>
      typeof (payload as FormData).get === "function" ? (payload as FormData).get(key) : (payload as Record<string, unknown>)[key];

    const action = String(getValue("action") || "profile").toLowerCase();

    if (action === "password") {
      const currentPassword = String(getValue("current_password") || getValue("currentPassword") || "");
      const newPassword = String(getValue("new_password") || getValue("newPassword") || "");
      const confirmPassword = String(getValue("confirm_password") || getValue("renewPassword") || getValue("confirmPassword") || "");

      if (!currentPassword || !newPassword || !confirmPassword) {
        return NextResponse.json({ success: false, message: "Current password, new password and confirmation are required." }, { status: 400 });
      }
      if (newPassword !== confirmPassword) {
        return NextResponse.json({ success: false, message: "Passwords do not match." }, { status: 400 });
      }

      const isMatch = await comparePassword(currentPassword, current.password);
      if (!isMatch) {
        return NextResponse.json({ success: false, message: "Current password is incorrect." }, { status: 400 });
      }

      await prisma.admins.update({
        where: { id: authUser.id },
        data: { password: await bcrypt.hash(newPassword, 10), updated_at: nowForDb() },
      });

      return NextResponse.json({ success: true, message: "Password changed successfully." });
    }

    const fullName = String(getValue("full_name") || getValue("fullName") || "").trim();
    const email = String(getValue("email") || "").trim().toLowerCase();
    const phone = String(getValue("phone") || "").trim();
    const address = String(getValue("address") || "").trim();
    const country = String(getValue("country") || "").trim();
    const profilePhotoFile = getValue("profile_photo") || getValue("profilePhoto");

    if (!fullName || !email || !phone) {
      return NextResponse.json({ success: false, message: "Full name, email and phone are required." }, { status: 400 });
    }

    const duplicate = await prisma.admins.findFirst({ where: { email, id: { not: authUser.id } } });
    if (duplicate) {
      return NextResponse.json({ success: false, message: "Email is already in use by another admin." }, { status: 409 });
    }

    let nextProfilePhotoPath = current.profile_photo_path;
    if (profilePhotoFile && typeof profilePhotoFile === "object" && "size" in profilePhotoFile && (profilePhotoFile as File).size > 0) {
      const file = profilePhotoFile as File;
      const dir = path.join(mediaStoragePath(), "admin-profiles");
      await mkdir(dir, { recursive: true });
      const extension = path.extname(file.name || "") || ".png";
      const fileName = `${randomUUID()}${extension}`;
      await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));
      nextProfilePhotoPath = fileName;
    }

    await prisma.admins.update({
      where: { id: authUser.id },
      data: {
        name: fullName,
        email,
        phone,
        address: address || null,
        country: country || null,
        profile_photo_path: nextProfilePhotoPath,
        updated_at: nowForDb(),
      },
    });

    const admin = await buildResponse(authUser.id);
    return NextResponse.json({ success: true, message: "Profile updated successfully.", admin });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
