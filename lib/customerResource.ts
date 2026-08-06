import { assetUrl } from "@/lib/assetUrl";
import { toDateTimeString } from "@/lib/formatDbDateTime";
import type { users } from "@prisma/client";

// Ports CustomerResource::toArray (app/Http/Resources/CustomerResource.php) exactly - a narrow
// field set (NOT the full user row), with created_at as a raw "Y-m-d H:i:s" string via
// ->toDateTimeString() (see lib/formatDbDateTime.ts for why that bypasses the usual UTC shift).
export function toCustomerResource(user: users) {
  return {
    id: Number(user.id),
    full_name: user.full_name,
    phone: user.phone,
    email: user.email,
    login_medium: user.login_medium,
    image_full_url: assetUrl(user.profile_photo_path, "profile"),
    created_at: toDateTimeString(user.created_at),
  };
}
