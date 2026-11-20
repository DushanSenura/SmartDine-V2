import type { PaymentMethod } from "@smartdine/shared";

export interface ChargeRequest {
  method: PaymentMethod;
  amount: number;
  currency: string;
  /** Operator-entered reference (card approval code, transfer id…). */
  reference?: string;
}

export type ChargeResult = { ok: true; reference: string | null } | { ok: false; message: string };

/**
 * The seam for payment gateways. SmartDine records payments taken on the floor (cash, a card
 * terminal, a transfer); a gateway integration implements this interface and is selected per
 * method in `providerFor`. Credentials belong in environment variables — never in code.
 */
export interface PaymentProvider {
  readonly name: string;
  charge(request: ChargeRequest): Promise<ChargeResult>;
}

/** Records a payment the cashier has already collected; there is nothing to call. */
export const manualProvider: PaymentProvider = {
  name: "manual",
  charge: async ({ reference }) => ({ ok: true, reference: reference || null }),
};

export function providerFor(method: PaymentMethod): PaymentProvider {
  void method; // every method is recorded manually until a gateway is configured
  return manualProvider;
}
