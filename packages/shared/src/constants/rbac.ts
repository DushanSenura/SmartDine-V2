/** Roles. Order is irrelevant; `CUSTOMER` is the only non-staff role. */
export const Roles = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  WAITER: "WAITER",
  KITCHEN: "KITCHEN",
  CASHIER: "CASHIER",
  CUSTOMER: "CUSTOMER",
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];
export const ROLE_VALUES = Object.values(Roles) as [Role, ...Role[]];
export const STAFF_ROLES = ROLE_VALUES.filter((role) => role !== Roles.CUSTOMER);

/**
 * Permission keys (`resource:action`). Later phases attach the endpoints that enforce them;
 * the catalogue is defined up front so the role matrix is reviewed in one place.
 */
export const Permissions = {
  USERS_MANAGE: "users:manage",
  STAFF_MANAGE: "staff:manage",
  BRANCHES_MANAGE: "branches:manage",
  SETTINGS_MANAGE: "settings:manage",
  AUDIT_VIEW: "audit:view",
  REPORTS_VIEW: "reports:view",
  CUSTOMERS_MANAGE: "customers:manage",
  PROMOTIONS_MANAGE: "promotions:manage",
  MENU_MANAGE: "menu:manage",
  MENU_AVAILABILITY: "menu:availability",
  TABLES_MANAGE: "tables:manage",
  TABLES_VIEW: "tables:view",
  TABLES_STATUS: "tables:status",
  RESERVATIONS_MANAGE: "reservations:manage",
  ROOMS_MANAGE: "rooms:manage",
  HOUSEKEEPING_UPDATE: "housekeeping:update",
  INVENTORY_MANAGE: "inventory:manage",
  ORDERS_CREATE: "orders:create",
  ORDERS_APPROVE: "orders:approve",
  ORDERS_VIEW: "orders:view",
  ORDERS_SERVE: "orders:serve",
  KITCHEN_OPERATE: "kitchen:operate",
  PAYMENTS_PROCESS: "payments:process",
  PAYMENTS_REFUND: "payments:refund",
  PAYMENTS_DISCOUNT: "payments:discount",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];
export const PERMISSION_VALUES = Object.values(Permissions) as Permission[];

const P = Permissions;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: PERMISSION_VALUES,
  MANAGER: [
    P.STAFF_MANAGE,
    P.REPORTS_VIEW,
    P.CUSTOMERS_MANAGE,
    P.PROMOTIONS_MANAGE,
    P.MENU_MANAGE,
    P.MENU_AVAILABILITY,
    P.TABLES_MANAGE,
    P.TABLES_VIEW,
    P.TABLES_STATUS,
    P.RESERVATIONS_MANAGE,
    P.ROOMS_MANAGE,
    P.HOUSEKEEPING_UPDATE,
    P.INVENTORY_MANAGE,
    P.ORDERS_CREATE,
    P.ORDERS_APPROVE,
    P.ORDERS_VIEW,
    P.ORDERS_SERVE,
    P.KITCHEN_OPERATE,
    P.PAYMENTS_PROCESS,
    P.PAYMENTS_DISCOUNT,
  ],
  WAITER: [
    P.HOUSEKEEPING_UPDATE,
    P.TABLES_VIEW,
    P.TABLES_STATUS,
    P.ORDERS_CREATE,
    P.ORDERS_APPROVE,
    P.ORDERS_VIEW,
    P.ORDERS_SERVE,
    P.RESERVATIONS_MANAGE,
  ],
  // The kitchen works from ticket endpoints that carry no prices, so it has no general order access.
  KITCHEN: [P.KITCHEN_OPERATE, P.MENU_AVAILABILITY],
  CASHIER: [P.ORDERS_VIEW, P.PAYMENTS_PROCESS, P.PAYMENTS_REFUND],
  CUSTOMER: [],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Roles a given role may assign when creating staff accounts. */
export const ASSIGNABLE_ROLES: Record<Role, readonly Role[]> = {
  OWNER: [Roles.MANAGER, Roles.WAITER, Roles.KITCHEN, Roles.CASHIER, Roles.OWNER],
  MANAGER: [Roles.WAITER, Roles.KITCHEN, Roles.CASHIER],
  WAITER: [],
  KITCHEN: [],
  CASHIER: [],
  CUSTOMER: [],
};
