import bcrypt from "bcrypt";

import { env } from "../../config/env";

export const hashPassword = (password: string) => bcrypt.hash(password, env.BCRYPT_ROUNDS);

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** Compared against when the email is unknown so login timing does not reveal which emails exist. */
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", env.BCRYPT_ROUNDS);
