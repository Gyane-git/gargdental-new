import { assetUrl } from "@/lib/assetUrl";
import type { users } from "@prisma/client";

// Laravel's User model (app/Models/User.php) has NO $hidden array at all, so every place
// gargdental nests a User (e.g. Reviews::customer) leaks the bcrypt `password` hash and
// `remember_token` into the JSON response. Per an explicit call on this (a security defect,
// not a "replicate bugs" shape quirk), we strip those two fields here but keep every other
// field identical, including the always-appended `image_full_url` (User.php:40-53).
export function toSafeCustomer(user: users) {
  const { password: _password, remember_token: _rememberToken, ...safe } = user;
  return {
    ...safe,
    image_full_url: assetUrl(user.profile_photo_path, "profile"),
  };
}
