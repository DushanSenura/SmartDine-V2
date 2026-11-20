import type {
  CreateReviewInput,
  ModerateReviewInput,
  ReviewableDto,
  ReviewDto,
  ReviewStatus,
  ReviewSummaryDto,
} from "@smartdine/shared";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/database";
import { audit } from "../audit/audit.service";
import { AppError } from "../../shared/errors/AppError";
import { assertBranchAccess, requireBranch } from "../../shared/auth/branchAccess";
import type { AuthContext } from "../../types/express";
import { isUniqueViolation } from "../../utils/prisma";

const reviewInclude = {
  user: { select: { firstName: true, lastName: true } },
  branch: { select: { name: true } },
} satisfies Prisma.ReviewInclude;
type ReviewRecord = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

/** "Ada L." — reviews are public, so only a first name and an initial are shown. */
const publicName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName.slice(0, 1)}.`;

const toDto = (r: ReviewRecord, full: boolean): ReviewDto => ({
  id: r.id,
  kind: r.kind,
  rating: r.rating,
  comment: r.comment,
  status: r.status,
  response: r.response,
  respondedAt: r.respondedAt?.toISOString() ?? null,
  authorName: full ? `${r.user.firstName} ${r.user.lastName}` : publicName(r.user),
  branchName: r.branch.name,
  createdAt: r.createdAt.toISOString(),
});

const alreadyReviewed = () =>
  AppError.conflict("ALREADY_REVIEWED", "You have already reviewed this visit.");

export const reviewService = {
  /** Paid bills and finished stays that have not been reviewed yet. */
  async reviewable(auth: AuthContext): Promise<ReviewableDto[]> {
    const [bills, stays] = await Promise.all([
      prisma.bill.findMany({
        where: { customerId: auth.userId, status: "PAID", reviews: { none: {} } },
        include: { branch: { select: { name: true } } },
        orderBy: { paidAt: "desc" },
        take: 20,
      }),
      prisma.roomBooking.findMany({
        where: { userId: auth.userId, bookingStatus: "CHECKED_OUT", reviews: { none: {} } },
        include: { branch: { select: { name: true } } },
        orderBy: { checkOutDate: "desc" },
        take: 20,
      }),
    ]);
    return [
      ...bills.map((b) => ({
        kind: "DINING" as const,
        billId: b.id,
        label: `Dining at ${b.branch.name}`,
        date: (b.paidAt ?? b.createdAt).toISOString(),
      })),
      ...stays.map((s) => ({
        kind: "STAY" as const,
        bookingId: s.id,
        label: `Stay at ${s.branch.name}`,
        date: s.checkOutDate.toISOString(),
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
  },

  async create(auth: AuthContext, input: CreateReviewInput) {
    let branchId: string;
    if (input.kind === "DINING") {
      const bill = await prisma.bill.findFirst({
        where: { id: input.billId, customerId: auth.userId, status: "PAID" },
      });
      if (!bill) throw AppError.notFound("That visit isn't on your account, or isn't paid yet.");
      branchId = bill.branchId;
    } else {
      const stay = await prisma.roomBooking.findFirst({
        where: { id: input.bookingId, userId: auth.userId, bookingStatus: "CHECKED_OUT" },
      });
      if (!stay) throw AppError.notFound("That stay isn't on your account, or isn't finished yet.");
      branchId = stay.branchId;
    }
    try {
      const review = await prisma.review.create({
        data: {
          userId: auth.userId,
          branchId,
          kind: input.kind,
          billId: input.billId ?? null,
          bookingId: input.bookingId ?? null,
          rating: input.rating,
          comment: input.comment ?? null,
        },
        include: reviewInclude,
      });
      return toDto(review, true);
    } catch (error) {
      if (isUniqueViolation(error)) throw alreadyReviewed();
      throw error;
    }
  },

  async mine(auth: AuthContext): Promise<ReviewDto[]> {
    const reviews = await prisma.review.findMany({
      where: { userId: auth.userId },
      include: reviewInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return reviews.map((r) => toDto(r, true));
  },

  async list(auth: AuthContext, query: { branchId?: string; status?: ReviewStatus }) {
    const branchId = requireBranch(auth, query.branchId);
    const reviews = await prisma.review.findMany({
      where: { branchId, ...(query.status && { status: query.status }) },
      include: reviewInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return reviews.map((r) => toDto(r, true));
  },

  async moderate(auth: AuthContext, id: string, input: ModerateReviewInput) {
    const existing = await prisma.review.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Review not found.");
    assertBranchAccess(auth, existing.branchId);
    const review = await prisma.review.update({
      where: { id },
      data: {
        ...(input.status && { status: input.status }),
        ...(input.response !== undefined && {
          response: input.response,
          respondedById: input.response ? auth.userId : null,
          respondedAt: input.response ? new Date() : null,
        }),
      },
      include: reviewInclude,
    });
    void audit(auth, {
      action: "review.moderated",
      entity: "review",
      entityId: id,
      branchId: existing.branchId,
      previousValue: { status: existing.status },
      newValue: { status: review.status, replied: input.response !== undefined },
    });
    return toDto(review, true);
  },

  /** What the website shows: the average and the latest published reviews. */
  async publicSummary(branchId: string): Promise<ReviewSummaryDto> {
    const where = { branchId, status: "PUBLISHED" as const };
    const [aggregate, latest] = await Promise.all([
      prisma.review.aggregate({ where, _avg: { rating: true }, _count: true }),
      prisma.review.findMany({
        where,
        include: reviewInclude,
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
    ]);
    return {
      average: aggregate._avg.rating === null ? null : Math.round(aggregate._avg.rating * 10) / 10,
      count: aggregate._count,
      reviews: latest.map((r) => {
        const dto = toDto(r, false);
        return {
          id: dto.id,
          kind: dto.kind,
          rating: dto.rating,
          comment: dto.comment,
          response: dto.response,
          authorName: dto.authorName,
          createdAt: dto.createdAt,
        };
      }),
    };
  },
};
