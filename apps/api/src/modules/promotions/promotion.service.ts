import type { PromotionDto, PromotionInput, PublicOfferDto } from "@smartdine/shared";
import type { Prisma, Promotion } from "@prisma/client";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { AppError } from "../../shared/errors/AppError";
import type { AuthContext } from "../../types/express";
import { parseDateOnly } from "../../utils/dates";
import { isUniqueViolation } from "../../utils/prisma";

const dateText = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function companyToday() {
  const company = await prisma.company.findFirst({ where: { deletedAt: null } });
  return new Intl.DateTimeFormat("en-CA", { timeZone: company?.timezone ?? "UTC" }).format(
    new Date(),
  );
}

/** Active, inside its dates, and not out of uses. */
export function isLive(p: Promotion, today: string): boolean {
  if (!p.active || p.deletedAt) return false;
  if (p.startsOn && dateText(p.startsOn)! > today) return false;
  if (p.endsOn && dateText(p.endsOn)! < today) return false;
  return p.usageLimit === null || p.usedCount < p.usageLimit;
}

export function toPromotionDto(p: Promotion, today: string): PromotionDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    code: p.code,
    type: p.type,
    value: Number(p.value),
    startsOn: dateText(p.startsOn),
    endsOn: dateText(p.endsOn),
    minimumSpend: Number(p.minimumSpend),
    usageLimit: p.usageLimit,
    usedCount: p.usedCount,
    branchIds: p.branchIds,
    customerIds: p.customerIds,
    daysOfWeek: p.daysOfWeek,
    startTime: p.startTime,
    endTime: p.endTime,
    active: p.active,
    live: isLive(p, today),
  };
}

/** Owners manage every promotion; a manager only those confined to their own branch. */
function assertManageable(auth: AuthContext, branchIds: string[]) {
  if (auth.role === "OWNER") return;
  if (!auth.branchId || branchIds.length !== 1 || branchIds[0] !== auth.branchId) {
    throw AppError.forbidden(
      "Managers can only manage promotions that are limited to their branch.",
    );
  }
}

function data(input: Partial<PromotionInput>): Prisma.PromotionUncheckedUpdateInput {
  const { startsOn, endsOn, ...rest } = input;
  return {
    ...rest,
    ...(startsOn !== undefined && { startsOn: startsOn ? parseDateOnly(startsOn) : null }),
    ...(endsOn !== undefined && { endsOn: endsOn ? parseDateOnly(endsOn) : null }),
  };
}

const codeTaken = () =>
  AppError.conflict("PROMO_CODE_TAKEN", "Another promotion already uses that code.");

export const promotionService = {
  async list(auth: AuthContext): Promise<PromotionDto[]> {
    const today = await companyToday();
    const promotions = await prisma.promotion.findMany({
      where: {
        deletedAt: null,
        // A manager sees company-wide promotions and those for their own branch.
        ...(auth.role !== "OWNER" && {
          OR: [{ branchIds: { isEmpty: true } }, { branchIds: { has: auth.branchId ?? "" } }],
        }),
      },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });
    return promotions.map((p) => toPromotionDto(p, today));
  },

  async create(auth: AuthContext, input: PromotionInput) {
    assertManageable(auth, input.branchIds);
    try {
      const created = await prisma.promotion.create({
        data: data(input) as Prisma.PromotionUncheckedCreateInput,
      });
      void audit(auth, {
        action: "promotion.created",
        entity: "promotion",
        entityId: created.id,
        newValue: {
          name: created.name,
          code: created.code,
          type: created.type,
          value: Number(created.value),
        },
      });
      return toPromotionDto(created, await companyToday());
    } catch (error) {
      if (isUniqueViolation(error)) throw codeTaken();
      throw error;
    }
  },

  async update(auth: AuthContext, id: string, input: Partial<PromotionInput>) {
    const existing = await prisma.promotion.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound("Promotion not found.");
    assertManageable(auth, existing.branchIds);
    if (input.branchIds) assertManageable(auth, input.branchIds);
    try {
      const updated = await prisma.promotion.update({ where: { id }, data: data(input) });
      void audit(auth, {
        action: "promotion.updated",
        entity: "promotion",
        entityId: id,
        previousValue: {
          name: existing.name,
          value: Number(existing.value),
          active: existing.active,
        },
        newValue: { name: updated.name, value: Number(updated.value), active: updated.active },
      });
      return toPromotionDto(updated, await companyToday());
    } catch (error) {
      if (isUniqueViolation(error)) throw codeTaken();
      throw error;
    }
  },

  /** Archived rather than deleted: bills that used it still point at it. */
  async remove(auth: AuthContext, id: string) {
    const existing = await prisma.promotion.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound("Promotion not found.");
    assertManageable(auth, existing.branchIds);
    // The code is freed so it can be reused.
    await prisma.promotion.update({
      where: { id },
      data: { deletedAt: new Date(), active: false, code: null },
    });
    void audit(auth, {
      action: "promotion.archived",
      entity: "promotion",
      entityId: id,
      previousValue: { name: existing.name, code: existing.code },
    });
  },

  /** What guests may see: live, public (not customer-restricted) offers for a branch. No codes or limits. */
  async publicOffers(branchId: string): Promise<PublicOfferDto[]> {
    const today = await companyToday();
    const promotions = await prisma.promotion.findMany({
      where: {
        deletedAt: null,
        active: true,
        customerIds: { isEmpty: true },
        OR: [{ branchIds: { isEmpty: true } }, { branchIds: { has: branchId } }],
      },
      orderBy: { createdAt: "desc" },
    });
    return promotions
      .filter((p) => isLive(p, today))
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        type: p.type,
        value: Number(p.value),
        startsOn: dateText(p.startsOn),
        endsOn: dateText(p.endsOn),
        minimumSpend: Number(p.minimumSpend),
        daysOfWeek: p.daysOfWeek,
        startTime: p.startTime,
        endTime: p.endTime,
      }));
  },
};
