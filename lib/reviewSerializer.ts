import { prisma } from "@/lib/prisma";
import { toSafeCustomer } from "@/lib/userSerializer";
import type { product_reviews } from "@prisma/client";

// Ports Reviews::getImageFullUrlAttribute (Reviews.php:20-33) - note this one uses Laravel's
// raw `asset('storage/app/public/' . $img)` helper directly, NOT Helpers::get_full_url, so
// unlike most other image fields it never returns null - it always builds a URL even if the
// file doesn't exist on disk.
function reviewImageFullUrl(imagePath: string | null): string[] {
  if (!imagePath) return [];
  let images: unknown;
  try {
    images = JSON.parse(imagePath);
  } catch {
    images = imagePath;
  }
  const list = Array.isArray(images) ? images : [imagePath];
  const base = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return list.map((img) => `${base}/storage/app/public/${String(img).replace(/^\/+/, "")}`);
}

// Ports Reviews::customer() (belongsTo User, Reviews.php:44-47), with the password/remember_token
// strip from lib/userSerializer.ts applied.
export async function serializeReview(review: product_reviews) {
  const customer = review.customer_id
    ? await prisma.users.findUnique({ where: { id: review.customer_id } })
    : null;

  return {
    id: Number(review.id),
    customer_id: review.customer_id !== null ? Number(review.customer_id) : null,
    product_code: review.product_code,
    order_id: review.order_id,
    name: review.name,
    email: review.email,
    review_detail: review.review_detail,
    rating: review.rating,
    image_path: review.image_path,
    created_at: review.created_at,
    updated_at: review.updated_at,
    image_full_url: reviewImageFullUrl(review.image_path),
    customer: customer ? toSafeCustomer(customer) : null,
  };
}
