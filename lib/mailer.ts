import net from "net";
import tls from "tls";
import { getEmailSettings } from "@/lib/emailSettings";

// Minimal dependency-free raw-SMTP client (no nodemailer) ported from gargnew/utils/mailer.js.
// Talks directly to the SMTP server, configured from the admin Email Settings panel
// (lib/emailSettings.ts, stored in system_settings) with a fallback to the MAIL_* env vars so
// nothing breaks before an admin has ever opened that panel.

const stripQuotes = (value: string | undefined) => String(value || "").replace(/^["']|["']$/g, "");

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  encryption: "ssl" | "tls" | "none";
  fromAddress: string;
  fromName: string;
}

const smtpConfigFromEnv = (): SmtpConfig => ({
  host: process.env.MAIL_HOST as string,
  port: Number(process.env.MAIL_PORT || 465),
  user: process.env.MAIL_USERNAME as string,
  pass: stripQuotes(process.env.MAIL_PASSWORD),
  encryption: (process.env.MAIL_ENCRYPTION as SmtpConfig["encryption"]) || "ssl",
  fromAddress: process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME || "",
  fromName: stripQuotes(process.env.MAIL_FROM_NAME || "Garg Dental"),
});

// DB-configured settings (app/admin/email-settings) take priority over .env whenever an admin has
// saved them, so changing SMTP settings from the dashboard takes effect immediately, application-
// wide, with no redeploy/restart - every send* helper below goes through this one function.
const smtpConfig = async (): Promise<SmtpConfig> => {
  const dbSettings = await getEmailSettings();
  if (dbSettings) {
    return {
      host: dbSettings.host,
      port: dbSettings.port,
      user: dbSettings.username,
      pass: dbSettings.password,
      encryption: dbSettings.encryption,
      fromAddress: dbSettings.from_address || dbSettings.username,
      fromName: dbSettings.from_name || "Garg Dental",
    };
  }
  return smtpConfigFromEnv();
};

const encodeAddress = (name: string, email: string) => {
  const safeName = String(name || "").replace(/"/g, '\\"');
  return safeName ? `"${safeName}" <${email}>` : email;
};

type Socket = net.Socket | tls.TLSSocket;

const readResponse = (socket: Socket): Promise<string> =>
  new Promise((resolve, reject) => {
    let buffer = "";

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";

      // Multi-line SMTP responses use "250-..." for every line but the last, which uses "250 ...".
      if (/^\d{3}\s/.test(lastLine)) {
        cleanup();
        resolve(buffer);
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });

const sendCommand = async (socket: Socket, command: string, expectedCodes: number[]) => {
  socket.write(`${command}\r\n`);
  const response = await readResponse(socket);
  const code = Number(response.slice(0, 3));

  if (!expectedCodes.includes(code)) {
    throw new Error(`SMTP command failed with ${code}: ${response.trim()}`);
  }

  return response;
};

// encryption:"ssl" is implicit TLS from the first byte (typically port 465) - connect straight
// into a TLS handshake. encryption:"tls"/"none" start on a plain socket (typically port 587 or
// 25); "tls" then upgrades via STARTTLS below once the server advertises it.
const connectSocket = (config: SmtpConfig): Promise<Socket> =>
  new Promise((resolve, reject) => {
    if (config.encryption === "ssl") {
      const socket = tls.connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: false });
      socket.once("secureConnect", () => resolve(socket));
      socket.once("error", reject);
    } else {
      const socket = net.connect({ host: config.host, port: config.port });
      socket.once("connect", () => resolve(socket));
      socket.once("error", reject);
    }
  });

const upgradeToTls = (socket: net.Socket, host: string): Promise<tls.TLSSocket> =>
  new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: host, rejectUnauthorized: false });
    secureSocket.once("secureConnect", () => resolve(secureSocket));
    secureSocket.once("error", reject);
  });

// SASL PLAIN (RFC 4616) is authzid \0 authcid \0 passwd - NUL-separated, not space-separated.
// The previous version used `Buffer.from(\` ${user} ${pass}\`)`, a literal space instead of a
// NUL byte, which every real SMTP server (confirmed against Gmail: "501 5.5.2 Cannot Decode
// response") rejects outright. AUTH LOGIN happened to still succeed as the fallback, masking
// this, but the malformed PLAIN attempt burns a round trip (and looks like an attack in server
// logs) on every single send, and a server that only offers PLAIN - some providers don't offer
// LOGIN at all - would have failed to authenticate completely.
const authenticate = async (socket: Socket, user: string, pass: string) => {
  const plainToken = Buffer.from(`\0${user}\0${pass}`, "utf8").toString("base64");

  try {
    await sendCommand(socket, `AUTH PLAIN ${plainToken}`, [235]);
    return;
  } catch {
    // fall through to AUTH LOGIN
  }

  await sendCommand(socket, "AUTH LOGIN", [334]);
  await sendCommand(socket, Buffer.from(user).toString("base64"), [334]);
  await sendCommand(socket, Buffer.from(pass).toString("base64"), [235]);
};

interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

const buildMessage = ({ from, to, subject, text, html }: MailMessage) => {
  const boundary = `garg-${Date.now()}`;

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
};

