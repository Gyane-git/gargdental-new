import { prisma } from "@/lib/prisma";
import { serializeProduct } from "@/lib/productSerializer";
import type { cart, cart_items, customer_address_book } from "@prisma/client";

// Ports App\CentralLogics\Helpers::getCustomerStats()'s cart half (Helpers.php:353-355) and
// CartController's updateCartShippingCost/updateCartTotals (CartController.php:345-393).
//
// IMPORTANT numeric-type quirk, confirmed against the live Laravel instance: cart.subtotal/tax/
// shipping_cost_total are Decimal columns that normally serialize as STRINGS ("0.00") when read
// straight from the DB (e.g. in get_carts, which never recomputes them) - but in add_to_cart/
// remove_cart_item/remove_cart/update_cart, these three are freshly recomputed with PHP
// arithmetic (sum()/literal 0) and assigned in-memory before the SAME response serializes them,
// which turns them into raw JSON NUMBERS (PHP's decimal cast only re-stringifies on the *next*
// fetch from DB, not on in-memory assignment). shipping_cost is never arithmetic (always a
// direct passthrough of another Decimal column), so it stays a string even when freshly set.
// We replicate this by explicitly Number()-ing subtotal/tax/shipping_cost_total only in the
// mutating endpoints, matching each one's real Laravel behavior below.

export async function getCart(customerId: bigint) {
  return prisma.cart.findFirst({ where: { customer_id: customerId } });
}

export async function getCartItems(cartId: bigint) {
  return prisma.cart_items.findMany({ where: { cart_id: cartId } });
}

// Used by GET /customer/cart/list only - the one endpoint that returns items with nested,
// fully-serialized `product` (+ raw `images`) data; every mutating endpoint below returns bare
// items (see serializeBareCart).
export async function serializeCartItemsWithProduct(items: cart_items[]) {
  return Promise.all(
    items.map(async (item) => {
      const product = await prisma.products.findFirst({ where: { product_code: item.product_code } });
      if (!product) return { ...item, product: null };
      const images = await prisma.product_images.findMany({ where: { product_code: item.product_code } });
      return { ...item, product: { ...(await serializeProduct(product, {})), images } };
    }),
  );
}

export function serializeBareCart(cartRow: cart, items: cart_items[]) {
  return { ...cartRow, items };
}

async function getShippingOption(): Promise<string | null> {
  const setting = await prisma.system_settings.findFirst({ where: { key: "shipping_option" } });
  return setting?.value ?? null;
}

// Ports CartController::updateCartShippingCost (CartController.php:345-357).
export async function updateCartShippingCost(cartId: bigint, address: customer_address_book | null) {
  if (!address) return;
  const shippingSetting = await prisma.set_shipping.findUnique({ where: { id: address.city_id } });
  if (shippingSetting) {
    await prisma.cart.update({ where: { id: cartId }, data: { shipping_cost: shippingSetting.shipping_cost } });
  }
}

// Ports CartController::updateCartTotals (CartController.php:359-393). Returns the recomputed
// values so the caller can build the numeric (not Decimal-string) response fields.
export async function updateCartTotals(cartId: bigint, address: customer_address_book | null) {
  const cartRow = await prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
  const items = await prisma.cart_items.findMany({ where: { cart_id: cartId } });

  let subtotal = 0;
  for (const item of items) {
    const product = await prisma.products.findFirst({ where: { product_code: item.product_code } });
    if (product) subtotal += Number(item.quantity) * Number(product.sell_price);
  }

  const cartItemCount = items.length;
  const shippingCost = Number(cartRow.shipping_cost);
  const shippingOption = await getShippingOption();

  let shippingCostTotal = 0;
  if (cartItemCount >= 1) {
    if (shippingOption === "citywisecost") shippingCostTotal = shippingCost;
    else if (shippingOption === "itemwisecost") shippingCostTotal = shippingCost * cartItemCount;
  }

  const tax = 0;
  const provinceId = address ? address.province_id : null;
  const cityId = address ? address.city_id : null;

  await prisma.cart.update({
    where: { id: cartId },
    data: { subtotal, tax, shipping_cost_total: shippingCostTotal, province_id: provinceId, city_id: cityId },
  });

  return { subtotal, tax, shippingCostTotal };
}

export async function getDefaultShippingAddress(customerId: bigint) {
  return prisma.customer_address_book.findFirst({ where: { customer_id: customerId, default_shipping: "Y" } });
}
