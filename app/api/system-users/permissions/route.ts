// Ports gargnew's app/api/system-users/permissions/route.js, which is literally a re-export of
// the groups route - "permissions" and "groups" are the same underlying admin_roles resource.
/**
 * @swagger
 * /api/system-users/permissions:
 *   get:
 *     summary: List permission groups (admin token)
 *     description: >
 *       "permissions" and "groups" are the same underlying admin_roles resource - this route
 *       re-exports app/api/system-users/groups/route.ts's handlers unchanged.
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Groups fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Admin role/group (id, groupName, permissions, status, createdAt, updatedAt).
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
 *   post:
 *     summary: Create a permission group (admin token)
 *     description: >
 *       "permissions" and "groups" are the same underlying admin_roles resource - this route
 *       re-exports app/api/system-users/groups/route.ts's handlers unchanged.
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [groupName]
 *             properties:
 *               groupName: { type: string, description: "Aliases: group_name, name." }
 *               permissions:
 *                 description: Stored as JSON if an array is sent, otherwise as a plain string.
 *                 oneOf:
 *                   - type: array
 *                     items: { type: string }
 *                   - type: string
 *               status: { type: string, description: "\"inactive\" or 0 sets inactive; anything else (including omitted) sets active." }
 *     responses:
 *       201:
 *         description: Group created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Group created successfully." }
 *                 group: { type: object, description: Same shape as GET's group items. }
 *       400:
 *         description: Missing group name.
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
export { GET, POST } from "../groups/route";
