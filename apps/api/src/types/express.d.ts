import type { Role } from "@smartdine/shared";

export interface AuthContext {
  userId: string;
  role: Role;
  branchId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      auth?: AuthContext;
    }
  }
}
