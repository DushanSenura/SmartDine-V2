import { AsyncLocalStorage } from "node:async_hooks";

import type { RequestHandler } from "express";

interface RequestInfo {
  ip: string | null;
}

const storage = new AsyncLocalStorage<RequestInfo>();

/** Makes per-request facts (the client IP) available to code that has no `req`, e.g. the audit log. */
export const requestContext: RequestHandler = (req, _res, next) => {
  storage.run({ ip: req.ip ?? null }, next);
};

export const currentRequest = (): RequestInfo | undefined => storage.getStore();