// Sends using an already-resolved SmtpConfig - shared by sendMail() (loads config itself) and the
// admin "Send Test Email" endpoint (needs to test unsaved form values before they're persisted).
export const sendMailWithConfig = async (config: SmtpConfig, { to, subject, text, html }: Omit<MailMessage, "from">) => {
  if (!config.host || !config.user || !config.pass || !config.fromAddress) {
    throw new Error("SMTP configuration is incomplete.");
  }

  let socket: Socket = await connectSocket(config);

  try {
    await readResponse(socket);
    await sendCommand(socket, `EHLO ${config.host}`, [250]);

    if (config.encryption === "tls") {
      await sendCommand(socket, "STARTTLS", [220]);
      socket = await upgradeToTls(socket as net.Socket, config.host);
      await sendCommand(socket, `EHLO ${config.host}`, [250]);
    }

    await authenticate(socket, config.user, config.pass);
    await sendCommand(socket, `MAIL FROM:<${config.fromAddress}>`, [250]);
    await sendCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
    await sendCommand(socket, "DATA", [354]);

    const from = encodeAddress(config.fromName, config.fromAddress);
    const message = buildMessage({ from, to, subject, text, html });
    await sendCommand(socket, `${message}\r\n.`, [250]);
    await sendCommand(socket, "QUIT", [221]);
  } finally {
    socket.end();
  }
};

export const sendMail = async (message: Omit<MailMessage, "from">) => {
  const config = await smtpConfig();
  await sendMailWithConfig(config, message);
};

const codeEmail = (title: string, intro: string, code: number) => `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
    <h2 style="color:#0072bc">${title}</h2>
    <p>${intro}</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:4px;color:#0072bc">${code}</p>
    <p>If you did not request this, please ignore this email.</p>
  </div>
`;

export const sendVerificationCodeEmail = async (email: string, code: number, fullName = "Customer") => {
  await sendMail({
    to: email,
    subject: "Garg Dental account verification code",
    text: `Hello ${fullName},\n\nYour Garg Dental verification code is ${code}.`,
    html: codeEmail("Garg Dental Account Verification", `Hello ${fullName}, your verification code is:`, code),
  });
};

export const sendPasswordResetCodeEmail = async (email: string, code: number, fullName = "Customer") => {
  await sendMail({
    to: email,
    subject: "Garg Dental password reset code",
    text: `Hello ${fullName},\n\nYour Garg Dental password reset code is ${code}.`,
    html: codeEmail("Garg Dental Password Reset", `Hello ${fullName}, your password reset code is:`, code),
  });
};

export const sendRegistrationSuccessEmail = async (email: string) => {
  await sendMail({
    to: email,
    subject: "Welcome to Garg Dental",
    text: "Your email has been verified. Welcome to Garg Dental!",
    html: `<div style="font-family:Arial,sans-serif;color:#111827"><h2 style="color:#0072bc">Welcome to Garg Dental</h2><p>Your email has been verified.</p></div>`,
  });
};

export const sendPasswordResetSuccessEmail = async (email: string) => {
  await sendMail({
    to: email,
    subject: "Garg Dental password reset successful",
    text: "Your password has been reset successfully.",
    html: `<div style="font-family:Arial,sans-serif;color:#111827"><h2 style="color:#0072bc">Password Reset Successful</h2><p>Your password has been reset successfully.</p></div>`,
  });
};

export interface OrderEmailItem {
  name: string;
  quantity: number;
  price: number;
}

const currency = (amount: number) => `Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const itemsTable = (items: OrderEmailItem[]) => `
  <table style="width:100%;border-collapse:collapse;margin-top:12px">
    <thead>
      <tr style="text-align:left;border-bottom:2px solid #e5e7eb">
        <th style="padding:6px 4px">Item</th>
        <th style="padding:6px 4px">Qty</th>
        <th style="padding:6px 4px">Price</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map(
          (item) => `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:6px 4px">${item.name}</td>
          <td style="padding:6px 4px">${item.quantity}</td>
          <td style="padding:6px 4px">${currency(item.price)}</td>
        </tr>`,
        )
        .join("")}
    </tbody>
  </table>
`;

export const sendOrderConfirmationEmail = async (
  email: string,
  orderId: string,
  items: OrderEmailItem[],
  grandTotal: number,
) => {
  await sendMail({
    to: email,
    subject: `Garg Dental order #${orderId} confirmed`,
    text: `Your order #${orderId} has been placed successfully. Total: ${currency(grandTotal)}.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="color:#0072bc">Order Confirmed</h2>
        <p>Thank you for your order! Your order <strong>#${orderId}</strong> has been placed successfully and is now being processed.</p>
        ${itemsTable(items)}
        <p style="margin-top:12px;font-size:16px"><strong>Grand Total: ${currency(grandTotal)}</strong></p>
        <p>We'll notify you again once your order ships.</p>
      </div>
    `,
  });
};

export const sendOrderCancellationEmail = async (email: string, orderId: string, reason: string) => {
  await sendMail({
    to: email,
    subject: `Garg Dental order #${orderId} cancelled`,
    text: `Your order #${orderId} has been cancelled. Reason: ${reason}.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="color:#0072bc">Order Cancelled</h2>
        <p>Your order <strong>#${orderId}</strong> has been cancelled as requested.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>If any payment was made for this order, our team will process the refund shortly.</p>
      </div>
    `,
  });
};

export const sendContactFormAckEmail = async (email: string, name: string) => {
  await sendMail({
    to: email,
    subject: "We received your message - Garg Dental",
    text: `Hello ${name},\n\nThank you for contacting Garg Dental. We've received your message and will respond shortly.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="color:#0072bc">We Received Your Message</h2>
        <p>Hello ${name},</p>
        <p>Thank you for contacting Garg Dental. Our team has received your message and will respond shortly.</p>
      </div>
    `,
  });
};

export const sendContactFormNotificationEmail = async (
  adminEmail: string,
  submission: { name: string; email: string; message: string },
) => {
  await sendMail({
    to: adminEmail,
    subject: `New contact form submission from ${submission.name}`,
    text: `Name: ${submission.name}\nEmail: ${submission.email}\n\nMessage:\n${submission.message}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="color:#0072bc">New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${submission.name}</p>
        <p><strong>Email:</strong> ${submission.email}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap">${submission.message}</p>
      </div>
    `,
  });
};
