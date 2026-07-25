import { hash, verify } from "@node-rs/argon2";

/** Argon2id, the library's default algorithm/parameters. */
export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword);
}

export async function verifyPassword(passwordHash: string, plainPassword: string): Promise<boolean> {
  return verify(passwordHash, plainPassword);
}
