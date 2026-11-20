import { describe, expect, it } from "vitest";

import { Permissions, Roles, ROLE_PERMISSIONS, roleHasPermission } from "./rbac";

describe("role matrix", () => {
  it("gives the owner every permission", () => {
    for (const permission of Object.values(Permissions)) {
      expect(roleHasPermission(Roles.OWNER, permission)).toBe(true);
    }
  });

  it("keeps kitchen staff away from financial permissions", () => {
    expect(roleHasPermission(Roles.KITCHEN, Permissions.PAYMENTS_PROCESS)).toBe(false);
    expect(roleHasPermission(Roles.KITCHEN, Permissions.REPORTS_VIEW)).toBe(false);
  });

  it("lets only owner and manager give large discounts", () => {
    const discounters = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes(Permissions.PAYMENTS_DISCOUNT))
      .map(([role]) => role)
      .sort();
    expect(discounters).toEqual(["MANAGER", "OWNER"]);
  });

  it("only lets owner and cashier refund", () => {
    const refunders = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes(Permissions.PAYMENTS_REFUND))
      .map(([role]) => role)
      .sort();
    expect(refunders).toEqual(["CASHIER", "OWNER"]);
  });

  it("gives customers no staff permissions", () => {
    expect(ROLE_PERMISSIONS.CUSTOMER).toHaveLength(0);
  });
});
