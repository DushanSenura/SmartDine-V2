import type { ErrorCode } from "../constants/errorCodes";

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<TData, TMeta = Record<string, never>> {
  success: true;
  data: TData;
  meta: TMeta;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  /** Field-level or contextual details, e.g. validation issues. */
  details?: unknown;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<TData, TMeta = Record<string, never>> =
  ApiSuccess<TData, TMeta> | ApiFailure;
