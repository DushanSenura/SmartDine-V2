import { randomUUID } from "node:crypto";

import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { corsOptions } from "./config/cors";
import { logger } from "./config/logger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { globalRateLimiter } from "./middleware/rateLimit";
import { requestContext } from "./middleware/requestContext";
import { apiRouter } from "./routes";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  // Behind nginx / a load balancer in production; needed for correct client IPs.
  app.set("trust proxy", 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        // Only echo a client-supplied id when it is short and plain; otherwise make our own.
        const supplied = req.headers["x-request-id"]?.toString();
        const id = supplied && /^[\w.-]{1,64}$/.test(supplied) ? supplied : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      // Health probes run every few seconds; keep them out of the log. Client errors are warnings.
      autoLogging: { ignore: (req) => req.url?.startsWith("/api/v2/health") ?? false },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      // One compact line per request instead of the full header dump.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url.split("?")[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(requestContext);
  app.use(globalRateLimiter);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api/v2", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
