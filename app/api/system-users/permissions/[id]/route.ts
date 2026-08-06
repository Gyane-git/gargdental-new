// Ports gargnew's app/api/system-users/permissions/[id]/route.js.
/**
 * @swagger
 * /api/system-users/permissions/{id}:
 *   get:
 *     summary: Get a single permission group by id (admin token)
 *     description: >
 *       "permissions" and "groups" are the same underlying admin_roles resource - this route
 *       re-exports app/api/system-users/groups/[id]/route.ts's handlers unchanged.
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Group fetched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 group:
 *                   type: object
 *                   description: Admin role/group (id, groupName, permissions, status, createdAt, updatedAt).
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Group not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Group not found." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 *   put:
 *     summary: Update a permission group (admin token)
 *     description: >
 *       "permissions" and "groups" are the same underlying admin_roles resource - this route
 *       re-exports app/api/system-users/groups/[id]/route.ts's handlers unchanged.
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 *               status: { type: string, description: "\"inactive\" or 0 sets inactive; anything else sets active." }
 *     responses:
 *       200:
 *         description: Group updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Group updated successfully." }
 *                 group: { type: object, description: Same shape as GET's group object. }
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
 *   delete:
 *     summary: Delete a permission group (admin token)
 *     description: >
 *       "permissions" and "groups" are the same underlying admin_roles resource - this route
 *       re-exports app/api/system-users/groups/[id]/route.ts's handlers unchanged.
 *     tags: [SystemUsers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Group deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Group deleted successfully." }
 *       401:
 *         description: Missing or invalid admin token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthenticatedResponse'
 *       404:
 *         description: Group not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Group not found." }
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
export { GET, PUT, DELETE } from "../../groups/[id]/route";
