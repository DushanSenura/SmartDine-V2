export const AVAILABILITY_STATUSES = ["AVAILABLE", "SOLD_OUT", "TEMPORARILY_UNAVAILABLE"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const MEAL_PERIODS = ["BREAKFAST", "LUNCH", "DINNER"] as const;
export type MealPeriod = (typeof MEAL_PERIODS)[number];

/** Local-time windows (branch timezone) used to decide which meal period is current. */
export const MEAL_PERIOD_WINDOWS: Record<MealPeriod, { from: number; to: number }> = {
  BREAKFAST: { from: 5, to: 11 },
  LUNCH: { from: 11, to: 16 },
  DINNER: { from: 16, to: 24 },
};

export const KITCHEN_STATIONS = [
  "MAIN_KITCHEN",
  "GRILL",
  "PIZZA",
  "DESSERT",
  "BEVERAGE",
  "BAR",
] as const;
export type KitchenStation = (typeof KITCHEN_STATIONS)[number];

export const SPICE_LEVELS = [0, 1, 2, 3] as const;

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Available",
  SOLD_OUT: "Sold out",
  TEMPORARILY_UNAVAILABLE: "Temporarily unavailable",
};

export const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};
