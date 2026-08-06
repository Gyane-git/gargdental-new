import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { mediaStoragePath } from "@/lib/mediaStorage";
import { prisma } from "@/lib/prisma";
import { assetUrl } from "@/lib/assetUrl";
import { nowForDb } from "@/lib/dbTime";
import type { our_team } from "@prisma/client";

// Ports gargnew's utils/ourTeam.js. Real our_team.status is a required Int (not nullable), so
// "accepts 1/0/active/inactive/yes/no/true/false" parsing is kept but always writes a concrete value.
function parseStatus(input: unknown, fallback: number): number {
  if (input === undefined || input === null || input === "") return fallback;
  const normalized = String(input).trim().toLowerCase();
  if (["1", "active", "yes", "true"].includes(normalized)) return 1;
  if (["0", "inactive", "no", "false"].includes(normalized)) return 0;
  const num = Number(input);
  return Number.isFinite(num) ? (num ? 1 : 0) : fallback;
}

function serializeMember(row: our_team) {
  return {
    id: row.id,
    team_name: row.team_name,
    team_role: row.team_role,
    team_image: row.team_image,
    team_image_full_url: assetUrl(row.team_image, "backend/our-team"),
    team_linkedin: row.team_linkedin,
    team_email: row.team_email,
    status: row.status,
    is_active: row.status === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchTeamMembers({ activeOnly = false }: { activeOnly?: boolean } = {}) {
  const rows = await prisma.our_team.findMany({
    where: activeOnly ? { status: 1 } : {},
    orderBy: { id: "desc" },
  });
  return rows.map(serializeMember);
}

export async function fetchTeamMemberById(id: string | number) {
  const row = await prisma.our_team.findUnique({ where: { id: BigInt(id) } });
  return row ? serializeMember(row) : null;
}

export async function deleteTeamMember(id: string | number) {
  const existing = await prisma.our_team.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return { success: false };

  await prisma.our_team.delete({ where: { id: BigInt(id) } });
  return { success: true };
}

interface SaveTeamMemberBody {
  team_name?: FormDataEntryValue | null;
  team_role?: FormDataEntryValue | null;
  team_linkedin?: FormDataEntryValue | null;
  team_email?: FormDataEntryValue | null;
  status?: FormDataEntryValue | null;
}

export async function saveTeamMember({
  id,
  body,
  file,
}: {
  id?: string | number;
  body: SaveTeamMemberBody;
  file?: FormDataEntryValue | null;
}) {
  const existing = id ? await prisma.our_team.findUnique({ where: { id: BigInt(id) } }) : null;
  if (id && !existing) {
    return { success: false, message: "Team member not found.", status: 404 };
  }

  const team_name = String(body.team_name ?? existing?.team_name ?? "").trim();
  const team_role = String(body.team_role ?? existing?.team_role ?? "").trim();

  if (!team_name || !team_role) {
    return { success: false, message: "Team name and role are required.", status: 422 };
  }

  let team_image = existing?.team_image ?? null;
  if (file instanceof File && file.size > 0) {
    const dir = path.join(mediaStoragePath(), "backend/our-team");
    await mkdir(dir, { recursive: true });
    const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    await writeFile(path.join(dir, safeName), Buffer.from(await file.arrayBuffer()));
    team_image = safeName;
  }

  const data = {
    team_name,
    team_role,
    team_image,
    team_linkedin: (body.team_linkedin as string) || existing?.team_linkedin || null,
    team_email: (body.team_email as string) || existing?.team_email || null,
    status: parseStatus(body.status, existing?.status ?? 1),
    updated_at: nowForDb(),
  };

  if (existing) {
    await prisma.our_team.update({ where: { id: existing.id }, data });
    return { success: true, id: existing.id };
  }

  const created = await prisma.our_team.create({ data: { ...data, created_at: nowForDb() } });
  return { success: true, id: created.id };
}
