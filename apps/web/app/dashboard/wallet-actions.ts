"use server";

import { revalidatePath } from "next/cache";
import { createDeposit, createWithdrawal } from "../../lib/investor/wallet";

function toKobo(value: string): string {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Enter a valid NGN amount");
  const [major, minor = ""] = normalized.split(".");
  const amount = BigInt(major) * 100n + BigInt(minor.padEnd(2, "0"));
  if (amount <= 0n) throw new Error("Amount must be greater than ₦0.00");
  return amount.toString();
}

export async function requestDeposit(formData: FormData) {
  const amount = String(formData.get("amount") ?? "");
  await createDeposit(toKobo(amount));
  revalidatePath("/dashboard");
}

export async function requestWithdrawal(formData: FormData) {
  const amount = String(formData.get("amount") ?? "");
  await createWithdrawal(toKobo(amount));
  revalidatePath("/dashboard");
}
