// ── Guest service requests ────────────────────────────────────────

/** What a guest at a table asked for. Staff log it; the table's waiter sees it at once. */
export const SERVICE_REQUEST_TYPES = [
  "ASSISTANCE",
  "WATER",
  "CUTLERY",
  "CLEAN_TABLE",
  "BILL",
  "OTHER",
] as const;
export type ServiceRequestType = (typeof SERVICE_REQUEST_TYPES)[number];

export const SERVICE_REQUEST_TYPE_LABELS: Record<ServiceRequestType, string> = {
  ASSISTANCE: "Needs assistance",
  WATER: "Water",
  CUTLERY: "Cutlery",
  CLEAN_TABLE: "Clean the table",
  BILL: "Wants the bill",
  OTHER: "Other request",
};

export const SERVICE_REQUEST_STATUSES = ["OPEN", "RESOLVED"] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];
