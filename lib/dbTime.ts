// gargdental's Laravel app runs with APP_TIMEZONE=Asia/Kathmandu (config/app.php), so every
// created_at/updated_at written by Eloquent's now() stores KATHMANDU WALL-CLOCK digits in
// MySQL's timezone-less DATETIME columns (confirmed by diffing a live row: raw stored value was
// 5h45m ahead of what Laravel's own JSON output showed for the same column - Laravel converts
// back to true UTC only at serialization time). Prisma has no such conversion - it reads the raw
// digits and treats them as literal UTC. To keep new writes consistent with existing rows (and
// with the -5:45 read-side correction in lib/prisma.ts's Date.prototype.toJSON patch), any
// created_at/updated_at this app sets explicitly must use nowForDb() here, not `new Date()`.
const KATHMANDU_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

export function nowForDb(): Date {
  return new Date(Date.now() + KATHMANDU_OFFSET_MS);
}

export { KATHMANDU_OFFSET_MS };
