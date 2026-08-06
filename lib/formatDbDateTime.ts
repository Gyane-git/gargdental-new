// Some Laravel resources/controllers format a date with `->toDateTimeString()` (e.g.
// CustomerResource) instead of relying on the model's default JSON cast. That bypasses Carbon's
// usual UTC-conversion-on-serialize behavior entirely, printing the RAW stored wall-clock value
// (which, per lib/dbTime.ts, is Kathmandu local time) as a plain "Y-m-d H:i:s" string - no "Z",
// no timezone shift. Since our Prisma Date objects hold that same raw value in their UTC fields
// (Prisma reads the DATETIME column's literal digits as if UTC), formatting via getUTC*
// accessors reproduces Laravel's toDateTimeString() output exactly, bypassing the global
// Date.prototype.toJSON patch in lib/prisma.ts (which is for the default-cast case only).
export function toDateTimeString(date: Date | null): string | null {
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}
