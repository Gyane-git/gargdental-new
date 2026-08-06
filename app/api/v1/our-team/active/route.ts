import { prisma } from "@/lib/prisma";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { assetUrl } from "@/lib/assetUrl";

// Ports OurTeamController::get_active_teams (OurTeamController.php:78-97), decorated additively
// with team_image_full_url/is_active for gargnew's admin/storefront reuse (see our-team/route.ts).
/**
 * @swagger
 * /api/v1/our-team/active:
 *   get:
 *     summary: List active (status = 1) team members
 *     tags: [OurTeam]
 *     responses:
 *       200:
 *         description: Active team members fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Active team members fetched successfully." }
 *                 teams:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: our_team row plus team_image_full_url and is_active.
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export async function GET() {
  try {
    const teams = await prisma.our_team.findMany({ where: { status: 1 } });
    const decorated = teams.map((row) => ({
      ...row,
      team_image_full_url: assetUrl(row.team_image, "backend/our-team"),
      is_active: row.status === 1,
    }));
    return successResponse("Active team members fetched successfully.", { teams: decorated });
  } catch (error) {
    console.error("Exception occurred while fetching active team members", error);
    return serverErrorResponse("Failed to get active team members", error);
  }
}
