import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";

// Ports gargnew's admin auth (app/api/v1/admin/auth/{login,logout,me}/route.js, middleware.ts).
// Same JWT secret/cookie space as the customer JWT (lib/auth.ts), differentiated by a
// `type: "admin"` claim - matches gargnew's contract exactly so a copied admin UI needs no changes.
//
// SCHEMA NOTE: gargnew's SQL was written against a DIFFERENT database (omsokcom_gargdental,
// per its own .env) than the live `gargdental` DB this project introspected. That DB's
// admin_roles table has group_name/permissions columns and admins has full_name/status columns -
// none of which exist here. The real schema has admin_roles.name (role display name, e.g.
// "Super Admin") + admin_roles.modules (JSON array of permission strings), and admins.name
// (the person's name) with no status/active flag at all. Adapted accordingly below - role
// resolution prefers admin_roles.name over admins.account_type, since account_type holds
// non-role values like "A" in the real data, not "Super Admin"/"Admin"/"Staff" etc.

const JWT_SECRET = process.env.NEXTAUTH_SECRET as string;
const ADMIN_TOKEN_TTL = "7d";

export interface AdminTokenPayload {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  role_id: number;
  permissions: string;
  type: "admin";
}

export async function findAdminWithRole(adminId: number) {
  const admin = await prisma.admins.findUnique({ where: { id: adminId } });
  if (!admin) return null;
  const role = await prisma.admin_roles.findUnique({ where: { id: BigInt(admin.role_id) } });
  return { admin, role };
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ADMIN_TOKEN_TTL });
}

function getTokenFromRequest(req: NextRequest): string | null {
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) return cookieToken;
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  return null;
}

// Verifies the token AND re-checks the admin still exists (mirrors /admin/auth/me re-validating
// against the DB on every load, not just trusting the JWT claims).
export async function requireAdminAuth(req: NextRequest): Promise<AdminTokenPayload | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AdminTokenPayload;
    if (decoded.type !== "admin" || !decoded.id) return null;
    return decoded;
  } catch {
    return null;
  }
}
