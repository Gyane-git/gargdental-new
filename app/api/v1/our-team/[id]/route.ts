import { NextRequest, NextResponse } from "next/server";
import { deleteTeamMember, fetchTeamMemberById, saveTeamMember } from "@/lib/ourTeam";
import { requireAdminAuth } from "@/lib/adminAuth";

// Ports gargnew's app/api/v1/our-team/[id]/route.js. GET is public; PATCH/DELETE admin-gated.
/**
 * @swagger
 * /api/v1/our-team/{id}:
 *   get:
 *     summary: Get one team member by ID
 *     tags: [OurTeam]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Numeric our_team row ID (sent as a string).
 *     responses:
 *       200:
 *         description: Team member fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 member:
 *                   type: object
 *                   description: Serialized team member (lib/ourTeam.ts serializeMember).
 *                   properties:
 *                     id: { type: integer }
 *                     team_name: { type: string }
 *                     team_role: { type: string }
 *                     team_image: { type: string, nullable: true }
 *                     team_image_full_url: { type: string, nullable: true }
 *                     team_linkedin: { type: string, nullable: true }
 *                     team_email: { type: string, nullable: true }
 *                     status: { type: integer }
 *                     is_active: { type: boolean }
 *                     created_at: { type: string, format: date-time }
 *                     updated_at: { type: string, format: date-time }
 *       404:
 *         description: No team member with this ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Team member not found." }
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await fetchTeamMemberById(id);

  if (!member) {
    return NextResponse.json({ success: false, message: "Team member not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, member });
}

/**
 * @swagger
 * /api/v1/our-team/{id}:
 *   patch:
 *     summary: Update a team member, optionally replacing their photo (admin)
 *     tags: [OurTeam]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Numeric our_team row ID (sent as a string).
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               team_name: { type: string, description: "Required (falls back to the existing value if omitted; blank after that fails validation)." }
 *               team_role: { type: string, description: "Required (falls back to the existing value if omitted; blank after that fails validation)." }
 *               team_linkedin: { type: string }
 *               team_email: { type: string }
 *               status: { type: string, description: "Accepts 1/0, active/inactive, yes/no, true/false." }
 *               image: { type: string, format: binary, description: "Optional. Replaces the stored photo when a non-empty file is sent." }
 *     responses:
 *       200:
 *         description: Team member updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Team member updated successfully." }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No team member with this ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Team member not found." }
 *       422:
 *         description: team_name/team_role resolved to blank.
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
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const formData = await req.formData();
    const file = formData.get("image");

    const body = {
      team_name: formData.get("team_name"),
      team_role: formData.get("team_role"),
      team_linkedin: formData.get("team_linkedin"),
      team_email: formData.get("team_email"),
      status: formData.get("status"),
    };

    const result = await saveTeamMember({ id, body, file });
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status || 400 });
    }

    return NextResponse.json({ success: true, message: "Team member updated successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/v1/our-team/{id}:
 *   delete:
 *     summary: Delete a team member by ID (admin)
 *     tags: [OurTeam]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Numeric our_team row ID (sent as a string).
 *     responses:
 *       200:
 *         description: Team member deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Team member deleted successfully." }
 *       401:
 *         description: Missing/invalid admin bearer token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: No team member with this ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Team member not found." }
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
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = await requireAdminAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthenticated", message: "Valid authentication token required" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const result = await deleteTeamMember(id);
    if (!result.success) {
      return NextResponse.json({ success: false, message: "Team member not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Team member deleted successfully." });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Internal server error." }, { status: 500 });
  }
}
