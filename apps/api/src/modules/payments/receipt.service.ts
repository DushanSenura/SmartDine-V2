import type { ReceiptDto } from "@smartdine/shared";

import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";
import { mailer } from "../../shared/mail/mailer";
import { buildTextPdf } from "./pdf";
import { receiptLines } from "./receipt.render";

async function load(auth: AuthContext, id: string, asCustomer = false) {
  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      bill: { select: { refundedAmount: true, customerId: true } },
      branch: { select: { timezone: true } },
    },
  });
  if (!receipt) throw AppError.notFound("Receipt not found.");
  if (asCustomer) {
    // Someone else's receipt is "not found", not "forbidden": it shouldn't be confirmable.
    if (receipt.bill.customerId !== auth.userId) throw AppError.notFound("Receipt not found.");
  } else {
    assertBranchAccess(auth, receipt.branchId);
  }
  // The printed body is an immutable snapshot; only the refunded total is read live.
  const dto: ReceiptDto = {
    ...(receipt.data as unknown as Omit<ReceiptDto, "id">),
    id: receipt.id,
    refundedAmount: Number(receipt.bill.refundedAmount),
  };
  return { dto, timezone: receipt.branch.timezone };
}

export const receiptService = {
  /** A customer's own receipt, found through the bill their account was attached to. */
  async getForCustomer(auth: AuthContext, id: string) {
    return (await load(auth, id, true)).dto;
  },

  async pdfForCustomer(auth: AuthContext, id: string) {
    const { dto, timezone } = await load(auth, id, true);
    return {
      filename: `${dto.receiptNumber}.pdf`,
      body: buildTextPdf(receiptLines(dto, timezone)),
    };
  },

  async get(auth: AuthContext, id: string) {
    return (await load(auth, id)).dto;
  },

  /** Emails the receipt (text + PDF) to `to`, or to the customer on the bill if none is given. */
  async email(auth: AuthContext, id: string, to?: string) {
    const { dto, timezone } = await load(auth, id);
    let recipient = to;
    if (!recipient) {
      const bill = await prisma.receipt.findUnique({
        where: { id },
        select: { bill: { select: { customer: { select: { email: true } } } } },
      });
      recipient = bill?.bill.customer?.email;
    }
    if (!recipient) {
      throw AppError.validation("Enter an email address: this bill has no customer attached.");
    }
    const lines = receiptLines(dto, timezone);
    await mailer.send({
      to: recipient,
      subject: `Your receipt ${dto.receiptNumber} from ${dto.branch.name}`,
      text: [...lines, "", "Thank you for dining with us."].join("\n"),
      attachments: [
        {
          filename: `${dto.receiptNumber}.pdf`,
          content: buildTextPdf(lines),
          contentType: "application/pdf",
        },
      ],
    });
    return { sentTo: recipient };
  },

  async pdf(auth: AuthContext, id: string) {
    const { dto, timezone } = await load(auth, id);
    return {
      filename: `${dto.receiptNumber}.pdf`,
      body: buildTextPdf(receiptLines(dto, timezone)),
    };
  },
};
