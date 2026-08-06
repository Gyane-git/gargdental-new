import { prisma } from "@/lib/prisma";
import type { customer_address_book } from "@prisma/client";

// Ports CustomerAddressBook's province()/city()/zone() relations (CustomerAddressBook.php:16-29).
// `city` -> the Shipping model (set_shipping table), NOT a literal city table - naming carried
// over from Laravel exactly.
export async function serializeAddress(address: customer_address_book) {
  const [province, city, zone] = await Promise.all([
    prisma.provinces.findUnique({ where: { id: address.province_id } }),
    prisma.set_shipping.findUnique({ where: { id: address.city_id } }),
    prisma.address_zone.findUnique({ where: { id: address.zone_id } }),
  ]);

  return { ...address, province: province ?? null, city: city ?? null, zone: zone ?? null };
}
