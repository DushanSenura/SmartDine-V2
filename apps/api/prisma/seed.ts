import { Roles, type Role } from "@smartdine/shared";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

import { syncRbac } from "../src/modules/auth/rbac.sync";
import {
  seedDemoMenu,
  seedDemoModifiers,
  seedMenuReferenceData,
  seedMoreDemoMenu,
} from "./seed.menu";
import { seedDemoOperations } from "./seed.operations";
import { seedDemoRooms } from "./seed.rooms";

const prisma = new PrismaClient();
const isProduction = process.env.NODE_ENV === "production";

async function ensureUser(
  email: string,
  password: string,
  role: Role,
  names: [string, string],
  branchId?: string,
  employeeId?: string,
) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      firstName: names[0],
      lastName: names[1],
      branch: branchId ? { connect: { id: branchId } } : undefined,
      role: { connect: { name: role } },
      staffProfile: employeeId && role !== Roles.CUSTOMER ? { create: { employeeId } } : undefined,
    },
  });
}

/** Idempotent baseline data: company, flagship branch, RBAC matrix, shifts and initial accounts. */
async function main() {
  const existing = await prisma.company.findFirst({ where: { name: "SmartDine" } });
  const company =
    existing ??
    (await prisma.company.create({
      data: { name: "SmartDine", currency: "LKR", timezone: "Asia/Colombo" },
    }));
  await prisma.companySettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: { companyId: company.id },
  });

  const details = {
    address: "12 Galle Road, Colombo 03",
    phone: "+94 11 234 5678",
    email: "colombo@smartdine.test",
    openingHours: {
      mon: { open: "10:00", close: "22:00" },
      tue: { open: "10:00", close: "22:00" },
      wed: { open: "10:00", close: "22:00" },
      thu: { open: "10:00", close: "22:00" },
      fri: { open: "10:00", close: "23:00" },
      sat: { open: "08:00", close: "23:00" },
      sun: { open: "08:00", close: "22:00" },
    },
  };
  const upserted = await prisma.branch.upsert({
    where: { code: "COL-01" },
    update: {},
    create: {
      companyId: company.id,
      name: "SmartDine Colombo",
      code: "COL-01",
      city: "Colombo",
      timezone: company.timezone,
      currency: company.currency,
      ...details,
    },
  });
  // Branches seeded before opening hours existed get them now (never overwrites edits).
  const branch = upserted.openingHours
    ? upserted
    : await prisma.branch.update({ where: { id: upserted.id }, data: details });

  await syncRbac(prisma);
  await seedMenuReferenceData(prisma);

  for (const [name, startTime, endTime] of [
    ["Morning", "06:00", "14:00"],
    ["Evening", "14:00", "22:00"],
    ["Night", "22:00", "06:00"],
  ] as const) {
    await prisma.shift.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: {},
      create: { companyId: company.id, name, startTime, endTime },
    });
  }

  if (isProduction) {
    const { SEED_OWNER_EMAIL: email, SEED_OWNER_PASSWORD: password } = process.env;
    if (!email || !password) {
      console.warn("Skipping owner creation: set SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD.");
      return;
    }
    await ensureUser(email.toLowerCase(), password, Roles.OWNER, ["Owner", "Account"]);
    return;
  }

  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error("Set SEED_DEMO_PASSWORD to seed demo accounts.");
  const demo: [string, Role, [string, string], boolean, string][] = [
    ["owner@smartdine.test", Roles.OWNER, ["Olivia", "Owner"], false, "EMP-0001"],
    ["manager@smartdine.test", Roles.MANAGER, ["Marcus", "Manager"], true, "EMP-0002"],
    ["waiter@smartdine.test", Roles.WAITER, ["Wendy", "Waiter"], true, "EMP-0003"],
    ["kitchen@smartdine.test", Roles.KITCHEN, ["Kenji", "Chef"], true, "EMP-0004"],
    ["cashier@smartdine.test", Roles.CASHIER, ["Cara", "Cashier"], true, "EMP-0005"],
    ["customer@smartdine.test", Roles.CUSTOMER, ["Chris", "Customer"], false, ""],
  ];
  const users = new Map<string, string>();
  for (const [email, role, names, hasBranch, employeeId] of demo) {
    const user = await ensureUser(
      email,
      password,
      role,
      names,
      hasBranch ? branch.id : undefined,
      employeeId || undefined,
    );
    users.set(email, user.id);
  }

  await prisma.branch.update({
    where: { id: branch.id },
    data: { managerId: users.get("manager@smartdine.test") },
  });

  await seedDemoMenu(prisma, branch.id);
  await seedMoreDemoMenu(prisma, branch.id);
  await seedDemoModifiers(prisma, branch.id);
  await seedDemoRooms(prisma, branch.id);
  await seedDemoOperations(prisma, branch.id, users.get("customer@smartdine.test"));

  if ((await prisma.privateDiningRoom.count({ where: { branchId: branch.id } })) === 0) {
    await prisma.privateDiningRoom.create({
      data: {
        branchId: branch.id,
        name: "Garden Room",
        description:
          "A quiet room opening onto the courtyard, for celebrations and business dinners.",
        capacity: 20,
        minimumGuests: 6,
        maximumGuests: 16,
        amenities: ["Projector", "Sound system", "Private entrance"],
        minimumSpend: 60000,
        hourlyRate: 6000,
        deposit: 15000,
        specialRules: "Decorations must be arranged with the team in advance.",
      },
    });
  }

  // A small demo floor so the floor plan is not empty on first run.
  if ((await prisma.diningArea.count({ where: { branchId: branch.id } })) === 0) {
    const area = await prisma.diningArea.create({
      data: { branchId: branch.id, name: "Main Hall", floor: 1 },
    });
    const waiterId = users.get("waiter@smartdine.test");
    await prisma.restaurantTable.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        branchId: branch.id,
        diningAreaId: area.id,
        tableNumber: String(i + 1),
        capacity: i < 4 ? 4 : 6,
        shape: i % 3 === 2 ? ("ROUND" as const) : ("SQUARE" as const),
        positionX: 60 + (i % 3) * 180,
        positionY: 60 + Math.floor(i / 3) * 180,
        section: "Main",
        assignedWaiterId: waiterId,
      })),
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
