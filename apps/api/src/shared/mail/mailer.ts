import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AppError } from "../errors/AppError";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

let transport: Transporter | null = null;

/**
 * One mail provider behind one function, so swapping SMTP for an API provider later touches only
 * this file. Credentials come from `SMTP_URL`; they are never hard-coded or logged.
 * Without `SMTP_URL`, development and tests log instead of sending; production refuses, because
 * silently dropping a customer's receipt is worse than saying mail isn't set up.
 */
export const mailer = {
  isConfigured: () => env.SMTP_URL !== undefined || env.NODE_ENV !== "production",

  async send(message: MailMessage): Promise<void> {
    if (!env.SMTP_URL && env.NODE_ENV === "production") {
      throw AppError.unavailable("Email is not configured on this server.");
    }
    transport ??= env.SMTP_URL
      ? nodemailer.createTransport(env.SMTP_URL)
      : nodemailer.createTransport({ jsonTransport: true });
    try {
      await transport.sendMail({ from: env.MAIL_FROM, ...message });
    } catch (error) {
      logger.error({ err: error, to: message.to }, "Failed to send email");
      throw AppError.unavailable("The email couldn't be sent. Please try again shortly.");
    }
    if (!env.SMTP_URL)
      logger.info({ to: message.to, subject: message.subject }, "Email (not sent)");
  },
};
