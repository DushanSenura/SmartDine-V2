import { Permissions, type Permission, type Role } from "@smartdine/shared";
import {
  Banknote,
  BedDouble,
  Boxes,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChefHat,
  ClipboardList,
  Contact,
  DoorOpen,
  LayoutDashboard,
  LayoutGrid,
  MessageSquareText,
  Receipt,
  ScrollText,
  Settings,
  SprayCan,
  Tag,
  Truck,
  UserRound,
  Users,
  Users2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import { ROLE_HOME } from "@/features/auth/utils/roleHome";

/** Sidebar sections, in the order they appear. */
export const NAV_GROUPS = [
  "Overview",
  "Restaurant",
  "Payments",
  "Stays",
  "Menu & guests",
  "Inventory",
  "Team",
  "Business",
  "Account",
] as const;

export type NavGroup = (typeof NAV_GROUPS)[number];

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** The sidebar section this item sits under. */
  group: NavGroup;
  /** Item is hidden unless the signed-in role holds this permission. */
  permission?: Permission;
}

/**
 * Role-aware sidebar; items are filtered by the user's permissions. Listed in reading order:
 * daily service first, then money, stays, the catalogue, back office and the account.
 */
export function navItemsFor(role: Role): NavItem[] {
  const items: NavItem[] = [
    { label: "Dashboard", to: ROLE_HOME[role], icon: LayoutDashboard, group: "Overview" },

    // Restaurant: what happens on the floor today.
    {
      label: "Orders",
      to: "/app/orders",
      icon: ClipboardList,
      group: "Restaurant",
      permission: Permissions.ORDERS_VIEW,
    },
    {
      label: "Kitchen",
      to: "/app/kitchen",
      icon: ChefHat,
      group: "Restaurant",
      permission: Permissions.KITCHEN_OPERATE,
    },
    {
      label: "Floor plan",
      to: "/app/floor-plan",
      icon: LayoutGrid,
      group: "Restaurant",
      permission: Permissions.TABLES_VIEW,
    },
    {
      label: "Reservations",
      to: "/app/reservations",
      icon: CalendarDays,
      group: "Restaurant",
      permission: Permissions.RESERVATIONS_MANAGE,
    },
    {
      label: "Private dining",
      to: "/app/private-dining",
      icon: Users2,
      group: "Restaurant",
      permission: Permissions.TABLES_MANAGE,
    },

    // Payments
    {
      label: "Cashier",
      to: "/app/cashier",
      icon: Receipt,
      group: "Payments",
      permission: Permissions.PAYMENTS_PROCESS,
    },
    {
      label: "Payments",
      to: "/app/payments",
      icon: Banknote,
      group: "Payments",
      permission: Permissions.PAYMENTS_PROCESS,
    },

    // Stays
    {
      label: "Rooms",
      to: "/app/rooms",
      icon: BedDouble,
      group: "Stays",
      permission: Permissions.ROOMS_MANAGE,
    },
    {
      label: "Room bookings",
      to: "/app/rooms/bookings",
      icon: CalendarCheck,
      group: "Stays",
      permission: Permissions.ROOMS_MANAGE,
    },
    {
      label: "Room inventory",
      to: "/app/rooms/inventory",
      icon: DoorOpen,
      group: "Stays",
      permission: Permissions.ROOMS_MANAGE,
    },
    {
      label: "Room types",
      to: "/app/rooms/types",
      icon: LayoutGrid,
      group: "Stays",
      permission: Permissions.ROOMS_MANAGE,
    },
    {
      label: "Housekeeping",
      to: "/app/housekeeping",
      icon: SprayCan,
      group: "Stays",
      permission: Permissions.HOUSEKEEPING_UPDATE,
    },

    // Menu & guests
    {
      label: "Menu",
      to: "/app/menu",
      icon: UtensilsCrossed,
      group: "Menu & guests",
      permission: Permissions.MENU_AVAILABILITY,
    },
    {
      label: "Promotions",
      to: "/app/promotions",
      icon: Tag,
      group: "Menu & guests",
      permission: Permissions.PROMOTIONS_MANAGE,
    },
    {
      label: "Customers",
      to: "/app/customers",
      icon: Contact,
      group: "Menu & guests",
      permission: Permissions.CUSTOMERS_MANAGE,
    },
    {
      label: "Reviews",
      to: "/app/reviews",
      icon: MessageSquareText,
      group: "Menu & guests",
      permission: Permissions.CUSTOMERS_MANAGE,
    },

    // Inventory
    {
      label: "Stock",
      to: "/app/inventory",
      icon: Boxes,
      group: "Inventory",
      permission: Permissions.INVENTORY_MANAGE,
    },
    {
      label: "Suppliers",
      to: "/app/suppliers",
      icon: Truck,
      group: "Inventory",
      permission: Permissions.INVENTORY_MANAGE,
    },

    // Team
    {
      label: "Staff",
      to: "/app/staff",
      icon: Users,
      group: "Team",
      permission: Permissions.STAFF_MANAGE,
    },
    {
      label: "Shifts",
      to: "/app/shifts",
      icon: CalendarClock,
      group: "Team",
      permission: Permissions.STAFF_MANAGE,
    },

    // Business
    {
      label: "Reports",
      to: "/app/reports",
      icon: ChartColumn,
      group: "Business",
      permission: Permissions.REPORTS_VIEW,
    },
    {
      label: "Branches",
      to: "/app/branches",
      icon: Building2,
      group: "Business",
      permission: Permissions.BRANCHES_MANAGE,
    },
    {
      label: "Audit log",
      to: "/app/audit",
      icon: ScrollText,
      group: "Business",
      permission: Permissions.AUDIT_VIEW,
    },
    {
      label: "Settings",
      to: "/app/settings",
      icon: Settings,
      group: "Business",
      permission: Permissions.SETTINGS_MANAGE,
    },

    // Account
    { label: "My profile", to: "/app/profile", icon: UserRound, group: "Account" },
  ];
  // A role's own home already is its dashboard; don't list the same page twice.
  return items.filter((item) => item.label === "Dashboard" || item.to !== ROLE_HOME[role]);
}
