import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, serverErrorResponse } from "@/lib/apiResponse";
import { saveTeamMember } from "@/lib/ourTeam";
import { requireAdminAuth } from "@/lib/adminAuth";
import { assetUrl } from "@/lib/assetUrl";

// Ports OurTeamController::get_teams (OurTeamController.php:35-54). Note: OurTeam has a
// getTeamImageUrlAttribute accessor but it is NOT in the model's $appends, so raw team_image
// (not a full URL) is what Laravel actually returns here - the mobile shape is preserved as-is.
// PLUS gargnew's admin `active`/`activeOnly` filter and team_image_full_url/is_active fields
// (app/api/v1/our-team/route.js GET) as an additive superset - mobile never reads those extra
// fields, and the base team_image field/envelope are unchanged.
/**
 * @swagger
 * /api/v1/our-team:
 *   get:
 *     summary: List team members (all, or active-only via query param)
 *     tags: [OurTeam]
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: ["1"]
 *         required: false
 *         description: Pass "1" to return only active (status = 1) members.
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: string
 *           enum: ["1"]
 *         required: false
 *         description: Alias for `active`; either param set to "1" filters to active members.
 *     responses:
 *       200:
 *         description: Team members fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Team members fetched successfully." }
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
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get("active") === "1" || searchParams.get("activeOnly") === "1";

    const teams = await prisma.our_team.findMany({ where: activeOnly ? { status: 1 } : {} });
    const decorated = teams.map((row) => ({
      ...row,
      team_image_full_url: assetUrl(row.team_image, "backend/our-team"),
      is_active: row.status === 1,
    }));

    return successResponse("Team members fetched successfully.", { teams: decorated });
  } catch (error) {
    console.error("Exception occurred while fetching team members", error);
    return serverErrorResponse("Failed to get team members", error);
  }
}

// Ports gargnew's admin team-member create (app/api/v1/our-team/route.js POST). requireAdminAuth
// added - gargnew left this unauthenticated.
/**
 * @swagger
 * /api/v1/our-team:
 *   post:
 *     summary: Add a new team member (admin)
 *     tags: [OurTeam]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [team_name, team_role]
 *             properties:
 *               team_name: { type: string }
 *               team_role: { type: string }
 *               team_linkedin: { type: string }
 *               team_email: { type: string }
 *               status: { type: string, description: "Accepts 1/0, active/inactive, yes/no, true/false. Defaults to active (1) if omitted." }
 *               image: { type: string, format: binary, description: "Optional team member photo." }
 *     responses:
 *       201:
 *         description: Team member added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Team member added successfully." }
 *                 id: { type: integer, description: "Newly created our_team row ID." }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       422:
 *         description: team_name/team_role missing or blank.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Team name and role are required." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, description: "Exception message, or a generic fallback." }
 */
export async function POST(req: NextRequest) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("image");

    const body = {
      team_name: formData.get("team_name"),
      team_role: formData.get("team_role"),
      team_linkedin: formData.get("team_linkedin"),
      team_email: formData.get("team_email"),
      status: formData.get("status"),
    };

    const result = await saveTeamMember({ body, file });
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status || 400 });
    }

    return NextResponse.json({ success: true, message: "Team member added successfully.", id: result.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
