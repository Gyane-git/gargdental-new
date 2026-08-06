import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { requireAdminAuth } from "@/lib/adminAuth";
import { upsertCompliance } from "@/lib/complianceHelpers";

const CLINIC_KEYS = ["clinic_cover_image", "clinic_video_title", "clinic_video_link", "clinic_video_description"];

// Ports ClinicController::get_clinic_setup (ClinicController.php:38-67). The clinic_cover_image
// entry gets its `value` overwritten with a full URL (matching the controller's manual override)
// plus a duplicate `clinic_cover_image_full_url` field (Compliance.php's conditional append on
// static::retrieved, ClinicController.php:113-116).
/**
 * @swagger
 * /api/v1/clinic/clinic-setup:
 *   get:
 *     summary: Get the public clinic-setup content (cover image + video) keyed by compliances key
 *     tags: [Clinic]
 *     responses:
 *       200:
 *         description: Clinic setup fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Clinic setup fetched successfully." }
 *                 clinic:
 *                   type: object
 *                   description: "Keyed by clinic_cover_image, clinic_video_title, clinic_video_link, clinic_video_description. Each value is { id, key, value, created_at, updated_at, files_full_url }; clinic_cover_image's `value` is a full asset URL and additionally carries `clinic_cover_image_full_url` with the same URL."
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET() {
  try {
    const rows = await prisma.compliances.findMany({ where: { key: { in: CLINIC_KEYS } } });

    const clinic: Record<string, unknown> = {};
    for (const row of rows) {
      const key = row.key as string; // filtered to CLINIC_KEYS above, never null here
      const base = {
        id: Number(row.id),
        key: row.key,
        value: row.value,
        created_at: row.created_at,
        updated_at: row.updated_at,
        files_full_url: [] as string[],
      };

      if (key === "clinic_cover_image") {
        const fullUrl = row.value ? assetUrl(row.value, "backend/clinic") : null;
        clinic[key] = { ...base, value: fullUrl, clinic_cover_image_full_url: fullUrl };
      } else {
        clinic[key] = base;
      }
    }

    return successResponse("Clinic setup fetched successfully.", { clinic });
  } catch (error) {
    console.error("Exception occurred while fetching clinic setup", error);
    return serverErrorResponse("Failed to get clinic setup", error);
  }
}

// Ports gargnew's admin clinic-setup save (app/api/v1/clinic/clinic-setup/route.js POST),
// adapted to write into the same `compliances` key/value rows the GET above reads (gargnew's
// own clinic_setup_settings table doesn't exist here - the real Laravel-backed data model for
// this feature is compliances, as already established by ClinicController::get_clinic_setup).
/**
 * @swagger
 * /api/v1/clinic/clinic-setup:
 *   post:
 *     summary: Save clinic-setup content - cover image and video fields (admin panel)
 *     tags: [Clinic]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               clinic_video_title: { type: string }
 *               clinic_video_link: { type: string }
 *               clinic_video_description: { type: string }
 *               clinic_cover_image: { type: string, format: binary, description: "Only saved to disk (into backend/clinic) when a non-empty file is sent." }
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               clinic_video_title: { type: string }
 *               clinic_video_link: { type: string }
 *               clinic_video_description: { type: string }
 *               clinic_cover_image: { type: string, description: "Already-stored filename/path, used verbatim (no upload) for this content type." }
 *     responses:
 *       200:
 *         description: Clinic setup saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Clinic setup saved successfully." }
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
 *                 message: { type: string, example: "Internal server error." }
 */
export async function POST(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let title = "";
    let link = "";
    let description = "";
    let imageValue: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      title = String(formData.get("clinic_video_title") || "").trim();
      link = String(formData.get("clinic_video_link") || "").trim();
      description = String(formData.get("clinic_video_description") || "").trim();
      const coverImage = formData.get("clinic_cover_image");

      if (coverImage instanceof File && coverImage.size > 0) {
        const dir = path.join(mediaStoragePath(), "backend/clinic");
        await mkdir(dir, { recursive: true });
        const safeName = `${Date.now()}-${coverImage.name.replace(/\s+/g, "_")}`;
        await writeFile(path.join(dir, safeName), Buffer.from(await coverImage.arrayBuffer()));
        imageValue = safeName;
      }
    } else {
      const body = await req.json();
      title = String(body.clinic_video_title || "").trim();
      link = String(body.clinic_video_link || "").trim();
      description = String(body.clinic_video_description || "").trim();
      imageValue = body.clinic_cover_image ? String(body.clinic_cover_image).trim() : null;
    }

    await upsertCompliance("clinic_video_title", title);
    await upsertCompliance("clinic_video_link", link);
    await upsertCompliance("clinic_video_description", description);
    if (imageValue) {
      await upsertCompliance("clinic_cover_image", imageValue);
    }

    return NextResponse.json({ success: true, message: "Clinic setup saved successfully." });
  } catch (error) {
    console.error("POST CLINIC SETUP ERROR:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
