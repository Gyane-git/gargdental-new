import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/adminAuth";
import { assetUrl } from "@/lib/assetUrl";
import { nowForDb } from "@/lib/dbTime";

const SETTINGS_KEYS = [
  "company_name",
  "primary_email",
  "secondary_email",
  "whatsapp",
  "primary_phone",
  "secondary_phone",
  "address",
  "website_link",
  "free_shipping_option",
  "free_shipping_threshold_inside_of_valley",
  "free_shipping_threshold_out_of_valley",
  "category_display_count",
  "map_url",
  "company_logo_header",
  "company_logo_footer",
];

async function readSettings() {
  const rows = await prisma.system_settings.findMany();
  const settings: Record<string, unknown> = {};

  for (const row of rows) {
    let value: unknown = row.value;
    try {
      value = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    } catch {
      value = row.value;
    }

    if (row.key === "company_logo_header") {
      settings[row.key] = { value: value || "", header_logo_full_url: value ? assetUrl(value, "system") : null };
    } else if (row.key === "company_logo_footer") {
      settings[row.key] = { value: value || "", footer_logo_full_url: value ? assetUrl(value, "system") : null };
    } else {
      settings[row.key] = { value: value ?? "" };
    }
  }

  return settings;
}

async function upsertSetting(key: string, value: string) {
  const existing = await prisma.system_settings.findFirst({ where: { key } });
  if (existing) {
    await prisma.system_settings.update({ where: { id: existing.id }, data: { value, updated_at: nowForDb() } });
  } else {
    await prisma.system_settings.create({ data: { key, value, created_at: nowForDb(), updated_at: nowForDb() } });
  }
}

async function saveUploadedFile(file: unknown): Promise<string | null> {
  if (!file || typeof file !== "object" || !("size" in file) || !(file as File).size) return null;
  const f = file as File;
  const dir = path.join(mediaStoragePath(), "system");
  await mkdir(dir, { recursive: true });
  const extension = path.extname(f.name || "") || ".png";
  const filename = `${randomUUID()}${extension}`;
  await writeFile(path.join(dir, filename), Buffer.from(await f.arrayBuffer()));
  return filename;
}

// Ports gargnew's app/api/v1/admin/website/route.js against the real system_settings schema
// (already Laravel-native here - id/key/value/created_at/updated_at - no dynamic table creation
// needed, unlike gargnew's version which built its own copy at runtime).
/**
 * @swagger
 * /api/v1/admin/website:
 *   get:
 *     summary: Get website/company settings (admin token)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 settings:
 *                   type: object
 *                   description: >
 *                     Map keyed by setting name (company_name, primary_email, secondary_email,
 *                     whatsapp, primary_phone, secondary_phone, address, website_link,
 *                     free_shipping_option, free_shipping_threshold_inside_of_valley,
 *                     free_shipping_threshold_out_of_valley, category_display_count, map_url,
 *                     company_logo_header, company_logo_footer), each valued as { value } (plus
 *                     header_logo_full_url / footer_logo_full_url for the two logo keys).
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
export async function GET(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const settings = await readSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

async function handleSave(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    const isFormData = contentType.includes("multipart/form-data");
    const payload: FormData | Record<string, unknown> = isFormData ? await request.formData() : await request.json();
    const getValue = (key: string) =>
      typeof (payload as FormData).get === "function" ? (payload as FormData).get(key) : (payload as Record<string, unknown>)[key];

    const headerLogoFile = getValue("company_logo_header_file") || getValue("company_logo_header");
    const footerLogoFile = getValue("company_logo_footer_file") || getValue("company_logo_footer");
    const headerLogoPath = await saveUploadedFile(headerLogoFile);
    const footerLogoPath = await saveUploadedFile(footerLogoFile);

    const settingsMap: Record<string, string> = {};
    for (const key of SETTINGS_KEYS) {
      if (key === "company_logo_header") {
        settingsMap[key] = headerLogoPath || String(getValue("company_logo_header_path") || getValue("company_logo_header") || "");
      } else if (key === "company_logo_footer") {
        settingsMap[key] = footerLogoPath || String(getValue("company_logo_footer_path") || getValue("company_logo_footer") || "");
      } else {
        const value = getValue(key);
        if (value !== undefined && value !== null) settingsMap[key] = String(value);
      }
    }

    for (const [key, value] of Object.entries(settingsMap)) {
      await upsertSetting(key, value);
    }

    const settings = await readSettings();
    return NextResponse.json({ success: true, message: "Website settings saved successfully.", settings });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/admin/website:
 *   post:
 *     summary: Save website/company settings (admin token)
 *     description: POST and PATCH are equivalent - both call the same save handler.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Any subset of the settings keys listed in the GET response, e.g. company_name, primary_email, whatsapp, address, website_link, map_url, free_shipping_option.
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               company_logo_header_file: { type: string, format: binary }
 *               company_logo_footer_file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Website settings saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Website settings saved successfully." }
 *                 settings: { type: object, description: Same shape as GET's settings object. }
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
export async function POST(request: NextRequest) {
  return handleSave(request);
}

/**
 * @swagger
 * /api/v1/admin/website:
 *   patch:
 *     summary: Save website/company settings (admin token)
 *     description: POST and PATCH are equivalent - both call the same save handler.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Any subset of the settings keys listed in the GET response, e.g. company_name, primary_email, whatsapp, address, website_link, map_url, free_shipping_option.
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               company_logo_header_file: { type: string, format: binary }
 *               company_logo_footer_file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Website settings saved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Website settings saved successfully." }
 *                 settings: { type: object, description: Same shape as GET's settings object. }
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
export async function PATCH(request: NextRequest) {
  return handleSave(request);
}
