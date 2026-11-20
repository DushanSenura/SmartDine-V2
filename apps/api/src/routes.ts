import { Router } from "express";

import { analyticsRouter, reportRouter } from "./modules/analytics/analytics.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { branchRouter } from "./modules/branches/branch.routes";
import { categoryRouter, menuRouter } from "./modules/menu/menu.routes";
import { customerRouter, favouriteRouter } from "./modules/customers/customer.routes";
import { housekeepingRouter } from "./modules/housekeeping/housekeeping.routes";
import { inventoryRouter, supplierRouter } from "./modules/inventory/inventory.routes";
import { kitchenRouter } from "./modules/kitchen/kitchen.routes";
import { notificationRouter } from "./modules/notifications/notification.routes";
import { orderRouter } from "./modules/orders/order.routes";
import {
  billRouter,
  folioRouter,
  paymentRouter,
  receiptRouter,
} from "./modules/payments/payment.routes";
import { healthRouter } from "./modules/health/health.routes";
import { privateDiningRouter } from "./modules/private-dining/private-dining.routes";
import { promotionRouter } from "./modules/promotions/promotion.routes";
import { publicRouter } from "./modules/public/public.routes";
import { reservationRouter } from "./modules/reservations/reservation.routes";
import { reviewRouter } from "./modules/reviews/review.routes";
import { roomBookingRouter } from "./modules/room-bookings/booking.routes";
import { extraRouter, roomRouter, roomTypeRouter } from "./modules/rooms/room.routes";
import { searchRouter } from "./modules/search/search.routes";
import { serviceRequestRouter } from "./modules/service-requests/service-request.routes";
import { tableOrderRouter } from "./modules/table-orders/table-order.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { shiftRouter } from "./modules/shifts/shift.routes";
import { staffRouter } from "./modules/staff/staff.routes";
import { tableRouter } from "./modules/tables/table.routes";
import { userRouter } from "./modules/users/user.routes";

/** Mounts every domain module under /api/v2. Each module owns its own router. */
export const apiRouter: Router = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/branches", branchRouter);
apiRouter.use("/staff", staffRouter);
apiRouter.use("/shifts", shiftRouter);
apiRouter.use("/tables", tableRouter);
apiRouter.use("/private-dining", privateDiningRouter);
apiRouter.use("/menu", menuRouter);
apiRouter.use("/categories", categoryRouter);
apiRouter.use("/reservations", reservationRouter);
apiRouter.use("/public", publicRouter);
apiRouter.use("/room-types", roomTypeRouter);
apiRouter.use("/rooms", roomRouter);
apiRouter.use("/room-extras", extraRouter);
apiRouter.use("/room-bookings", roomBookingRouter);
apiRouter.use("/housekeeping", housekeepingRouter);
apiRouter.use("/orders", orderRouter);
apiRouter.use("/kitchen", kitchenRouter);
apiRouter.use("/service-requests", serviceRequestRouter);
apiRouter.use("/table-orders", tableOrderRouter);
apiRouter.use("/bills", billRouter);
apiRouter.use("/payments", paymentRouter);
apiRouter.use("/receipts", receiptRouter);
apiRouter.use("/folios", folioRouter);
apiRouter.use("/inventory", inventoryRouter);
apiRouter.use("/suppliers", supplierRouter);
apiRouter.use("/customers", customerRouter);
apiRouter.use("/favourites", favouriteRouter);
apiRouter.use("/promotions", promotionRouter);
apiRouter.use("/reviews", reviewRouter);
apiRouter.use("/notifications", notificationRouter);
apiRouter.use("/audit", auditRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/reports", reportRouter);
apiRouter.use("/search", searchRouter);
