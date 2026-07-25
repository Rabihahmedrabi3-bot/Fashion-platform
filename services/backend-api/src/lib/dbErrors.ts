function hasPgErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

/** Postgres error code 23505 = unique_violation. */
export function isUniqueViolation(error: unknown): boolean {
  return hasPgErrorCode(error, "23505");
}

/** Postgres error code 23503 = foreign_key_violation - e.g. deleting a category still assigned to products. */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasPgErrorCode(error, "23503");
}
