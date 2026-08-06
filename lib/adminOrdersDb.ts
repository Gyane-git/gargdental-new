import { prisma } from "@/lib/prisma";
import { nowForDb } from "@/lib/dbTime";
import type { orders } from "@prisma/client";

// Ports gargnew's utils/adminOrders.js CONTRACT (the OrderListPage/OrderDetailsPage components'
// expected response shape: id, orderId, customerId, customer, address, totalItems, totalAmount,
// orderStatus, paymentStatus, paymentMethod, shippingCarrier, created, orderDate, customerInfo,
// shippingInfo, summary, items[], raw) using clean Prisma queries against the real schema
// instead of gargnew's dynamic column-discovery SQL (unnecessary here - we know the schema).

async function loadDeliveryInfo(id: bigint | null) {
  if (!id) return null;
  const info = await prisma.delivery_information.findUnique({ where: { id } });
  if (!info) return null;
  const [province, city, zone] = await Promise.all([
    prisma.provinces.findUnique({ where: { id: info.province_id } }),
    prisma.set_shipping.findUnique({ where: { id: info.city_id } }),
    prisma.address_zone.findUnique({ where: { id: info.zone_id } }),
  ]);
  return { ...info, province, city, zone };
}

async function formatOrderRow(order: orders) {
  const [shipping, billing, itemRows] = await Promise.all([
    loadDeliveryInfo(order.shipping_delivery_information_id),
    loadDeliveryInfo(order.billing_delivery_information_id),
    prisma.order_items.findMany({ where: { order_id: order.order_id }, orderBy: { id: "asc" } }),
  ]);

  const items = await Promise.all(
    itemRows.map(async (item, index) => {
      const product = await prisma.products.findFirst({ where: { product_code: item.product_code } });
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.price || product?.sell_price || product?.actual_price || 0);
      const subtotal = Number(item.subtotal || unitPrice * quantity);
      return {
        sn: index + 1,
        product: product?.product_name || item.product_code,
        product_code: item.product_code,
        qty: quantity,
        unitPrice,
        subtotal,
        actual_price: Number(item.actual_price || product?.actual_price || 0),
      };
    }),
  );

  const shippingFullName = shipping?.full_name || "";
  const shippingAddress = [shipping?.address, shipping?.landmark, shipping?.address_type].filter(Boolean).join(", ");
  const customerLabel = shippingFullName || `Customer #${order.customer_id}`;

  const [orderCount, customer, deliveryTracking, shippedTracking] = await Promise.all([
    prisma.orders.count({ where: { customer_id: order.customer_id } }),
    prisma.users.findUnique({ where: { id: order.customer_id }, select: { created_at: true } }),
    prisma.order_delivered.findFirst({ where: { order_id: order.order_id } }),
    prisma.order_shipped.findFirst({ where: { order_id: order.order_id } }),
  ]);

  const customerSince = customer?.created_at
    ? customer.created_at.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  return {
    id: Number(order.id),
    orderId: `#${order.order_id}`,
    order_id: order.order_id.toString(),
    customerId: Number(order.customer_id),
    customer: customerLabel,
    address: shippingAddress || billing?.address || "",
    totalItems: items.reduce((sum, i) => sum + i.qty, 0),
    totalAmount: Number(order.total_amount),
    orderStatus: order.order_status || "processing",
    paymentStatus: order.payment_status || "unpaid",
    paymentMethod: order.payment_method || "",
    shippingCarrier: shippedTracking?.shipping_carrier ? String(shippedTracking.shipping_carrier) : "",
    created: order.created_at ? order.created_at.toISOString().slice(0, 10) : "",
    orderDate: order.created_at
      ? order.created_at.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      : "",
    customerInfo: {
      email: shipping?.invoice_email || billing?.invoice_email || "",
      phone: shipping?.phone || billing?.phone || "",
      totalOrders: orderCount,
      customerSince,
    },
    shippingInfo: {
      method: order.shipping_method || "Standard Shipping",
      province: shipping?.province?.province_name || "",
      city: shipping?.city?.city || "",
      zone: shipping?.zone?.zone_name || "",
      streetAddress: shipping?.address || "",
    },
    summary: {
      subtotal: Number(order.subtotal),
      taxRate: 13,
      tax: Number(order.tax),
      shippingCost: Number(order.shipping_cost),
      totalAmount: Number(order.total_amount),
    },
    items,
    deliveryDate: deliveryTracking?.delivery_date || null,
    receivedBy: deliveryTracking?.received_by || null,
    raw: order,
  };
}

