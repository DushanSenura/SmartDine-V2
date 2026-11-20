import type { CorsOptions } from "cors";

import { env } from "./env";

/** Only explicitly configured origins may call the API from a browser. Credentials allowed for refresh cookies. */
export const corsOptions: CorsOptions = {
  origin: env.CORS_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 600,
};
