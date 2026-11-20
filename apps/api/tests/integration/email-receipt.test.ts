import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { mailer } from "../../src/shared/mail/mailer";
import { cleanupBranches, cleanupMenu, cleanupUsers, prisma, setupDatabase } from "./helpers";
import { api, openBill, pinRates, restaurant } from "./fixtures";

let restoreRates: () => Promise<void>;

beforeAll(async () => {
  await setupDatabase();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  restoreRates = await pinRates(true);
});
afterAll(async () => {
  await restoreRates();
  await cleanupUsers();
  await cleanupBranches();
  await cleanupMenu();
  await prisma.$disconnect();
});
afterEach(() => vi.restoreAllMocks());

/** A fully paid bill and its receipt id. */
async function paidReceipt(label: string) {
  const w = await restaurant(label);
  const { bill } = await openBill(w, [w.soup.id]);
  const paid = await api("post", `/bills/${bill.id}/payments`, w.cashier.token).send({
    method: "CASH",
    amount: bill.total,
  });
  return { w, receiptId: paid.body.data.receiptId as string };
}

describe("emailing a receipt", () => {
  it("sends the receipt with a PDF attached to the address given", async () => {
    const send = vi.spyOn(mailer, "send").mockResolvedValue();
    const { w, receiptId } = await paidReceipt("ER1");

    const res = await api("post", `/receipts/${receiptId}/email`, w.cashier.token)
      .send({ to: "guest@example.com" })
      .expect(200);
    expect(res.body.data).toEqual({ sentTo: "guest@example.com" });

    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0]![0];
    expect(message.to).toBe("guest@example.com");
    expect(message.subject).toContain("R-");
    expect(message.text).toContain("Soup");
    expect(message.attachments?.[0]).toMatchObject({ contentType: "application/pdf" });
    expect(message.attachments?.[0]?.content.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("asks for an address when the bill has no customer, and rejects bad ones", async () => {
    const send = vi.spyOn(mailer, "send").mockResolvedValue();
    const { w, receiptId } = await paidReceipt("ER2");

    await api("post", `/receipts/${receiptId}/email`, w.cashier.token).send({}).expect(400);
    await api("post", `/receipts/${receiptId}/email`, w.cashier.token)
      .send({ to: "not-an-email" })
      .expect(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("is limited to cashiers of the receipt's own branch", async () => {
    const send = vi.spyOn(mailer, "send").mockResolvedValue();
    const { receiptId } = await paidReceipt("ER3");
    const elsewhere = await restaurant("ER3b");

    await api("post", `/receipts/${receiptId}/email`, elsewhere.cashier.token)
      .send({ to: "guest@example.com" })
      .expect(403);
    await api("post", `/receipts/${receiptId}/email`, elsewhere.waiter.token)
      .send({ to: "guest@example.com" })
      .expect(403);
    await api("post", `/receipts/${receiptId}/email`, undefined)
      .send({ to: "guest@example.com" })
      .expect(401);
    expect(send).not.toHaveBeenCalled();
  });
});
