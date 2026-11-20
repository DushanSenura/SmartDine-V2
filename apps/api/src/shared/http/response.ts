import type { ApiSuccess } from "@smartdine/shared";
import type { Response } from "express";

/** Sends the standard `{ success, data, meta }` envelope. */
export function sendSuccess<TData, TMeta extends object = Record<string, never>>(
  res: Response,
  data: TData,
  options: { status?: number; meta?: TMeta } = {},
) {
  const body: ApiSuccess<TData, TMeta> = {
    success: true,
    data,
    meta: options.meta ?? ({} as TMeta),
  };
  return res.status(options.status ?? 200).json(body);
}
