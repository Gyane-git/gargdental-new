import { prisma } from "@/lib/prisma";

// Ports Helpers::isInsideValley (Helpers.php:20-35) plus the address->city lookup used by
// OrderController::checkValley (OrderController.php:1043). add_to_order/buy_now call this via a
// real internal HTTP round-trip to their own /customer/check-valley in Laravel (forwarding a
// `token` field) - we call the logic directly instead, since going through a real HTTP hop to
// our own server would add nothing but fragility.
export async function isAddressInsideValley(customerId: bigint, addressId: number): Promise<boolean> {
  const address = await prisma.customer_address_book.findFirst({ where: { id: BigInt(addressId), customer_id: customerId } });
  if (!address) return false;

  const city = await prisma.set_shipping.findUnique({ where: { id: address.city_id } });
  const cityName = city?.city ?? null;
  return Boolean(cityName && /kathmandu|lalitpur/i.test(cityName));
}
