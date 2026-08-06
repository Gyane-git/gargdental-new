import { prisma } from "@/lib/prisma";
import { serializeProduct } from "@/lib/productSerializer";
import type { orders, order_items } from "@prisma/client";

// Ports Order/OrderItem relations (Order.php, OrderItem.php). Note: Order::deliveryInfo()
// resolves to the OrderDelivered model (order_delivered table - the delivery-tracking row with
// delivery_date), NOT DeliveryInformation (the address snapshot) - an easy name collision to
// get backwards.

async function serializeOrderItem(item: order_items) {
  const product = await prisma.products.findFirst({ where: { product_code: item.product_code } });
  const review = await prisma.product_reviews.findFirst({
    where: { product_code: item.product_code, order_id: String(item.order_id) },
  });
  return {
    ...item,
    product: product ? await serializeProduct(product, {}) : null,
    review: review ?? null,
  };
}

export interface SerializeOrderOptions {
  withCancelDetails?: boolean;
}

export async function serializeOrder(order: orders, options: SerializeOrderOptions = {}) {
  const itemRows = await prisma.order_items.findMany({ where: { order_id: order.order_id } });
  const orderItems = await Promise.all(itemRows.map(serializeOrderItem));

  const deliveryInfo = await prisma.order_delivered.findFirst({ where: { order_id: order.order_id } });

  let returnAvailable = false;
  if (deliveryInfo?.delivery_date) {
    const daysSinceDelivery = Math.floor((Date.now() - deliveryInfo.delivery_date.getTime()) / (1000 * 60 * 60 * 24));
    returnAvailable = daysSinceDelivery <= 3;
  }

  let cancelDetails = undefined;
  if (options.withCancelDetails) {
    cancelDetails = await prisma.order_cancel.findFirst({ where: { order_id: order.order_id } });
  }

  return {
    ...order,
    orderItems,
    deliveryInfo: deliveryInfo ?? null,
    ...(options.withCancelDetails ? { cancelDetails: cancelDetails ?? null } : {}),
    return_available: returnAvailable,
  };
}
