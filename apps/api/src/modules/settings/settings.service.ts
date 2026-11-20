import type { UpdateCompanyInput, UpdateCompanySettingsInput } from "@smartdine/shared";

import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import type { AuthContext } from "../../types/express";
import { audit } from "../audit/audit.service";

async function getCompany() {
  const company = await prisma.company.findFirst({ where: { deletedAt: null } });
  if (!company) throw AppError.notFound("Company has not been set up. Run the database seed.");
  return company;
}

const toSettingsDto = (settings: {
  taxRatePercent: unknown;
  serviceChargePercent: unknown;
  reservationDurationMinutes: number;
  cancellationWindowHours: number;
  receiptFooter: string | null;
  roomDepositPercent: unknown;
  checkInTime: string;
  checkOutTime: string;
  loyaltyEnabled: boolean;
  loyaltyCurrencyPerPoint: unknown;
  loyaltyPointValue: unknown;
  cashierDiscountLimitPercent: unknown;
  enabledPaymentMethods: string[];
}) => ({
  taxRatePercent: Number(settings.taxRatePercent),
  serviceChargePercent: Number(settings.serviceChargePercent),
  reservationDurationMinutes: settings.reservationDurationMinutes,
  cancellationWindowHours: settings.cancellationWindowHours,
  receiptFooter: settings.receiptFooter,
  roomDepositPercent: Number(settings.roomDepositPercent),
  checkInTime: settings.checkInTime,
  checkOutTime: settings.checkOutTime,
  loyaltyEnabled: settings.loyaltyEnabled,
  loyaltyCurrencyPerPoint: Number(settings.loyaltyCurrencyPerPoint),
  loyaltyPointValue: Number(settings.loyaltyPointValue),
  cashierDiscountLimitPercent: Number(settings.cashierDiscountLimitPercent),
  enabledPaymentMethods: settings.enabledPaymentMethods,
});

export const settingsService = {
  /** Company profile + operational settings (created with defaults on first read). */
  async get() {
    const company = await getCompany();
    const settings = await prisma.companySettings.upsert({
      where: { companyId: company.id },
      update: {},
      create: { companyId: company.id },
    });
    return { company, settings: toSettingsDto(settings) };
  },

  async update(
    input: { company?: UpdateCompanyInput; settings?: UpdateCompanySettingsInput },
    actor?: AuthContext,
  ) {
    const company = await getCompany();
    const before = await this.get();
    await prisma.$transaction([
      prisma.company.update({ where: { id: company.id }, data: input.company ?? {} }),
      prisma.companySettings.upsert({
        where: { companyId: company.id },
        update: input.settings ?? {},
        create: { companyId: company.id, ...input.settings },
      }),
    ]);
    const after = await this.get();
    // Only the fields that actually changed are recorded.
    const diff = (a: Record<string, unknown>, b: Record<string, unknown>, sent?: object) => {
      const previousValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      for (const key of Object.keys(sent ?? {})) {
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
          previousValue[key] = a[key];
          newValue[key] = b[key];
        }
      }
      return { previousValue, newValue };
    };
    const settingsDiff = diff(before.settings, after.settings, input.settings);
    const companyDiff = diff(before.company, after.company, input.company);
    if (
      Object.keys(settingsDiff.newValue).length > 0 ||
      Object.keys(companyDiff.newValue).length > 0
    ) {
      void audit(actor ?? null, {
        action: "settings.updated",
        entity: "settings",
        entityId: company.id,
        previousValue: { company: companyDiff.previousValue, settings: settingsDiff.previousValue },
        newValue: { company: companyDiff.newValue, settings: settingsDiff.newValue },
      });
    }
    return after;
  },
};

export { getCompany };