// The order list only ever reads orderId/customer/address/totalItems/totalAmount/orderStatus/
// paymentStatus/created (confirmed against components/admin-orders/OrderListPage.js, including
// its CSV export column mapping) - it never needs the full per-order detail formatOrderRow()
// builds (items, customerInfo, shippingInfo, summary, tracking). formatOrderRow() doing ~8+
// queries per order (plus one more per order item) is fine for a single order (fetchAdminOrderById
// below) but was an uncapped N+1 storm here across the entire orders table (788 rows -> thousands
// of sequential queries per page load). This bulk-fetches shipping info and item totals in a
// small, fixed number of queries regardless of row count.
export async function fetchAdminOrders({ status = "" }: { status?: string } = {}) {
  const rows = await prisma.orders.findMany({
    where: status ? { order_status: status } : {},
    orderBy: { id: "desc" },
  });
  if (rows.length === 0) return [];

  const shippingIds = [...new Set(rows.map((o) => o.shipping_delivery_information_id))];
  const billingIds = [...new Set(rows.map((o) => o.billing_delivery_information_id))];
  const deliveryIds = [...new Set([...shippingIds, ...billingIds])];

  const [deliveryRows, itemRows] = await Promise.all([
    prisma.delivery_information.findMany({ where: { id: { in: deliveryIds } } }),
    prisma.order_items.findMany({
      where: { order_id: { in: rows.map((o) => o.order_id) } },
      select: { order_id: true, quantity: true },
    }),
  ]);

  const deliveryById = new Map(deliveryRows.map((d) => [d.id.toString(), d]));
  const itemCountByOrderId = new Map<string, number>();
  for (const item of itemRows) {
    const key = item.order_id.toString();
    itemCountByOrderId.set(key, (itemCountByOrderId.get(key) || 0) + Number(item.quantity));
  }

  return rows.map((order) => {
    const shipping = deliveryById.get(order.shipping_delivery_information_id.toString()) || null;
    const billing = deliveryById.get(order.billing_delivery_information_id.toString()) || null;
    const shippingAddress = [shipping?.address, shipping?.landmark, shipping?.address_type].filter(Boolean).join(", ");
    const customerLabel = shipping?.full_name || `Customer #${order.customer_id}`;

    return {
      id: Number(order.id),
      orderId: `#${order.order_id}`,
      order_id: order.order_id.toString(),
      customerId: Number(order.customer_id),
      customer: customerLabel,
      address: shippingAddress || billing?.address || "",
      totalItems: itemCountByOrderId.get(order.order_id.toString()) || 0,
      totalAmount: Number(order.total_amount),
      orderStatus: order.order_status || "processing",
      paymentStatus: order.payment_status || "unpaid",
      paymentMethod: order.payment_method || "",
      created: order.created_at ? order.created_at.toISOString().slice(0, 10) : "",
      orderDate: order.created_at
        ? order.created_at.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
        : "",
    };
  });
}

export async function fetchAdminOrderById(identifier: string) {
  const cleanId = identifier.replace(/^#/, "");
  const order = await prisma.orders.findFirst({
    where: { OR: [{ order_id: BigInt(cleanId) }, { id: BigInt(cleanId) }] },
  });
  if (!order) return null;
  return formatOrderRow(order);
}

export async function updateOrderStatus(
  order: orders,
  {
    orderStatus,
    paymentStatus,
    paymentMethod,
  }: { orderStatus?: string; paymentStatus?: string; paymentMethod?: string | null },
) {
  await prisma.orders.update({
    where: { id: order.id },
    data: {
      ...(orderStatus ? { order_status: orderStatus } : {}),
      ...(paymentStatus ? { payment_status: paymentStatus } : {}),
      ...(paymentMethod !== undefined && paymentMethod !== null ? { payment_method: paymentMethod } : {}),
      updated_at: nowForDb(),
    },
  });
}
