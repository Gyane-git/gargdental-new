import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";

// Ports SettingController::get_settings (SettingController.php:35-66) - note the lowercase
// "settings fetched successfully." message (not capitalized, unlike most other endpoints).
/**
 * @swagger
 * /api/v1/settings:
 *   get:
 *     summary: List all system settings, keyed by setting key
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Settings fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "settings fetched successfully." }
 *                 settings:
 *                   type: object
 *                   description: >
 *                     Map of setting key -> {id, value, created_at, updated_at}. The "company_logo_header" and
 *                     "company_logo_footer" keys additionally get header_logo_full_url/footer_logo_full_url.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET() {
  try {
    const rows = await prisma.system_settings.findMany();
    const settings: Record<string, unknown> = {};

    for (const row of rows) {
      const data: Record<string, unknown> = {
        id: row.id,
        value: row.value,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
      if (row.key === "company_logo_header") {
        data.header_logo_full_url = row.value ? assetUrl(row.value, "system") : null;
      }
      if (row.key === "company_logo_footer") {
        data.footer_logo_full_url = row.value ? assetUrl(row.value, "system") : null;
      }
      settings[row.key] = data;
    }

    return successResponse("settings fetched successfully.", { settings });
  } catch (error) {
    console.error("Exception occurred while fetching settings", error);
    return serverErrorResponse("Failed to get settings", error);
  }
}
