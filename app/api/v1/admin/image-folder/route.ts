import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { buildCategoryTree } from "@/lib/categoryTree";
import { ensureCategoryFolder, organizeFilesForCategories } from "@/lib/excelUpload";

// Ports gargnew's app/api/v1/admin/image-folder/route.js.
/**
 * @swagger
 * /api/v1/admin/image-folder:
 *   get:
 *     summary: List category folders and their organized image files under /images/uploads (admin token)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Category tree and organized files fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 categories: { type: array, items: { type: object }, description: Nested category tree. }
 *                 organizedFiles: { type: array, items: { type: object }, description: Files found per category folder. }
 *                 basePath: { type: string, example: "/images/uploads" }
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
    return Response.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const rows = await prisma.categories.findMany({ orderBy: { id: "asc" } });
    const categories = buildCategoryTree(rows, { onlyActive: false });
    const organizedFiles = await organizeFilesForCategories(categories as never);

    return Response.json({ success: true, categories, organizedFiles, basePath: "/images/uploads" });
  } catch (error) {
    console.error("IMAGE FOLDER LIST ERROR:", error);
    return Response.json({ success: false, message: error instanceof Error ? error.message : "Failed to load image folders." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/admin/image-folder:
 *   post:
 *     summary: Upload and extract a ZIP of images into a category folder (admin token)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [folder_name, zip_file]
 *             properties:
 *               folder_name:
 *                 type: string
 *                 description: Destination folder name under /images/uploads.
 *               zip_file:
 *                 type: string
 *                 format: binary
 *                 description: .zip archive of images.
 *     responses:
 *       200:
 *         description: Files uploaded and extracted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 folder: { type: string }
 *                 path: { type: string, example: "/images/uploads/my-folder" }
 *       400:
 *         description: Missing folder_name/zip_file, or file is not a .zip.
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
export async function POST(request: NextRequest) {
  const authUser = await requireAdminAuth(request);
  if (!authUser) {
    return Response.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const zipFile = formData.get("zip_file");
    const folderName = String(formData.get("folder_name") || "").trim();

    if (!folderName) {
      return Response.json({ success: false, message: "folder_name is required." }, { status: 400 });
    }
    if (!zipFile || typeof zipFile !== "object" || !(zipFile as File).size) {
      return Response.json({ success: false, message: "ZIP file is required." }, { status: 400 });
    }

    const fileName = String((zipFile as File).name || "").toLowerCase();
    if (!fileName.endsWith(".zip")) {
      return Response.json({ success: false, message: "Only .zip files are allowed." }, { status: 400 });
    }

    const AdmZip = (await import("adm-zip")).default;
    const destinationPath = await ensureCategoryFolder(folderName);
    const buffer = Buffer.from(await (zipFile as File).arrayBuffer());
    const zip = new AdmZip(buffer);
    zip.extractAllTo(destinationPath, true);

    return Response.json({
      success: true,
      message: "Files uploaded and extracted successfully!",
      folder: folderName,
      path: `/images/uploads/${folderName}`,
    });
  } catch (error) {
    console.error("IMAGE FOLDER UPLOAD ERROR:", error);
    return Response.json({ success: false, message: error instanceof Error ? error.message : "Failed to extract the ZIP file." }, { status: 500 });
  }
}
