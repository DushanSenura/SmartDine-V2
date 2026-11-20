import { Permissions } from "@smartdine/shared";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { PublicLayout } from "@/components/layout/PublicLayout";
import { RootLayout } from "@/components/layout/RootLayout";
import { StaffLayout } from "@/components/layout/StaffLayout";
import {
  GuestOnly,
  RequirePermission,
  RequireRole,
  RoleRedirect,
} from "@/features/auth/components/guards";
import { BranchesPage } from "@/features/branches/pages/BranchesPage";
import { FloorPlanPage } from "@/features/floor-plan/pages/FloorPlanPage";
import { DashboardPage } from "@/features/analytics/pages/DashboardPage";
import { ReportsPage } from "@/features/analytics/pages/ReportsPage";
import { AuditPage } from "@/features/audit/pages/AuditPage";
import { BillPage } from "@/features/cashier/pages/BillPage";
import { CashierDashboard } from "@/features/cashier/pages/CashierDashboard";
import { PaymentsHistoryPage } from "@/features/cashier/pages/PaymentsHistoryPage";
import { ReceiptPage } from "@/features/cashier/pages/ReceiptPage";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import {
  AccountFavouritesPage,
  AccountInvoicesPage,
  AccountLoyaltyPage,
  AccountReceiptPage,
  AccountReviewsPage,
} from "@/features/customers/pages/AccountPages";
import { InventoryPage } from "@/features/inventory/pages/InventoryPage";
import { StockHistoryPage } from "@/features/inventory/pages/StockHistoryPage";
import { SuppliersPage } from "@/features/inventory/pages/SuppliersPage";
import { PromotionsPage } from "@/features/promotions/pages/PromotionsPage";
import { ReviewsPage } from "@/features/reviews/pages/ReviewsPage";
import { KitchenDisplayPage } from "@/features/kitchen/pages/KitchenDisplayPage";
import { NewOrderPage } from "@/features/orders/pages/NewOrderPage";
import { OrderDetailPage } from "@/features/orders/pages/OrderDetailPage";
import { OrdersListPage } from "@/features/orders/pages/OrdersListPage";
import { WaiterDashboard } from "@/features/waiter/pages/WaiterDashboard";
import { MenuAdminPage } from "@/features/menu/pages/MenuAdminPage";
import { MenuPage } from "@/features/menu/pages/MenuPage";
import { HomePage } from "@/features/public/pages/HomePage";
import { AboutPage, ContactPage, GalleryPage, OffersPage } from "@/features/public/pages/InfoPages";
import { HousekeepingPage } from "@/features/rooms/pages/HousekeepingPage";
import { MyStaysPage } from "@/features/rooms/pages/MyStaysPage";
import { RoomBookingPage } from "@/features/rooms/pages/RoomBookingPage";
import { RoomBookingsPage } from "@/features/rooms/pages/RoomBookingsPage";
import { RoomDetailsPage } from "@/features/rooms/pages/RoomDetailsPage";
import { RoomInventoryPage } from "@/features/rooms/pages/RoomInventoryPage";
import { RoomsOverviewPage } from "@/features/rooms/pages/RoomsOverviewPage";
import { RoomsPage } from "@/features/rooms/pages/RoomsPage";
import { RoomTypesPage } from "@/features/rooms/pages/RoomTypesPage";
import { MyReservationsPage } from "@/features/reservations/pages/MyReservationsPage";
import { ReservationsPage } from "@/features/reservations/pages/ReservationsPage";
import { StaffReservationsPage } from "@/features/reservations/pages/StaffReservationsPage";
import { PrivateDiningPage } from "@/features/private-dining/pages/PrivateDiningPage";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { ShiftsPage } from "@/features/shifts/pages/ShiftsPage";
import { StaffPage } from "@/features/staff/pages/StaffPage";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { RegisterPage } from "@/features/auth/pages/RegisterPage";
import { AccountProfilePage, AccountShell } from "@/pages/customer/AccountPage";
import { ForbiddenPage, NotFoundPage } from "@/pages/public/StatusPages";
import { StaffProfilePage } from "@/pages/staff/StaffProfilePage";

