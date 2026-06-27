/**
 * money.ts
 *
 * Kobo-denominated integer money.
 * All monetary values are stored and transported as integer kobo (bigint).
 * Floats, decimals, zero, and negative values are explicitly rejected.
 *
 * ₦1,000.00 = 100_000n kobo
 */

// ---------------------------------------------------------------------------
// Branded type – prevents raw bigints from being passed as Kobo accidentally
// ---------------------------------------------------------------------------

declare const __kobo: unique symbol;
export type Kobo = bigint & { readonly [__kobo]: true };

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

export type MoneyErrorKind =
  | "FLOAT_INPUT"
  | "ZERO_AMOUNT"
  | "NEGATIVE_AMOUNT"
  | "NON_INTEGER";

export interface MoneyError {
  readonly kind: MoneyErrorKind;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Result helper (used across the ledger domain)
// ---------------------------------------------------------------------------

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Kobo constructors
// ---------------------------------------------------------------------------

/**
 * Creates a Kobo amount from a bigint.
 * Rejects zero and negative values.
 */
export function koboFromBigInt(value: bigint): Result<Kobo, MoneyError> {
  if (value <= 0n) {
    return err({
      kind: value === 0n ? "ZERO_AMOUNT" : "NEGATIVE_AMOUNT",
      message:
        value === 0n
          ? "amountKobo must be greater than 0"
          : `amountKobo must be positive, got ${value}`,
    });
  }
  return ok(value as Kobo);
}

/**
 * Creates a Kobo amount from a JavaScript number.
 * Rejects floats (non-integers), zero, and negatives.
 */
export function koboFromNumber(value: number): Result<Kobo, MoneyError> {
  if (!Number.isSafeInteger(value)) {
    return err({
      kind: "FLOAT_INPUT",
      message: `amountKobo must be a safe integer, got ${value}`,
    });
  }
  if (value <= 0) {
    return err({
      kind: value === 0 ? "ZERO_AMOUNT" : "NEGATIVE_AMOUNT",
      message:
        value === 0
          ? "amountKobo must be greater than 0"
          : `amountKobo must be positive, got ${value}`,
    });
  }
  return ok(BigInt(value) as Kobo);
}

/**
 * Adds two Kobo amounts.
 */
export function addKobo(a: Kobo, b: Kobo): Kobo {
  return (a + b) as Kobo;
}

/**
 * Type guard: checks that a bigint is a valid Kobo (> 0).
 */
export function isValidKobo(value: bigint): value is Kobo {
  return value > 0n;
}
