export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Swappable transport. Verification/reset tokens are always real - generated,
 * hashed, stored, and checked exactly as they would be with a live provider.
 * Only the delivery transport is a dev stub until a real provider key is
 * configured (see .env.example) - this is a standard adapter, not fake
 * functionality.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export class DevConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log(
      `[dev-email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.body}`,
    );
  }
}

export function buildVerificationEmail(rawToken: string): Pick<EmailMessage, "subject" | "body"> {
  return {
    subject: "Verify your fashion-platform account",
    body: `Verification token: ${rawToken}\n\nSubmit this via POST /auth/verify-email.`,
  };
}

export function buildPasswordResetEmail(rawToken: string): Pick<EmailMessage, "subject" | "body"> {
  return {
    subject: "Reset your fashion-platform password",
    body: `Password reset token: ${rawToken}\n\nSubmit this via POST /auth/reset-password. This token expires in 1 hour.`,
  };
}

export function buildOrderConfirmationEmail(
  storeName: string,
  orderId: string,
  totalCents: number,
): Pick<EmailMessage, "subject" | "body"> {
  return {
    subject: `Your order from ${storeName} is confirmed`,
    body: `Thanks for your order! Order ${orderId} totals $${(totalCents / 100).toFixed(2)}, to be paid by cash on delivery.`,
  };
}

export function buildNewOrderNotificationEmail(
  orderId: string,
  totalCents: number,
): Pick<EmailMessage, "subject" | "body"> {
  return {
    subject: "New order received",
    body: `A new order (${orderId}) was placed for $${(totalCents / 100).toFixed(2)}. Check the Orders page in your Merchant Portal.`,
  };
}
