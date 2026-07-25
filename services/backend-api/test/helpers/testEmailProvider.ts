import type { EmailMessage, EmailProvider } from "../../src/lib/email.js";

export class TestEmailProvider implements EmailProvider {
  sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  /** Extracts the raw token from the last email sent to `to` (or any email if omitted). */
  lastToken(to?: string): string {
    const messages = to ? this.sent.filter((m) => m.to === to) : this.sent;
    const last = messages.at(-1);
    if (!last) throw new Error(`no email sent${to ? ` to ${to}` : ""}`);
    const match = /token: (\S+)/.exec(last.body);
    if (!match?.[1]) throw new Error("no token found in email body");
    return match[1];
  }
}
