import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { nowForDb } from "@/lib/dbTime";

// Ports gargnew's utils/adminUsers.js CONTRACT (response field names: id, name, fullName,
// email, phone, address, country, profilePhotoPath, roleId, accountType, status, createdAt,
// updatedAt) against the REAL admins/admin_roles schema (see lib/adminAuth.ts's top comment) -
// gargnew's version dynamically created its own admins/admin_roles tables with different
// columns (full_name, status) against a database that lacked them; ours already has real ones
// from Laravel's migrations. There's no `status` column on the real `admins` table at all, so
// every admin here is always "active" (status: 1) - there's nothing to toggle.

const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function roleNameFor(roleId: number | null) {
  if (!roleId) return null;
  const role = await prisma.admin_roles.findUnique({ where: { id: BigInt(roleId) } });
  return role?.name ?? null;
}

export async function fetchAdminUsers() {
  const admins = await prisma.admins.findMany({ orderBy: { id: "desc" } });
  const roleIds = [...new Set(admins.map((a) => a.role_id))];
  const roles = await prisma.admin_roles.findMany({ where: { id: { in: roleIds.map((id) => BigInt(id)) } } });
  const roleById = new Map(roles.map((r) => [Number(r.id), r]));

  return admins.map((a) => ({
    id: a.id,
    name: a.name,
    fullName: a.name,
    email: a.email,
    phone: a.phone || "",
    address: a.address || "",
    country: a.country || "",
    profilePhotoPath: a.profile_photo_path || null,
    roleId: a.role_id,
    accountType: a.account_type || roleById.get(a.role_id)?.name || "Staff",
    status: 1,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  }));
}

export async function fetchAdminUserById(id: number) {
  const users = await fetchAdminUsers();
  return users.find((u) => u.id === id) || null;
}

interface SaveAdminUserInput {
  id?: number | null;
  body: {
    full_name?: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    country?: string;
    role_id?: number | string;
    accountType?: string;
    account_type?: string;
    profile_photo_path?: string;
    password?: string;
  };
}

export async function saveAdminUser({ id = null, body }: SaveAdminUserInput) {
  const fullName = String(body.full_name || body.name || "").trim();
  const email = normalizeEmail(String(body.email || ""));
  const phone = String(body.phone || "").trim();
  const address = String(body.address || "").trim();
  const country = String(body.country || "").trim();
  const roleId = body.role_id !== undefined && body.role_id !== null && String(body.role_id).trim() !== "" ? Number(body.role_id) : null;
  const accountTypeInput = String(body.accountType || body.account_type || "").trim();
  const profilePhotoPath = String(body.profile_photo_path || "").trim();

  if (!fullName) return { success: false, status: 422, message: "Name is required." };
  if (!email) return { success: false, status: 422, message: "Email is required." };

  let passwordHash: string | null = null;
  if (body.password) passwordHash = await bcrypt.hash(String(body.password), 10);

  const resolvedRoleName = (roleId ? await roleNameFor(roleId) : null) || accountTypeInput || null;

  const existingByEmail = await prisma.admins.findFirst({ where: { email, ...(id ? { id: { not: id } } : {}) } });
  if (existingByEmail) {
    return { success: false, status: 409, message: "Email is already in use by another admin." };
  }

  if (id) {
    await prisma.admins.update({
      where: { id },
      data: {
        name: fullName,
        email,
        phone: phone || null,
        address: address || null,
        country: country || null,
        profile_photo_path: profilePhotoPath || null,
        role_id: roleId ?? undefined,
        account_type: resolvedRoleName,
        updated_at: nowForDb(),
        ...(passwordHash ? { password: passwordHash } : {}),
      },
    });
    return { success: true, id };
  }

  if (!passwordHash) return { success: false, status: 422, message: "Password is required." };
  if (roleId === null) return { success: false, status: 422, message: "Role is required." };

  const created = await prisma.admins.create({
    data: {
      name: fullName,
      email,
      phone: phone || null,
      address: address || null,
      country: country || null,
      profile_photo_path: profilePhotoPath || null,
      role_id: roleId,
      account_type: resolvedRoleName,
      password: passwordHash,
      created_at: nowForDb(),
      updated_at: nowForDb(),
    },
  });
  return { success: true, id: created.id };
}

export async function deleteAdminUser(id: number) {
  try {
    await prisma.admins.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

// Role ("group") management for system-users/groups + permissions (gargnew treats these as the
// same underlying resource - permissions/route.js literally re-exports groups/route.js).
export async function fetchAdminRoles() {
  const roles = await prisma.admin_roles.findMany({ orderBy: { id: "desc" } });
  return roles.map((r) => ({
    id: Number(r.id),
    groupName: r.name,
    permissions: r.modules || "",
    status: r.status ? 1 : 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function fetchAdminRoleById(id: number) {
  const roles = await fetchAdminRoles();
  return roles.find((r) => r.id === id) || null;
}

interface SaveAdminRoleInput {
  id?: number | null;
  body: {
    groupName?: string;
    group_name?: string;
    name?: string;
    permissions?: string | string[];
    status?: number | string;
  };
}

export async function saveAdminRole({ id = null, body }: SaveAdminRoleInput) {
  const groupName = String(body.groupName || body.group_name || body.name || "").trim();
  const permissions = Array.isArray(body.permissions)
    ? JSON.stringify(body.permissions)
    : String(body.permissions || "");
  const status = Number(body.status) === 0 || String(body.status).toLowerCase() === "inactive" ? false : true;

  if (!groupName) return { success: false, status: 422, message: "Group name is required." };

  if (id) {
    await prisma.admin_roles.update({
      where: { id: BigInt(id) },
      data: { name: groupName, modules: permissions, status, updated_at: nowForDb() },
    });
    return { success: true, id };
  }

  const created = await prisma.admin_roles.create({
    data: { name: groupName, modules: permissions, status, created_at: nowForDb(), updated_at: nowForDb() },
  });
  return { success: true, id: Number(created.id) };
}

export async function deleteAdminRole(id: number) {
  try {
    await prisma.admin_roles.delete({ where: { id: BigInt(id) } });
    return true;
  } catch {
    return false;
  }
}
