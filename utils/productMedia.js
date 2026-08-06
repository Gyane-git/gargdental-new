const normalizeImageUrl = (value, fallbackFolder = "uploads/products") => {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("storage/app/public/backend/")) return `/${raw.replace(/^storage\/app\/public\//, "")}`;
  if (raw.startsWith("backend/")) return `/${raw}`;
  if (raw.startsWith("storage/app/public/")) return `/${raw.replace(/^storage\/app\/public\//, "")}`;
  if (raw.startsWith("/")) return raw;
  if (raw.startsWith("uploads/")) return `/${raw}`;
  if (raw.startsWith("public/")) return `/${raw.replace(/^public\//, "")}`;
  if (raw.includes("/")) return `/${raw.replace(/^\/+/, "")}`;

  return `/${fallbackFolder.replace(/^\/+|\/+$/g, "")}/${raw}`;
};

export const resolveProductImage = (product, fallback = "/assets/logo.png") => {
  const galleryImage = product?.product_images?.[0] || product?.gallery?.[0] || product?.images?.[0] || null;

  // Our real API (lib/productSerializer.ts) always computes main_image_full_url/files_full_url
  // as ready-to-use absolute URLs whenever main_image/product images exist - those must be tried
  // FIRST. product.main_image itself is a bare filename (e.g. "2026-02-08-xxx.png") with no folder
  // info attached (product images live under backend/productimages/{product_code}/, a path this
  // generic helper has no way to reconstruct) - normalizeImageUrl's fallback guess of
  // /uploads/products/{filename} doesn't correspond to anything real, so it was matching first
  // and shadowing the correct, already-resolved URL on every single product card.
  const candidates = [
    product?.main_image_full_url,
    product?.image_full_url,
    product?.gallery_image_full_url,
    product?.image_url,
    product?.main_image_url,
    product?.files_full_url?.[0],
    galleryImage?.image_full_url,
    galleryImage?.image_url,
  ];

  for (const candidate of candidates) {
    const resolved = normalizeImageUrl(candidate);
    if (resolved) return resolved;
  }

  return fallback;
};

export const resolveCategoryImage = (category, fallback = "/no-image.png") => {
  const candidates = [category?.image_full_url, category?.image_url, category?.image];
  for (const candidate of candidates) {
    const resolved = normalizeImageUrl(candidate, "uploads");
    if (resolved) return resolved;
  }
  return fallback;
};

export const resolveBrandImage = (brand, fallback = "/no-image.png") => {
  const candidates = [brand?.image_full_url, brand?.image_url, brand?.logo_full_url, brand?.image];
  for (const candidate of candidates) {
    const resolved = normalizeImageUrl(candidate, "uploads/brands");
    if (resolved) return resolved;
  }
  return fallback;
};
