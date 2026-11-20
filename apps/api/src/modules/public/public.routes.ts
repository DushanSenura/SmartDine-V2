import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/database";
import { publicRateLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { sendSuccess } from "../../shared/http/response";
import { toNumber } from "../../utils/prisma";
import { branchInclude, toBranchDto } from "../branches/branch.mapper";
import { promotionService } from "../promotions/promotion.service";
import { reviewService } from "../reviews/review.service";
import { settingsService } from "../settings/settings.service";

const branchQuery = z.object({ branchId: z.uuid() });

/** Anonymous endpoints that power the marketing site. Only customer-safe fields are exposed. */
export const publicRouter: Router = Router();
publicRouter.use(publicRateLimiter);

publicRouter.get(
  "/branches",
  asyncHandler(async (_req, res) => {
    const branches = await prisma.branch.findMany({
      where: { deletedAt: null, status: { not: "CLOSED" } },
      include: branchInclude,
      orderBy: { name: "asc" },
    });
    // Manager identity is internal.
    sendSuccess(
      res,
      branches.map((b) => ({ ...toBranchDto(b), managerId: null, managerName: null })),
    );
  }),
);

publicRouter.get(
  "/company",
  asyncHandler(async (_req, res) => {
    const { company, settings } = await settingsService.get();
    sendSuccess(res, {
      name: company.name,
      logoUrl: company.logoUrl,
      phone: company.phone,
      email: company.email,
      address: company.address,
      currency: company.currency,
      reservationDurationMinutes: settings.reservationDurationMinutes,
      cancellationWindowHours: settings.cancellationWindowHours,
    });
  }),
);

publicRouter.get(
  "/private-rooms",
  validate("query", branchQuery),
  asyncHandler(async (req, res) => {
    const { branchId } = req.query as z.infer<typeof branchQuery>;
    const rooms = await prisma.privateDiningRoom.findMany({
      where: { branchId, deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
    });
    sendSuccess(
      res,
      rooms.map((room) => ({
        id: room.id,
        branchId: room.branchId,
        name: room.name,
        description: room.description,
        capacity: room.capacity,
        minimumGuests: room.minimumGuests,
        maximumGuests: room.maximumGuests,
        images: room.images,
        amenities: room.amenities,
        minimumSpend: toNumber(room.minimumSpend),
        hourlyRate: toNumber(room.hourlyRate),
        deposit: toNumber(room.deposit),
        specialRules: room.specialRules,
      })),
    );
  }),
);

/** Photos the restaurant has uploaded for dishes and rooms, for the gallery page. */
publicRouter.get(
  "/gallery",
  validate("query", branchQuery),
  asyncHandler(async (req, res) => {
    const { branchId } = req.query as z.infer<typeof branchQuery>;
    const [items, rooms] = await Promise.all([
      prisma.menuItem.findMany({
        where: { branchId, deletedAt: null, image: { not: null } },
        select: { name: true, image: true },
        take: 24,
      }),
      prisma.privateDiningRoom.findMany({
        where: { branchId, deletedAt: null, isActive: true },
        select: { name: true, images: true },
      }),
    ]);
    sendSuccess(res, [
      ...items.map((i) => ({ src: i.image!, caption: i.name })),
      ...rooms.flatMap((r) => r.images.map((src) => ({ src, caption: r.name }))),
    ]);
  }),
);

publicRouter.get(
  "/offers",
  validate("query", branchQuery),
  asyncHandler(async (req, res) => {
    const { branchId } = req.query as z.infer<typeof branchQuery>;
    sendSuccess(res, await promotionService.publicOffers(branchId));
  }),
);

publicRouter.get(
  "/reviews",
  validate("query", branchQuery),
  asyncHandler(async (req, res) => {
    const { branchId } = req.query as z.infer<typeof branchQuery>;
    sendSuccess(res, await reviewService.publicSummary(branchId));
  }),
);
