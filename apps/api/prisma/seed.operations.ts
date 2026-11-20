import type { PrismaClient } from "@prisma/client";

const daysFromNow = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
};

/**
 * Demo stock, suppliers, promotions and a loyalty balance so the Phase 8 screens have something
 * to show. Only runs on an empty database, so it never overwrites what an owner has configured.
 */
export async function seedDemoOperations(
  prisma: PrismaClient,
  branchId: string,
  customerId: string | undefined,
) {
  if ((await prisma.supplier.count()) === 0) {
    const [fresh, dry] = await Promise.all([
      prisma.supplier.create({
        data: {
          name: "Lanka Fresh Produce",
          contactPerson: "Nimal Perera",
          email: "orders@lankafresh.test",
          phone: "+94 77 555 0101",
          address: "Manning Market, Colombo 11",
          products: ["vegetables", "fruit", "herbs"],
        },
      }),
      prisma.supplier.create({
        data: {
          name: "Island Provisions",
          contactPerson: "Shalini Fernando",
          email: "sales@islandprovisions.test",
          phone: "+94 71 555 0202",
          products: ["rice", "flour", "oil", "sauces", "cleaning products"],
        },
      }),
    ]);

    const items: [
      string,
      string,
      string,
      string,
      number,
      number,
      number,
      string,
      number | null,
      string,
    ][] = [
      // name, sku, category, unit, quantity, minimum, cost, supplier, expiry in days, location
      ["Basmati rice", "RICE-BAS", "Dry goods", "kg", 85, 25, 340, "dry", null, "Dry store A1"],
      ["Plain flour", "FLOUR-PL", "Dry goods", "kg", 18, 20, 120, "dry", null, "Dry store A2"],
      ["Coconut oil", "OIL-COC", "Dry goods", "l", 0, 10, 780, "dry", null, "Dry store B1"],
      ["Tomatoes", "VEG-TOM", "Vegetables", "kg", 22, 10, 260, "fresh", 3, "Cold room"],
      ["Red onions", "VEG-ONI", "Vegetables", "kg", 40, 15, 190, "fresh", 14, "Dry store C1"],
      ["Fresh basil", "HERB-BAS", "Vegetables", "kg", 2, 1, 1800, "fresh", 4, "Cold room"],
      ["Chicken breast", "MEAT-CHK", "Meat", "kg", 30, 12, 1150, "fresh", 5, "Freezer 1"],
      ["Tiger prawns", "SEA-PRN", "Seafood", "kg", 9, 8, 3400, "fresh", 2, "Freezer 2"],
      ["Mozzarella", "DAIRY-MOZ", "Dairy", "kg", 14, 6, 2100, "fresh", 20, "Cold room"],
      ["Dish soap", "CLN-SOAP", "Cleaning", "l", 12, 5, 450, "dry", null, "Back store"],
    ];
    for (const [
      name,
      sku,
      category,
      unit,
      quantity,
      minimumQuantity,
      cost,
      supplier,
      expiry,
      location,
    ] of items) {
      const item = await prisma.inventoryItem.create({
        data: {
          branchId,
          name,
          sku,
          category,
          unit,
          quantity,
          minimumQuantity,
          cost,
          supplierId: supplier === "dry" ? dry.id : fresh.id,
          expiryDate: expiry === null ? null : daysFromNow(expiry),
          storageLocation: location,
        },
      });
      if (quantity > 0) {
        await prisma.stockTransaction.create({
          data: {
            itemId: item.id,
            branchId,
            type: "PURCHASE",
            quantityChange: quantity,
            quantityAfter: quantity,
            unitCost: cost,
            note: "Opening stock",
          },
        });
      }
    }
  }

  if ((await prisma.promotion.count()) === 0) {
    await prisma.promotion.createMany({
      data: [
        {
          name: "Welcome 10%",
          description: "Ten per cent off your bill — just ask your server.",
          code: "WELCOME10",
          type: "PERCENTAGE",
          value: 10,
          minimumSpend: 3000,
        },
        {
          name: "Weekday happy hour",
          description: "15% off the bill between 4 and 6 pm, Monday to Friday.",
          code: "HAPPY15",
          type: "HAPPY_HOUR",
          value: 15,
          daysOfWeek: [1, 2, 3, 4, 5],
          startTime: "16:00",
          endTime: "18:00",
        },
        {
          name: "Double points weekend",
          description: "Earn twice the loyalty points every Saturday and Sunday.",
          type: "LOYALTY_MULTIPLIER",
          value: 2,
          daysOfWeek: [6, 7],
        },
        {
          name: "Monsoon menu",
          description: "Seasonal dishes inspired by the south-west monsoon.",
          type: "SEASONAL_OFFER",
          value: 0,
        },
      ],
    });
    // Switch loyalty on for the demo so there is something to try.
    await prisma.companySettings.updateMany({ data: { loyaltyEnabled: true } });
  }

  if (customerId) {
    await prisma.customerProfile.upsert({
      where: { userId: customerId },
      update: {},
      create: {
        userId: customerId,
        dietaryPreferences: ["vegetarian"],
        allergies: ["peanuts"],
        preferences: "Likes a quiet corner table.",
      },
    });
    const account = await prisma.loyaltyAccount.findUnique({ where: { userId: customerId } });
    if (!account) {
      const created = await prisma.loyaltyAccount.create({
        data: { userId: customerId, points: 150, lifetimePoints: 150 },
      });
      await prisma.loyaltyTransaction.create({
        data: {
          accountId: created.id,
          type: "ADJUST",
          points: 150,
          balanceAfter: 150,
          note: "Welcome bonus",
        },
      });
    }
  }
}
