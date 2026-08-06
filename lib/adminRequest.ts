// Shared admin-mode detector for the handful of /api/v1/** paths the admin UI reuses from the
// mobile contract (categories, brands, banners, offers, promotions, products list). Mirrors
// gargnew's utils/apiFormatters.js shouldReturnFlatCategories pattern (Referer contains /admin,
// or an explicit query flag) so the Laravel-compatible mobile shape on these same URLs is never
// disturbed - the admin-only shape is opt-in via this check, not the default.
export function isAdminRequest(req: { url: string; headers: { get(name: string): string | null } }, flag = "admin"): boolean {
  const url = new URL(req.url);
  const referer = req.headers.get("referer") || "";
  return url.searchParams.get(flag) === "1" || url.searchParams.has("include_inactive") || referer.includes("/admin");
}
