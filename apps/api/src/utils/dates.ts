/** Parses `YYYY-MM-DD` into a UTC-midnight Date suitable for Prisma `@db.Date` columns. */
export const parseDateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export const formatDateOnly = (value: Date): string => value.toISOString().slice(0, 10);
