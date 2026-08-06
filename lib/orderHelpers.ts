import { prisma } from "@/lib/prisma";
import { generateIpsToken } from "@/lib/connectIpsToken";
import { nowForDb } from "@/lib/dbTime";
import type { customer_address_book, orders, users } from "@prisma/client";

// Shared helpers for OrderController::add_to_order/buy_now (OrderController.php:306-481, 810-1003).

export async function getSystemSettingValue(key: string): Promise<string | null> {
  const row = await prisma.system_settings.findFirst({ where: { key } });
  return row?.value ?? null;
}

// Ports OrderController::getAddress (OrderController.php:524-531) - scoped to the customer, so
// a valid-but-foreign address id (passes the `exists:customer_address_book,id` validation rule,
// which isn't scoped by customer) throws here instead, same as Laravel.
export async function getCustomerAddress(customerId: bigint, addressId: number): Promise<customer_address_book> {
  const address = await prisma.customer_address_book.findFirst({ where: { id: BigInt(addressId), customer_id: customerId } });
  if (!address) throw new Error("Address not found");
  return address;
}

// Ports OrderController::createDeliveryInformation (OrderController.php:533-548).
export async function createDeliveryInformation(
  customerId: bigint,
  address: customer_address_book,
  email: string,
  type: "billing" | "shipping",
) {
  return prisma.delivery_information.create({
    data: {
      customer_id: customerId,
      full_name: address.full_name,
      invoice_email: email,
      phone: address.phone,
      province_id: address.province_id,
      city_id: address.city_id,
      zone_id: address.zone_id,
      address: address.address,
      landmark: address.landmark,
      address_type: address.address_type,
      type,
      created_at: nowForDb(),
      updated_at: nowForDb(),
    },
  });
}

// Ports OrderController::generateIpsPaymentUrl (OrderController.php:487-521). Laravel's config
// keys config('connectips.callback_url')/config('connectips.api_url') don't actually exist in
// config/connectips.php (only base_url/merchant_id/app_id/password/app_password/cert_password
// are defined there) - so in the real app this always builds a broken "?params" URL with no
// host. Rather than replicate a URL that's non-functional in Laravel too, we build a real one
// from the NEXT_PUBLIC_CONNECTIPS_* env vars already present in .env.
export function generateIpsPaymentUrl(order: orders, amount: number, customer: users): string {
  const merchantId = process.env.CONNECT_IPS_MERCHANT_ID || process.env.NEXT_PUBLIC_CONNECTIPS_MERCHANTID || "";
  const appId = process.env.CONNECT_IPS_APP_ID || process.env.NEXT_PUBLIC_CONNECTIPS_APPID || "";
  const appPassword = process.env.CONNECT_IPS_APP_PASSWORD || process.env.CONNECTIPS_MERCHANT_USER_PASSWORD || "";
  const apiUrl = process.env.NEXT_PUBLIC_CONNECTIPS_API_URL || "https://login.connectips.com/connectipswebgw/loginpage";
  const callbackUrl = process.env.NEXT_PUBLIC_CONNECTIPS_GETDETAILS_URL || process.env.NEXT_PUBLIC_APP_URL || "";

  const txnAmt = Math.trunc(amount);
  const signature = generateIpsToken(merchantId, appId, order.order_id.toString(), txnAmt);

  const data: Record<string, string> = {
    MERCHANTID: merchantId,
    APPID: appId,
    APPPASSWORD: appPassword,
    REFERENCEID: order.order_id.toString(),
    TXNAMT: String(txnAmt),
    CURRENCY: "NPR",
    RETURNURL: callbackUrl,
    CUSTNAME: customer.full_name,
    CUSTEMAIL: customer.email || "",
    CUSTPHONE: customer.phone || "",
    SIGNATURE: signature,
  };

  return `${apiUrl}?${new URLSearchParams(data).toString()}`;
}