const staffRoles = ["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER"] as const;

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "menu", element: <MenuPage /> },
          // Ordering lives on the menu now; keep the old address working.
          { path: "order", element: <Navigate to="/menu" replace /> },
          { path: "reservations", element: <ReservationsPage /> },
          { path: "rooms", element: <RoomsPage /> },
          { path: "rooms/:slug", element: <RoomDetailsPage /> },
          { path: "rooms/:slug/book", element: <RoomBookingPage /> },
          { path: "offers", element: <OffersPage /> },
          { path: "about", element: <AboutPage /> },
          { path: "gallery", element: <GalleryPage /> },
          { path: "contact", element: <ContactPage /> },
          {
            path: "account",
            element: <RequireRole roles={["CUSTOMER"]} />,
            children: [
              {
                element: <AccountShell />,
                children: [
                  { index: true, element: <Navigate to="reservations" replace /> },
                  { path: "reservations", element: <MyReservationsPage /> },
                  { path: "stays", element: <MyStaysPage /> },
                  { path: "favourites", element: <AccountFavouritesPage /> },
                  { path: "loyalty", element: <AccountLoyaltyPage /> },
                  { path: "invoices", element: <AccountInvoicesPage /> },
                  { path: "invoices/:id", element: <AccountReceiptPage /> },
                  { path: "reviews", element: <AccountReviewsPage /> },
                  { path: "profile", element: <AccountProfilePage /> },
                ],
              },
            ],
          },
        ],
      },
      {
        element: <GuestOnly />,
        children: [
          { path: "login", element: <LoginPage /> },
          { path: "register", element: <RegisterPage /> },
        ],
      },
      {
        path: "app",
        element: <RequireRole roles={staffRoles} />,
        children: [
          { index: true, element: <RoleRedirect /> },
          {
            element: <StaffLayout />,
            children: [
              { path: "profile", element: <StaffProfilePage /> },
              {
                element: <RequirePermission permission={Permissions.MENU_AVAILABILITY} />,
                children: [{ path: "menu", element: <MenuAdminPage /> }],
              },
              {
                element: <RequirePermission permission={Permissions.RESERVATIONS_MANAGE} />,
                children: [{ path: "reservations", element: <StaffReservationsPage /> }],
              },
              {
                element: <RequirePermission permission={Permissions.ROOMS_MANAGE} />,
                children: [
                  { path: "rooms", element: <RoomsOverviewPage /> },
                  { path: "rooms/bookings", element: <RoomBookingsPage /> },
                  { path: "rooms/inventory", element: <RoomInventoryPage /> },
                  { path: "rooms/types", element: <RoomTypesPage /> },
                ],
              },
              {
                element: <RequirePermission permission={Permissions.HOUSEKEEPING_UPDATE} />,
                children: [{ path: "housekeeping", element: <HousekeepingPage /> }],
              },
              {
                element: <RequirePermission permission={Permissions.TABLES_VIEW} />,
                children: [{ path: "floor-plan", element: <FloorPlanPage /> }],
              },
              {
                element: <RequirePermission permission={Permissions.TABLES_MANAGE} />,
                children: [{ path: "private-dining", element: <PrivateDiningPage /> }],
              },
              {
                element: <RequirePermission permission={Permissions.STAFF_MANAGE} />,
                children: [
                  { path: "staff", element: <StaffPage /> },
                  { path: "shifts", element: <ShiftsPage /> },
                ],
              },
              {
                element: <RequirePermission permission={Permissions.BRANCHES_MANAGE} />,
                children: [{ path: "branches", element: <BranchesPage /> }],
              },
              {
                element: <RequirePermission permission={Permissions.SETTINGS_MANAGE} />,
                children: [{ path: "settings", element: <SettingsPage /> }],
              },
              {
                element: <RequirePermission permission={Permissions.ORDERS_VIEW} />,
                children: [
                  { path: "orders", element: <OrdersListPage /> },
                  { path: "orders/:id", element: <OrderDetailPage /> },
                ],
              },
              {
                element: <RequirePermission permission={Permissions.ORDERS_CREATE} />,
                children: [{ path: "orders/new", element: <NewOrderPage /> }],
              },
              {
                element: <RequirePermission permission={Permissions.KITCHEN_OPERATE} />,
                children: [{ path: "kitchen", element: <KitchenDisplayPage /> }],
              },
              {
                element: <RequirePermission permission={Permissions.PAYMENTS_PROCESS} />,
                children: [
                  { path: "cashier", element: <CashierDashboard /> },
                  { path: "cashier/bills/:id", element: <BillPage /> },
                  { path: "payments", element: <PaymentsHistoryPage /> },
                  { path: "receipts/:id", element: <ReceiptPage /> },
                ],
              },
              {
                element: <RequirePermission permission={Permissions.INVENTORY_MANAGE} />,
                children: [
                  { path: "inventory", element: <InventoryPage /> },
                  { path: "inventory/history", element: <StockHistoryPage /> },
                  { path: "suppliers", element: <SuppliersPage /> },
                ],
              },
              {
                element: <RequirePermission permission={Permissions.CUSTOMERS_MANAGE} />,
                children: [
                  { path: "customers", element: <CustomersPage /> },
                  { path: "customers/:id", element: <CustomerDetailPage /> },
                  { path: "reviews", element: <ReviewsPage /> },
                ],
              },
              {
                element: <RequirePermission permission={Permissions.PROMOTIONS_MANAGE} />,
                children: [{ path: "promotions", element: <PromotionsPage /> }],
              },
              {
                path: "waiter",
                element: <RequireRole roles={["WAITER"]} />,
                children: [{ index: true, element: <WaiterDashboard /> }],
              },
              ...(["OWNER", "MANAGER"] as const).map((role) => ({
                path: role.toLowerCase(),
                element: <RequireRole roles={[role]} />,
                children: [{ index: true, element: <DashboardPage /> }],
              })),
              {
                element: <RequirePermission permission={Permissions.REPORTS_VIEW} />,
                children: [{ path: "reports", element: <ReportsPage /> }],
              },
              {
                element: <RequirePermission permission={Permissions.AUDIT_VIEW} />,
                children: [{ path: "audit", element: <AuditPage /> }],
              },
            ],
          },
        ],
      },
      { path: "forbidden", element: <ForbiddenPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
