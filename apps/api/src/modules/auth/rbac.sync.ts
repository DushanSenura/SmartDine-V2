import { PERMISSION_VALUES, ROLE_PERMISSIONS, ROLE_VALUES, type Role } from "@smartdine/shared";
import type { PrismaClient } from "@prisma/client";

/**
 * Persists the role/permission matrix from `@smartdine/shared` (the single source of truth).
 * Idempotent; run from the seed script and from integration-test setup.
 */
export async function syncRbac(prisma: PrismaClient): Promise<void> {
  for (const key of PERMISSION_VALUES) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const permissions = await prisma.permission.findMany();
  const permissionIds = new Map(permissions.map((p) => [p.key, p.id]));

  for (const name of ROLE_VALUES) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    const wanted = ROLE_PERMISSIONS[name as Role].map((key) => permissionIds.get(key)!);
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: wanted } },
    });
    await prisma.rolePermission.createMany({
      data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
}
