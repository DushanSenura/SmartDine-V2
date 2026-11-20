-- Bills raised for orders that a customer placed themselves now carry that customer from the start.
-- Backfill the ones raised before that rule existed, so their invoices appear in the customer's account.
UPDATE "bills" AS b
SET "customerId" = o."placedByUserId"
FROM "orders" AS o
WHERE b."orderId" = o."id"
  AND b."customerId" IS NULL
  AND o."placedByUserId" IS NOT NULL;
