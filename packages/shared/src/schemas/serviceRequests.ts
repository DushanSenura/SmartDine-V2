import { z } from "zod";

import {
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_TYPES,
  type ServiceRequestStatus,
  type ServiceRequestType,
} from "../constants/serviceRequests";

export const createServiceRequestSchema = z.object({
  branchId: z.uuid().optional(),
  tableId: z.uuid(),
  type: z.enum(SERVICE_REQUEST_TYPES),
  note: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestSchema>;

export const serviceRequestListQuerySchema = z.object({
  branchId: z.uuid().optional(),
  status: z.enum(SERVICE_REQUEST_STATUSES).default("OPEN"),
});
export type ServiceRequestListQuery = z.infer<typeof serviceRequestListQuerySchema>;

export interface ServiceRequestDto {
  id: string;
  branchId: string;
  tableId: string;
  tableNumber: string;
  type: ServiceRequestType;
  note: string | null;
  status: ServiceRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
}
